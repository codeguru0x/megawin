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
  async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const col = await this.getCollection();
    const ops = lines.map((doc) => ({
      updateOne: {
        filter: { entryId: doc.entryId, lineIndex: doc.lineIndex },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    }));

    await col.bulkWrite(ops, { ordered: false });
  }

  /**
   * Lấy lines của 1 entry, sort theo lineIndex.
   * Dùng cho player xem chi tiết lines + kết quả match.
   */
  async getLinesByEntryId(
    entryId: string,
    options: { page?: number; size?: number } = {}
  ): Promise<{ lines: TicketLineDoc[]; total: number }> {
    const { page = 1, size = 50 } = options;
    const col = await this.getCollection();
    const filter = { entryId: new ObjectId(entryId) };

    const [lines, total] = await Promise.all([
      col
        .find(filter)
        .sort({ lineIndex: 1 })
        .skip((page - 1) * size)
        .limit(size)
        .toArray(),
      col.countDocuments(filter),
    ]);

    return { lines: lines as unknown as TicketLineDoc[], total };
  }
}
