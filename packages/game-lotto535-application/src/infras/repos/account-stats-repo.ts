/**
 * Lotto 5/35 – Draw Account Stats Repository
 *
 * Collection: lotto535_draw_account_stats — 1 doc/(draw × account).
 *
 * ĐỌC:
 * - `findTopByAmount(drawId, k)` → derive `topAccounts` bằng `sort({amount:-1}).limit(k)`.
 * - `countByDrawId(drawId)` → số người chơi distinct (index-only count).
 * - `getByAccount` → outstanding theo player/kỳ (link từ alert `large_bet`).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 *
 * Port nguyên kiến trúc từ Power 6/55 (`account-stats-repo.ts`) — không có khác biệt đặc
 * thù Lotto 5/35 (shape thuần, không phụ thuộc số chiều số hay play type).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `LOTTO535_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import type { Lotto535DrawAccountStatsDoc, Lotto535DrawAccountStatsEntity } from "@megawin/game-lotto535/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { AccountStatsMapper } from "../mappers/account-stats-mapper";
import type { AccountStatsDelta } from "./types";

const f = docPath<Lotto535DrawAccountStatsDoc>();

export class AccountStatsRepository extends BaseRepo<Lotto535DrawAccountStatsEntity, AccountStatsMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.DrawAccountStats,
      dataMapper: new AccountStatsMapper(),
    });
  }

  /**
   * Top account theo tiền cược — nguồn `topAccounts` cho ops snapshot.
   *
   * Khớp `idx_drawId_amount` → IXSCAN dừng đúng `k`, chính xác tuyệt đối (không drift).
   *
   * @param drawId - Kỳ cần lấy.
   * @param k - `ops.stats.topAccountsK`.
   */
  async findTopByAmount(drawId: string, k: number): Promise<Lotto535DrawAccountStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { amount: -1 }, limit: k });
  }

  /**
   * Số người chơi distinct trong kỳ — 1 doc/account nên count = số người.
   *
   * Count trên index `{drawId, amount}` → index-only.
   */
  async countByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  /** Tích luỹ cược của 1 account trong kỳ — drill-down outstanding từ alert. */
  async getByAccount(drawId: string, accountId: string): Promise<Lotto535DrawAccountStatsEntity | null> {
    return await this.findOne({ drawId, accountId });
  }

  /**
   * Cộng delta tích luỹ theo account của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `username` là field duy nhất `$set` (snapshot mới nhất thắng). Filter có
   * `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì upsert đâm unique index
   * → 11000 = no-op (xem {@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta account gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: AccountStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = deltas.map((delta) => ({
      updateOne: {
        filter: {
          drawId: delta.drawId,
          accountId: delta.accountId,
          [f("lastEntryId")]: { $lt: batchMaxId },
        },
        update: {
          $inc: {
            [f("amount")]: delta.amount,
            [f("entries")]: delta.entries,
            [f("sets")]: delta.sets,
          },
          $set: {
            [f("username")]: delta.username,
            [f("lastEntryId")]: batchMaxId,
            [f("updatedAt")]: now,
          },
          $setOnInsert: { [f("createdAt")]: now },
        },
        upsert: true,
      },
    }));

    await runDeltaBulkWrite(async () => await this.bulkWrite(ops, { ordered: false }));
  }
}
