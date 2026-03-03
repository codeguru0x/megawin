/**
 * Lotto 5/35 – Line Repository
 *
 * Collection: lotto535TicketLines
 *
 * Lines tạo tại settle time, immutable sau insert.
 * upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry.
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import type { TicketLineDoc } from "@megawin/game-lotto535/entities";
import { ObjectId } from "mongodb";
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

    for (let i = 0; i < ops.length; i += LineRepository.BULK_CHUNK_SIZE) {
      const chunk = ops.slice(i, i + LineRepository.BULK_CHUNK_SIZE);
      await this.bulkWrite(chunk, { ordered: false });
    }
  }

  /**
   * Lấy lines của 1 entry, sort theo lineIndex.
   * Dùng cho player xem chi tiết lines + kết quả match.
   */
  async getLinesByEntryId(
    entryId: string,
    options: { size?: number; cursor?: number } = {}
  ): Promise<{ lines: TicketLineDoc[]; hasMore: boolean }> {
    const { size = 50, cursor } = options;
    const col = await this.getCollection();
    const filter: Record<string, unknown> = { entryId: new ObjectId(entryId) };

    if (cursor != null) {
      filter.lineIndex = { $gt: cursor };
    }

    const lines = await col
      .find(filter)
      .sort({ lineIndex: 1 })
      .limit(size + 1)
      .toArray();

    const hasMore = lines.length > size;
    const slice = hasMore ? lines.slice(0, size) : lines;

    return { lines: slice as unknown as TicketLineDoc[], hasMore };
  }
}
