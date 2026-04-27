/**
 * Mega 6/45 – Line Repository
 *
 * Collection: mega645_ticket_lines
 *
 * Lines tạo tại settle time, immutable sau insert.
 * upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry.
 */

import { Mega645Collections, PrizeTier } from "@megawin/game-mega645/entities";
import type { TicketLineDoc } from "@megawin/game-mega645/entities";
import { chunk } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

export class LineRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: Mega645Collections.TicketLines });
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
    const filter: Record<string, unknown> = { entryId: new ObjectId(entryId) };

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
   * Patch winAmount cho tất cả lines trúng Jackpot trong draw.
   *
   * Idempotent: chỉ update lines có matchResult.tier = "jackpot" và winAmount = 0
   * (chưa được patch lần nào). Lines đã có winAmount > 0 sẽ bị skip.
   */
  async patchJackpotLineWinAmount(drawId: string, jackpotPerWinner: number): Promise<number> {
    const result = await this.updateMany(
      {
        drawId,
        "matchResult.tier": PrizeTier.Jackpot,
        // Chỉ update lines có winAmount = 0 tránh cập nhật lại
        "matchResult.winAmount": 0,
      },
      {
        $set: { "matchResult.winAmount": jackpotPerWinner },
      },
    );
    return result.modifiedCount;
  }

  /**
   * Tìm tất cả lines trúng Jackpot trong draw.
   * Dùng để lấy betCount của từng line JP cho PatchJackpotPrize.
   */
  async findJackpotLinesByDrawId(
    drawId: string,
  ): Promise<Array<{ entryId: string; betCount: number }>> {
    const docs = await this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": PrizeTier.Jackpot,
      },
      {
        projection: {
          entryId: 1,
          betCount: 1,
        },
      },
    );
    return docs.map((d: any) => ({
      entryId: typeof d.entryId === "string" ? d.entryId : (d.entryId as ObjectId).toHexString(),
      betCount: d.betCount as number,
    }));
  }

  /**
   * Patch winAmount cho lines trúng JP theo betCount riêng từng line.
   *
   * jackpotPerUnit × betCount (từ line doc) = winAmount thực tế.
   * Idempotent: chỉ update lines có winAmount = 0.
   */
  async patchJackpotLineWinAmountPerLine(
    drawId: string,
    jackpotPerUnit: number,
    betCountByEntry: Map<string, number>,
  ): Promise<number> {
    // Load lines JP chưa patch
    const jpLines = await this.findManyAsDocuments(
      {
        drawId,
        "matchResult.tier": PrizeTier.Jackpot,
        "matchResult.winAmount": 0,
      },
      {
        projection: { _id: 1, entryId: 1, betCount: 1 },
      },
    );

    if (jpLines.length === 0) return 0;

    const ops = jpLines.map((line: any) => {
      const entryId =
        typeof line.entryId === "string" ? line.entryId : (line.entryId as ObjectId).toHexString();
      const betCount = betCountByEntry.get(entryId) ?? (line.betCount as number);
      return {
        updateOne: {
          filter: {
            _id: line._id,
            "matchResult.winAmount": 0,
          },
          update: {
            $set: { "matchResult.winAmount": jackpotPerUnit * betCount },
          },
        },
      };
    });

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }
}
