/**
 * Lotto 5/35 – Line Repository
 *
 * Collection: lotto535TicketLines
 *
 * Lines tạo tại settle time (SettleEntries — step 2).
 * Jackpot lines ban đầu có winAmount = 0, được patch bởi
 * PatchJackpotPrize (step 4a) qua patchJackpotLineWinAmount().
 * upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry.
 */

import { Lotto535Collections, PrizeTier } from "@megawin/game-lotto535/entities";
import type { TicketLineDoc } from "@megawin/game-lotto535/entities";
import { chunk } from "@megawin/shared/utils";
import { BaseRepo } from "./base-repo";

export class LineRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: Lotto535Collections.TicketLines });
  }

  /**
   * Idempotent bulk upsert lines cho 1 entry.
   *
   * Dùng bulkWrite + $setOnInsert: nếu doc (entryId, lineIndex) đã tồn tại → skip.
   * Chạy lại bao nhiêu lần cũng cho kết quả giống nhau, không duplicate, không error.
   */
  private static readonly BULK_CHUNK_SIZE = 500;

  async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const ops = lines.map((doc) => ({
      updateOne: {
        filter: { entryId: doc.entryId, lineIndex: doc.lineIndex },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }));

    for (const batch of chunk(ops, LineRepository.BULK_CHUNK_SIZE)) {
      await this.bulkWrite(batch, { ordered: false });
    }
  }

  /**
   * Lấy lines của 1 entry, sort theo lineIndex.
   * Dùng cho player xem chi tiết lines + kết quả match.
   */
  async getLinesByEntryId(
    entryId: string,
    options: { size?: number; cursor?: number } = {},
  ): Promise<{ lines: TicketLineDoc[]; hasMore: boolean }> {
    const { size = 50, cursor } = options;
    const filter: Record<string, unknown> = { entryId };

    if (cursor != null) {
      filter.lineIndex = { $gt: cursor };
    }

    const lines = await this.findManyAsDocuments(filter, {
      sort: { lineIndex: 1 },
      limit: size + 1,
    });

    const hasMore = lines.length > size;
    const slice = hasMore ? lines.slice(0, size) : lines;

    return { lines: slice as unknown as TicketLineDoc[], hasMore };
  }

  /**
   * Lấy tất cả winning lines của 1 draw theo tier — dùng để tính betUnitsByEntry cho Split bonus.
   *
   * Chỉ lấy entryId, betCount để build map betUnits per entry per tier.
   * Được gọi bởi ApplySplitBonuses (step 4b).
   */
  async getWinningLinesForTier(
    drawId: string,
    tier: string,
  ): Promise<Array<{ entryId: unknown; betCount: number }>> {
    return this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": tier,
      },
      { projection: { _id: 0, entryId: 1, betCount: 1 } },
    ) as Promise<Array<{ entryId: unknown; betCount: number }>>;
  }

  /**
   * Lấy tất cả JP lines của 1 draw — dùng để tính totalBetUnits cho Jackpot split.
   *
   * Chỉ lấy _id, entryId, betCount để tính tổng bet units.
   * Được gọi bởi PatchJackpotPrize (step 4a).
   */
  async getJackpotLinesForDraw(
    drawId: string,
  ): Promise<Array<{ _id: unknown; entryId: unknown; betCount: number }>> {
    return this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": PrizeTier.Jackpot,
      },
      { projection: { _id: 1, entryId: 1, betCount: 1 } },
    ) as Promise<Array<{ _id: unknown; entryId: unknown; betCount: number }>>;
  }

  /**
   * Patch winAmount vào lines trúng Jackpot cho 1 draw.
   *
   * Được gọi bởi PatchJackpotPrize (step 4a) sau khi tính jackpotPerUnit.
   * Idempotent: chỉ update lines có matchResult.tier = "jackpot" và winAmount = 0.
   *
   * Quy tắc Vietlott: winAmount = jackpotPerUnit × line.betCount
   * Mỗi line trúng JP nhận tiền tỷ lệ betCount — không chia đều flat per line.
   *
   * @param jackpotPerUnit - Tiền JP cho 1 đơn vị tham gia (1 line × 1 betCount)
   */
  async patchJackpotLineWinAmount(drawId: string, jackpotPerUnit: number): Promise<number> {
    // Lấy các lines trúng JP chưa patch để tính winAmount riêng theo betCount
    const jpLines = await this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": PrizeTier.Jackpot,
        "matchResult.winAmount": 0,
      },
      { projection: { _id: 1, betCount: 1 } },
    );

    if (jpLines.length === 0) return 0;

    const ops = jpLines.map((line) => {
      // betCount per line — luôn có giá trị (required field).
      const betCount = (line as any).betCount;
      const winAmount = jackpotPerUnit * betCount;

      return {
        updateOne: {
          filter: {
            _id: line._id,
            "matchResult.winAmount": 0,
          },
          update: {
            $set: {
              "matchResult.winAmount": winAmount,
            },
          },
        },
      };
    });

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }
}
