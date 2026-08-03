/**
 * Max 3D Pro – Draw Account Stats Repository
 *
 * Collection: max3dpro_draw_account_stats — 1 doc/(draw × account).
 *
 * ĐỌC:
 * - `getTopAccounts(drawId, k)` → derive `topAccounts` bằng `sort({amount:-1}).limit(k)`.
 * - `countPlayers(drawId)` → số người chơi distinct (index-only count).
 * - `getByAccount` → outstanding theo player/kỳ (link từ alert large_bet).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 *
 * ## Vì sao không nuôi mảng `topAccounts` trong stats doc?
 *
 * `amount` là metric TÍCH LUỸ. Mảng top-K phải seed lại mỗi tick, nên account rơi khỏi
 * top-K sẽ **mất toàn bộ lịch sử** → tổng hụt, xếp hạng sai, drift tỷ lệ thuận số người
 * chơi và KHÔNG tự sửa (p0-01 §1).
 *
 * TTL index `{ createdAt: 1 }` 90 ngày (tạo thủ công theo `MAX3D_PRO_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type {
  Max3dproDrawAccountStatsDoc,
  Max3dproDrawAccountStatsEntity,
} from "@megawin/game-max3dpro/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { AccountStatsMapper } from "../mappers/account-stats-mapper";
import type { Max3dproAccountStatsDelta } from "./types";

const f = docPath<Max3dproDrawAccountStatsDoc>();

export class AccountStatsRepository extends BaseRepo<
  Max3dproDrawAccountStatsEntity,
  AccountStatsMapper
> {
  constructor() {
    super({
      collName: Max3dproCollections.AccountStats,
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
  async getTopAccounts(drawId: string, k: number): Promise<Max3dproDrawAccountStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { amount: -1 }, limit: k });
  }

  /** Số người chơi distinct trong kỳ — 1 doc/account nên count = số người. */
  async countPlayers(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  /** Tích luỹ cược của 1 account trong kỳ — drill-down outstanding từ alert. */
  async getByAccount(
    drawId: string,
    accountId: string,
  ): Promise<Max3dproDrawAccountStatsEntity | null> {
    return await this.findOne({ drawId, accountId });
  }

  /**
   * Cộng delta tích luỹ theo account của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `username` là field duy nhất `$set` (snapshot mới nhất thắng). Filter có
   * `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì upsert đâm unique index
   * → 11000 = no-op ({@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta account gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: Max3dproAccountStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) {
      return;
    }

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
