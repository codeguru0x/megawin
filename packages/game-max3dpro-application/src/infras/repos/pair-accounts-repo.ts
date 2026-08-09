/**
 * Max 3D Pro – Draw Pair Accounts Repository
 *
 * Collection: max3dpro_draw_pair_accounts — 1 doc/(draw × pairKey × account).
 *
 * Tách khỏi `max3dpro_draw_pair_stats` để **mảng người chơi không nằm trong document**:
 * mảng object phình theo số người chơi → chạm BSON 16MB và buộc read-modify-write mỗi tick.
 * Cặp doc chỉ còn counter vô hướng `accountCount` (đếm distinct từ collection này).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 * ĐỌC: `countAccountsByPair` — chỉ để đếm distinct, không đọc theo tick khác.
 *
 * ## ⚠️ pairKey ORDERED — KHÔNG sort/normalize (cùng convention pair_stats).
 *
 * TTL index `{ createdAt: 1 }` 90 ngày (tạo thủ công theo `MAX3D_PRO_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { Max3dproDrawPairAccountDoc, Max3dproDrawPairAccountEntity } from "@megawin/game-max3dpro/entities";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type { AnyBulkWriteOperation, Document } from "mongodb";

import { PairAccountMapper } from "../mappers/pair-account-mapper";
import { BaseRepo } from "./base-repo";
import type { Max3dproPairStatsDelta } from "./types";

const f = docPath<Max3dproDrawPairAccountDoc>();

export class PairAccountsRepository extends BaseRepo<Max3dproDrawPairAccountEntity, PairAccountMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.PairAccounts,
      dataMapper: new PairAccountMapper(),
    });
  }

  /**
   * Đếm số account distinct của từng cặp trong kỳ — nguồn cho `accountCount` (counter phái
   * sinh ở `max3dpro_draw_pair_stats`).
   *
   * Trả giá trị **TUYỆT ĐỐI** để phía ghi dùng `$set` — idempotent và tự hội tụ. `$group`
   * chạy trên index prefix `drawId,pairKey` và giới hạn ở các cặp vừa bị chạm trong batch →
   * chi phí bị chặn bởi batch, không phụ thuộc tổng số cặp của kỳ.
   *
   * @param drawId - Kỳ.
   * @param pairKeys - Các cặp vừa có delta trong batch (không rỗng).
   */
  async countAccountsByPair(drawId: string, pairKeys: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (pairKeys.length === 0) {
      return counts;
    }

    const rows = await this.aggregate([
      { $match: { drawId, pairKey: { $in: pairKeys } } },
      { $group: { _id: `$${f("pairKey")}`, accounts: { $sum: 1 } } },
    ]);

    for (const row of rows) {
      counts.set(row._id as string, row.accounts as number);
    }

    return counts;
  }

  /**
   * Cộng delta per-account của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * Filter có `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì upsert đâm
   * unique index → 11000 = no-op ({@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta pair (mỗi delta chứa map account).
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: Max3dproPairStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) {
      return;
    }

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];

    for (const delta of deltas) {
      for (const account of delta.accounts.values()) {
        ops.push({
          updateOne: {
            filter: {
              drawId: delta.drawId,
              pairKey: delta.pairKey,
              accountId: account.accountId,
              [f("lastEntryId")]: { $lt: batchMaxId },
            },
            update: {
              $inc: { [f("units")]: account.units, [f("amount")]: account.amount },
              $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: now },
              $setOnInsert: { [f("createdAt")]: now },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length === 0) {
      return;
    }

    await runDeltaBulkWrite(async () => await this.bulkWrite(ops, { ordered: false }));
  }
}
