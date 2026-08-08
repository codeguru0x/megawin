/**
 * Max 3D – Draw Pair Accounts Repository
 *
 * Collection: max3d_draw_pair_accounts — 1 doc/(draw × pairKey × account).
 *
 * Tách khỏi `max3d_draw_pair_stats` để mảng người chơi không nằm trong document (giống
 * Keno `ComboAccountsRepository`) — chỉ dùng để đếm distinct account cho `accountCount`
 * phái sinh, KHÔNG có UI drill-down riêng cho collection này.
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert (thực chất chỉ `$setOnInsert` — xem JSDoc method),
 * idempotent theo watermark `lastEntryId`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Max3dCollections } from "@megawin/game-max3d/entities";
import type { Max3dDrawPairAccountDoc, Max3dDrawPairAccountEntity } from "@megawin/game-max3d/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { PairAccountMapper } from "../mappers/pair-account-mapper";
import type { PairStatsDelta } from "./types";

const f = docPath<Max3dDrawPairAccountDoc>();

export class PairAccountsRepository extends BaseRepo<Max3dDrawPairAccountEntity, PairAccountMapper> {
  constructor() {
    super({
      collName: Max3dCollections.PairAccounts,
      dataMapper: new PairAccountMapper(),
    });
  }

  /**
   * Đếm số account distinct của từng cặp trong kỳ — nguồn cho `accountCount` (counter
   * phái sinh ở `max3d_draw_pair_stats`).
   *
   * Trả giá trị **TUYỆT ĐỐI** để phía ghi dùng `$set` — idempotent và tự hội tụ. Cách
   * `$inc` theo "account mới trong tick" có lỗ hổng không sửa được: crash giữa lệnh ghi
   * pair_accounts và lệnh cộng counter thì lần retry thấy doc đã tồn tại → không còn
   * "account mới" nào → counter thiếu VĨNH VIỄN.
   *
   * `$group` chạy trên index `idx_drawId_pairKey_accountId_unique` (prefix `drawId,pairKey`)
   * và chỉ giới hạn ở các cặp vừa bị chạm trong batch.
   *
   * @param drawId - Kỳ.
   * @param pairKeys - Các cặp vừa có delta trong batch (không rỗng).
   */
  async countAccountsByPair(drawId: string, pairKeys: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (pairKeys.length === 0) return counts;

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
   * Cộng delta per-account của 1 tick — upsert, 1 bulkWrite cho cả batch.
   *
   * Doc này KHÔNG có field số để `$inc` (chỉ dùng đếm distinct) — `$setOnInsert` để tránh
   * ghi lại nếu account đã tồn tại. Filter có `lastEntryId: { $lt: batchMaxId }` → idempotent;
   * batch đã áp thì upsert đâm unique index → 11000 = no-op (xem {@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta pair (mỗi delta chứa set accountIds).
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: PairStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];

    for (const delta of deltas) {
      for (const accountId of delta.accountIds) {
        ops.push({
          updateOne: {
            filter: {
              drawId: delta.drawId,
              pairKey: delta.pairKey,
              accountId,
              [f("lastEntryId")]: { $lt: batchMaxId },
            },
            update: {
              $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: now },
              $setOnInsert: { [f("createdAt")]: now },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length === 0) return;

    await runDeltaBulkWrite(async () => await this.bulkWrite(ops, { ordered: false }));
  }
}
