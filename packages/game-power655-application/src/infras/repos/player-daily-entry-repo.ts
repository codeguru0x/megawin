/**
 * Repository aggregate player daily stats từ power655_ticket_entries.
 *
 * Truy vấn trên cùng collection với EntryRepository nhưng tách riêng
 * để EntryRepository không phình to và concern rõ ràng hơn.
 *
 * Implements PlayerDailyPublisher (game-core) → dùng trực tiếp trong
 * PublishPlayerDailyUseCase mà không cần wrap hay adapter.
 */

import { Power655Collections, type TicketEntryEntity } from "@megawin/game-power655/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { PlayerDailyAggregateResult } from "@megawin/game-core-application/repos";
import type { PlayerDailyPublisher } from "@megawin/game-core-application/use-cases";
import { EntryMapper } from "../mappers/entry-mapper";
import { BaseRepo } from "./base-repo";

/**
 * Aggregate player stats từ power655_ticket_entries cho PublishPlayerDaily.
 *
 * Implements PlayerDailyPublisher — dùng làm playerPublisher trong
 * SystemPublishPlayerDailyUseCase (game-core).
 *
 * Tách khỏi EntryRepository để: (1) giữ EntryRepository tập trung vào
 * lifecycle operations; (2) concern publish-player-daily có repo riêng rõ ràng.
 */
export class PlayerDailyEntryRepository
  extends BaseRepo<TicketEntryEntity, EntryMapper>
  implements PlayerDailyPublisher
{
  constructor() {
    super({
      collName: Power655Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /**
   * Aggregate player stats cho 1 ngày tài chính — dùng cho player_settle_game_daily.
   *
   * Lọc entries có status "settled" hoặc "void" (bỏ "scheduled"),
   * group by { tenantId, accountId }.
   *
   * Financial metrics (totalStake, totalWin, totalPayout, totalCommission)
   * CHỈ tính entries settled — void entries chỉ đếm voidCount.
   * Dùng $cond để phân nhánh: nếu settled → cộng amount, nếu void → cộng 0.
   *
   * drawCount dùng $addToSet → đếm unique drawIds (1 player có thể có nhiều entries/draw).
   *
   * Null-safe: payout.winAmount, payout.payoutAmount, tenant.commissionAmount
   * có thể null nếu entry vừa settle nhưng chưa có payout (edge case) → $ifNull → 0.
   *
   * Index: { financialDate: 1, status: 1 } (idx_tenant_financialDate_status cover partial)
   */
  async aggregatePlayersFromEntries(financialDate: string): Promise<PlayerDailyAggregateResult[]> {
    const result = await this.aggregate([
      // Lọc entries đã settle hoặc void trong ngày tài chính
      {
        $match: {
          financialDate,
          status: {
            $in: [EntryStatus.Settled, EntryStatus.Void],
          },
        },
      },
      // Nhóm theo { tenantId, accountId } → tính volumes + financial metrics
      {
        $group: {
          _id: {
            tenantId: "$tenant.tenantId",
            accountId: "$accountId",
          },
          // Volume: đếm unique draws, tổng entries, phân loại theo status/outcome
          drawIds: { $addToSet: "$drawId" },
          entryCount: { $sum: 1 },
          settledCount: {
            $sum: { $cond: [{ $eq: ["$status", EntryStatus.Settled] }, 1, 0] },
          },
          winCount: {
            $sum: { $cond: [{ $eq: ["$outcome", EntryOutcome.Win] }, 1, 0] },
          },
          lossCount: {
            $sum: { $cond: [{ $eq: ["$outcome", EntryOutcome.Loss] }, 1, 0] },
          },
          voidCount: {
            $sum: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, 1, 0] },
          },
          // Financial: CHỈ tính entries settled (void → 0)
          // $cond: nếu status = "settled" → lấy giá trị, ngược lại → 0
          totalStake: {
            $sum: {
              $cond: [{ $eq: ["$status", EntryStatus.Settled] }, "$amount", 0],
            },
          },
          totalWin: {
            $sum: {
              $cond: [
                { $eq: ["$status", EntryStatus.Settled] },
                { $ifNull: ["$payout.winAmount", 0] },
                0,
              ],
            },
          },
          totalPayout: {
            $sum: {
              $cond: [
                { $eq: ["$status", EntryStatus.Settled] },
                { $ifNull: ["$payout.payoutAmount", 0] },
                0,
              ],
            },
          },
          totalCommission: {
            $sum: {
              $cond: [
                { $eq: ["$status", EntryStatus.Settled] },
                { $ifNull: ["$tenant.commissionAmount", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      tenantId: r._id.tenantId as string,
      accountId: r._id.accountId as string,
      drawCount: (r.drawIds as unknown[]).length,
      entryCount: r.entryCount as number,
      settledCount: r.settledCount as number,
      winCount: r.winCount as number,
      lossCount: r.lossCount as number,
      voidCount: r.voidCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
      totalCommission: r.totalCommission as number,
    }));
  }
}
