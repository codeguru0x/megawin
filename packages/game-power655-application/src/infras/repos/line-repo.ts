/**
 * Power 6/55 – Line Repository
 *
 * Collection: power655TicketLines
 *
 * Lines tạo tại settle time, immutable sau insert.
 * upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type { TicketLineDoc } from "@megawin/game-power655/entities";
import { chunk } from "@megawin/shared/utils";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

export class LineRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: Power655Collections.TicketLines });
  }

  /**
   * Idempotent bulk upsert lines cho 1 entry.
   * Dùng bulkWrite + $setOnInsert: nếu doc (entryId, lineIndex) đã tồn tại → skip.
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
   * Patch winAmount cho tất cả lines trúng jackpotTier trong draw.
   *
   * Idempotent: chỉ update lines có matchResult.tier = jackpotTier và matchResult.winAmount = 0.
   *
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   */
  async patchJackpotLineWinAmount(
    drawId: string,
    jackpotTier: string,
    jackpotPerWinner: number,
  ): Promise<number> {
    const result = await this.updateMany(
      {
        drawId,
        "matchResult.tier": jackpotTier,
        "matchResult.winAmount": 0,
      },
      {
        $set: { "matchResult.winAmount": jackpotPerWinner },
      },
    );
    return result.modifiedCount;
  }

  /**
   * Lấy tất cả lines trúng jackpotTier trong draw.
   * Dùng để tính tổng betCount và patch winAmount theo tỷ lệ (không chia đều).
   *
   * Trả về ObjectId entryId + betCount của mỗi line trúng.
   */
  async getJackpotWinningLines(
    drawId: string,
    jackpotTier: string,
  ): Promise<Array<{ lineId: string; entryId: string; betCount: number }>> {
    const col = await this.getCollection();
    const docs = await col
      .find(
        {
          drawId,
          "matchResult.tier": jackpotTier,
          "matchResult.winAmount": 0,
        },
        { projection: { _id: 1, entryId: 1, betCount: 1 } },
      )
      .toArray();

    return docs.map((d) => ({
      lineId: d._id.toHexString(),
      entryId: d.entryId instanceof ObjectId ? d.entryId.toHexString() : String(d.entryId),
      betCount: (d.betCount as number | undefined) ?? 1,
    }));
  }

  /**
   * Patch winAmount cho từng line trúng JP theo tỷ lệ betCount.
   *
   * Thay vì set cùng 1 amount uniform, mỗi line có winAmount riêng = jackpotPerUnit × betCount.
   * Idempotent: chỉ update lines có winAmount = 0.
   */
  async patchJackpotLinesPerUnit(
    drawId: string,
    jackpotTier: string,
    jackpotPerUnit: number,
  ): Promise<number> {
    // Lấy danh sách lines trúng JP + betCount của từng line
    const winningLines = await this.getJackpotWinningLines(drawId, jackpotTier);
    if (winningLines.length === 0) return 0;

    const col = await this.getCollection();

    const ops = winningLines.map((line) => {
      const winAmount = jackpotPerUnit * line.betCount;
      return {
        updateOne: {
          filter: {
            _id: new ObjectId(line.lineId),
            "matchResult.winAmount": 0,
          },
          update: { $set: { "matchResult.winAmount": winAmount } },
        },
      };
    });

    const result = await this.bulkWrite(ops as any, { ordered: false });
    return result.modifiedCount;
  }
}
