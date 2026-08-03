/**
 * Bingo 18 – Draw Account Stats Repository
 *
 * Collection: bingo18_draw_account_stats — 1 doc/(draw × account).
 *
 * ĐỌC:
 * - `getTopAccounts(drawId, k)` → derive `topAccounts` bằng `sort({amount:-1}).limit(k)`.
 * - `countPlayers(drawId)` → số người chơi distinct (index-only count) — KPI mà stats doc
 *   trước đây KHÔNG có (chỉ suy được từ `topAccounts.length`, sai vì cắt ở top-K).
 * - `getByAccount` → outstanding theo player/kỳ (link từ alert `large_bet`).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 *
 * ## Vì sao không nuôi mảng `topAccounts` trong stats doc?
 *
 * `amount` là metric **TÍCH LUỸ**. Mảng top-K phải seed lại mỗi tick, nên account rơi khỏi
 * top-K sẽ **mất toàn bộ lịch sử** và lần cược sau tính lại từ 0 → tổng hụt, xếp hạng sai,
 * sai số tỷ lệ thuận số người chơi và KHÔNG tự sửa (mẫu Keno p2-01 R5).
 *
 * Nguyên tắc: **top-K theo metric bất biến per-item thì an toàn; top-K theo metric tích luỹ
 * thì phải nuôi từ nguồn đầy đủ rồi lấy top-K lúc đọc** (mongodb.mdc §8).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `BINGO18_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import type {
  Bingo18DrawAccountStatsDoc,
  Bingo18DrawAccountStatsEntity,
} from "@megawin/game-bingo18/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { AccountStatsMapper } from "../mappers/account-stats-mapper";
import type { AccountStatsDelta } from "./types";

const f = docPath<Bingo18DrawAccountStatsDoc>();

export class AccountStatsRepository extends BaseRepo<
  Bingo18DrawAccountStatsEntity,
  AccountStatsMapper
> {
  constructor() {
    super({
      collName: Bingo18Collections.AccountStats,
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
  async getTopAccounts(drawId: string, k: number): Promise<Bingo18DrawAccountStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { amount: -1 }, limit: k });
  }

  /**
   * Số người chơi distinct trong kỳ — 1 doc/account nên count = số người.
   *
   * KPI này trước đây UI phải để trống vì stats doc chỉ có mảng top-K (đếm `length` của
   * top-K là SAI — nó bị chặn ở K). Nay count trên index `{drawId, amount}` → index-only.
   */
  async countPlayers(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  /** Tích luỹ cược của 1 account trong kỳ — drill-down outstanding từ alert. */
  async getByAccount(
    drawId: string,
    accountId: string,
  ): Promise<Bingo18DrawAccountStatsEntity | null> {
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
