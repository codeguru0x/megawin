/**
 * Keno – Draw Combo Accounts Repository
 *
 * Collection: keno_draw_combo_accounts — 1 doc/(draw × combo × account).
 *
 * Tách khỏi `keno_draw_combo_stats` để **mảng người chơi không nằm trong document**: mảng
 * object phình theo số người chơi (không phải hằng số nghiệp vụ) → chạm BSON 16MB khi 1
 * combo hot có ~100k account, và buộc read-modify-write full array mỗi tick (p2-01 R1,
 * mongodb.mdc §8.1).
 *
 * ĐỌC: `listByCombo` — chỉ khi staff/player drill-down 1 combo cụ thể, KHÔNG đọc theo tick.
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo `KENO_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { KenoDrawComboAccountDoc, KenoDrawComboAccountEntity } from "@megawin/game-keno/entities";
import { KenoCollections } from "@megawin/game-keno/entities";
import type { AnyBulkWriteOperation, Document } from "mongodb";

import { ComboAccountMapper } from "../mappers/combo-account-mapper";
import { BaseRepo } from "./base-repo";
import type { ComboStatsDelta } from "./types";

const f = docPath<KenoDrawComboAccountDoc>();

export class ComboAccountsRepository extends BaseRepo<KenoDrawComboAccountEntity, ComboAccountMapper> {
  constructor() {
    super({
      collName: KenoCollections.ComboAccounts,
      dataMapper: new ComboAccountMapper(),
    });
  }

  /**
   * Danh sách account đã cược 1 combo — drill-down staff (`get-combo-lookup`).
   *
   * `limit` bắt buộc: combo hot có thể có rất nhiều account, không được để `findMany` cắt
   * ngầm ở 500 mà UI vẫn tưởng đủ. Sort `amount desc` để `limit` giữ đúng phần quan trọng.
   *
   * @param drawId - Kỳ.
   * @param comboKey - Khoá combo.
   * @param limit - Trần số account trả về.
   */
  async listByCombo(drawId: string, comboKey: string, limit: number): Promise<KenoDrawComboAccountEntity[]> {
    return await this.findMany({ drawId, comboKey }, { sort: { amount: -1 }, limit });
  }

  /**
   * Đếm số account distinct của từng combo trong kỳ — nguồn cho `accountCount` (counter
   * phái sinh ở `keno_draw_combo_stats`).
   *
   * Trả giá trị **TUYỆT ĐỐI** thay vì "số account mới trong tick" (`upsertedIds`) để phía
   * ghi dùng `$set` — idempotent và tự hội tụ. Cách cũ (`$inc` theo `upsertedIds`) có lỗ
   * hổng không sửa được: crash giữa lệnh ghi combo_accounts và lệnh cộng counter thì lần
   * retry thấy doc đã tồn tại → không còn "account mới" nào → counter thiếu VĨNH VIỄN.
   *
   * `$group` chạy trên index `idx_drawId_comboKey_accountId_unique` (prefix `drawId,comboKey`)
   * và chỉ giới hạn ở các combo vừa bị chạm trong batch → chi phí bị chặn bởi `READ_BATCH`,
   * không phụ thuộc tổng số combo của kỳ.
   *
   * @param drawId - Kỳ.
   * @param comboKeys - Các combo vừa có delta trong batch (không rỗng).
   */
  async countAccountsByCombo(drawId: string, comboKeys: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (comboKeys.length === 0) return counts;

    const rows = await this.aggregate([
      { $match: { drawId, comboKey: { $in: comboKeys } } },
      { $group: { _id: `$${f("comboKey")}`, accounts: { $sum: 1 } } },
    ]);

    for (const row of rows) {
      counts.set(row._id as string, row.accounts as number);
    }

    return counts;
  }

  /**
   * Cộng delta per-account của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `username` là field DUY NHẤT `$set` (snapshot mới nhất thắng); `sets`/`amount` dùng
   * `$inc`. Filter có `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì
   * upsert đâm unique index → 11000 = no-op (xem {@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta combo (mỗi delta chứa map account).
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: ComboStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];

    for (const delta of deltas) {
      for (const account of delta.accounts.values()) {
        ops.push({
          updateOne: {
            filter: {
              drawId: delta.drawId,
              comboKey: delta.comboKey,
              accountId: account.accountId,
              [f("lastEntryId")]: { $lt: batchMaxId },
            },
            update: {
              $inc: { [f("sets")]: account.sets, [f("amount")]: account.amount },
              $set: {
                [f("username")]: account.username,
                [f("lastEntryId")]: batchMaxId,
                [f("updatedAt")]: now,
              },
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
