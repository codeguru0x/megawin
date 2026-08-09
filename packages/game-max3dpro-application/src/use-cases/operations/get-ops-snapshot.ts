import type { Max3dproTopPair, TopAccountStat } from "@megawin/game-max3dpro/entities";
import { OpsAlertStatus } from "@megawin/game-max3dpro/entities";
import { computeMax3dproExposure, DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { NextApiUseCase } from "@megawin/next/server";

import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { PairStatsRepository } from "../../infras/repos/pair-stats-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { GetOpsSnapshotInput, GetOpsSnapshotOutput } from "./dto/snapshot.dto";

/**
 * Snapshot vận hành 1 kỳ Max 3D Pro — gộp stats + top-K + exposure + alert count + draw status.
 *
 * Nguồn cho **timer 1 duy nhất** ở FE (analysis §4.1): thay 6 request aggregation
 * on-demand cũ. Đọc song song stats (findOne O(1)), alert count (index-only), draw
 * status, config (thresholds + pollSeconds). Không đụng hot path place-bet.
 *
 * ## topPairs/topAccounts derive lúc ĐỌC (p0-01 §1)
 *
 * `topPairs` (`max3dpro_draw_pair_stats`) và `topAccounts` (`max3dpro_draw_account_stats`) là
 * top-K theo metric TÍCH LUỸ nên KHÔNG nuôi trong stats doc mà chính xác (mảng top-K seed lại
 * mỗi tick → phần rơi ngoài K mất lịch sử → drift). Đọc thêm query index-only ở đường ĐỌC để
 * đường GHI khỏi drift là lãi rõ ràng. Exposure tính từ topPairs (basic exact + pair liability
 * + plus tail proxy) — doc chỉ lưu RAW tuyến tính (bài học Keno Risk #4). `updatedAt` của stats
 * dùng làm ETag ở route → 304 khi chưa đổi (0 re-render FE).
 */
export class GetOpsSnapshotUseCase extends NextApiUseCase<GetOpsSnapshotInput, GetOpsSnapshotOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly pairStatsRepo = new PairStatsRepository();
  private readonly accountStatsRepo = new AccountStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  /**
   * Đọc snapshot raw (không bọc NextResponse) — route dùng để tính ETag + xử lý 304.
   *
   * Tách khỏi `execute` để route lấy được `stats.updatedAt` làm ETag trước khi
   * serialize. `run()` chuẩn vẫn hoạt động cho consumer không cần ETag.
   */
  async getData(input: GetOpsSnapshotInput): Promise<GetOpsSnapshotOutput> {
    return this.execute(input);
  }

  protected async execute(input: GetOpsSnapshotInput): Promise<GetOpsSnapshotOutput> {
    const { drawId } = input;

    // Đọc song song — không phụ thuộc lẫn nhau (tránh waterfall).
    const [config, draw, stats, newCount, criticalCount] = await Promise.all([
      this.getGlobalConfig.run(),
      this.drawRepo.getDrawById(drawId),
      this.statsRepo.getByDrawId(drawId),
      this.alertRepo.countByStatus(OpsAlertStatus.New),
      this.alertRepo.countActiveCritical(),
    ]);

    // Doc cũ chưa có section ops → fallback default (plan p0-03 §3).
    const ops = config.ops ?? DEFAULT_MAX3D_PRO_CONFIG.ops;
    const statsConfig = ops.stats;

    // Chưa có stats doc ⇒ chưa có cược ⇒ pair/account collection cũng rỗng → khỏi query.
    const [pairEntities, accountEntities, uniquePlayers] = stats
      ? await Promise.all([
          this.pairStatsRepo.getTopPairs(drawId, statsConfig.topCombosK),
          this.accountStatsRepo.getTopAccounts(drawId, statsConfig.topAccountsK),
          this.accountStatsRepo.countPlayers(drawId),
        ])
      : [[], [], 0];

    // Map pair entity → shape ĐỌC Max3dproTopPair (accountCount → accounts).
    const topPairs: Max3dproTopPair[] = pairEntities.map((p) => ({
      pairKey: p.pairKey,
      first: p.first,
      second: p.second,
      units: p.units,
      accounts: p.accountCount,
      amount: p.amount,
    }));

    const topAccounts: TopAccountStat[] = accountEntities.map((a) => ({
      accountId: a.accountId,
      username: a.username,
      amount: a.amount,
      entries: a.entries,
    }));

    // Exposure tính tại tầng đọc từ topPairs (derive) + totalUnits — null khi chưa có stats.
    const exposure = stats
      ? computeMax3dproExposure(
          topPairs,
          stats.byPlayType.multiNumber.units + stats.byPlayType.multiDigit.units,
          config.defaultPrizes.standard,
        )
      : null;

    return {
      drawId,
      drawStatus: draw?.status ?? null,
      stats,
      exposure,
      topAccounts,
      uniquePlayers: stats ? uniquePlayers : null,
      alertCounts: { new: newCount, critical: criticalCount },
      // Ngưỡng từ config → FE tô màu đúng cấu hình thực, không hardcode default.
      thresholds: {
        largeBetAmount: ops.alerts.largeBetAmount,
        exposureWarnAmount: ops.alerts.exposureWarnAmount,
        pairLiabilityWarnAmount: ops.alerts.pairLiabilityWarnAmount,
        comboAccountsWarn: ops.alerts.comboAccountsWarn,
      },
      pollSeconds: ops.stats.tickSeconds,
    };
  }
}
