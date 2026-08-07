/**
 * Mega 6/45 – Draw Combo Accounts Repository
 *
 * Collection: mega645_draw_combo_accounts — 1 doc/(draw × combo × account).
 *
 * Tách khỏi `mega645_draw_combo_stats` để mảng người chơi không nằm trong document —
 * xem JSDoc `Mega645DrawComboAccountDoc` cho lý giải đầy đủ (port kiến trúc Power 6/55
 * `combo-accounts-repo.ts`).
 *
 * ĐỌC: `listByCombo` — chỉ khi staff/player drill-down 1 combo cụ thể, KHÔNG đọc theo tick.
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `mega645Indexes`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Mega645Collections } from "@megawin/game-mega645/entities";
import type {
  Mega645DrawComboAccountDoc,
  Mega645DrawComboAccountEntity,
} from "@megawin/game-mega645/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { ComboAccountMapper } from "../mappers/combo-account-mapper";
import type { ComboStatsDelta } from "./types";

const f = docPath<Mega645DrawComboAccountDoc>();

export class ComboAccountsRepository extends BaseRepo<
  Mega645DrawComboAccountEntity,
  ComboAccountMapper
> {
  constructor() {
    super({
      collName: Mega645Collections.DrawComboAccounts,
      dataMapper: new ComboAccountMapper(),
    });
  }

  /**
   * Danh sách account đã cược 1 combo — drill-down staff (combo-lookup).
   *
   * `limit` bắt buộc: combo hot có thể có rất nhiều account, không được để `findMany` cắt
   * ngầm ở 500 mà UI vẫn tưởng đủ. Sort `amount desc` để `limit` giữ đúng phần quan trọng.
   *
   * @param drawId - Kỳ.
   * @param comboKey - Khoá combo.
   * @param limit - Trần số account trả về.
   */
  async listByCombo(
    drawId: string,
    comboKey: string,
    limit: number,
  ): Promise<Mega645DrawComboAccountEntity[]> {
    return await this.findMany({ drawId, comboKey }, { sort: { amount: -1 }, limit });
  }

  /**
   * Đếm số account distinct của từng combo trong kỳ — nguồn cho `accountCount` (counter
   * phái sinh ở `mega645_draw_combo_stats`).
   *
   * Trả giá trị TUYỆT ĐỐI thay vì "số account mới trong tick" để phía ghi dùng `$set` —
   * idempotent và tự hội tụ.
   *
   * `$group` chạy trên index `{drawId, comboKey, accountId}` (prefix `drawId,comboKey`) và
   * chỉ giới hạn ở các combo vừa bị chạm trong batch.
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
   * upsert đâm unique index → 11000 = no-op.
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
