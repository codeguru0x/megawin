/**
 * Power 6/55 – Draw Account Stats Repository
 *
 * Collection: power655_draw_account_stats — 1 doc/(draw × account).
 *
 * ĐỌC:
 * - `getTopAccounts(drawId, k)` → derive `topAccounts` bằng `sort({amount:-1}).limit(k)`.
 * - `countPlayers(drawId)` → số người chơi distinct (index-only count).
 * - `getByAccount` → outstanding theo player/kỳ (link từ alert `large_bet`).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 *
 * Port nguyên kiến trúc từ Keno (`account-stats-repo.ts`, xem JSDoc gốc cho lý giải đầy đủ
 * vì sao không nuôi mảng `topAccounts` trong stats doc — metric tích luỹ không seed lại
 * chính xác được).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `POWER655_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type { Power655DrawAccountStatsDoc, Power655DrawAccountStatsEntity } from "@megawin/game-power655/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { AccountStatsMapper } from "../mappers/account-stats-mapper";
import type { AccountStatsDelta } from "./types";

const f = docPath<Power655DrawAccountStatsDoc>();

export class AccountStatsRepository extends BaseRepo<Power655DrawAccountStatsEntity, AccountStatsMapper> {
  constructor() {
    super({
      collName: Power655Collections.DrawAccountStats,
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
  async findTopByAmount(drawId: string, k: number): Promise<Power655DrawAccountStatsEntity[]> {
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
  async getByAccount(drawId: string, accountId: string): Promise<Power655DrawAccountStatsEntity | null> {
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
