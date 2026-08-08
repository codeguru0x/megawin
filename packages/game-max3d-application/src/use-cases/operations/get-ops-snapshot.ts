import { NextApiUseCase } from "@megawin/next/server";
import { OpsAlertStatus } from "@megawin/game-max3d/entities";
import type { Max3dTopPair } from "@megawin/game-max3d/entities";
import { computeMax3dExposure, DEFAULT_MAX3D_CONFIG } from "@megawin/game-max3d/rules";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { PairStatsRepository } from "../../infras/repos/pair-stats-repo";
import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { GetOpsSnapshotInput, GetOpsSnapshotOutput } from "./dto/snapshot.dto";

/**
 * Snapshot vận hành 1 kỳ Max 3D — gộp stats + exposure + alert count + draw status.
 *
 * Nguồn cho **timer 1 duy nhất** ở FE (analysis §4.1): thay 6 request aggregation
 * on-demand cũ. Đọc song song stats (findOne O(1)), alert count (index-only), draw
 * status, config (thresholds + pollSeconds). Không đụng hot path place-bet.
 *
 * Exposure tính tại tầng đọc từ tripletStakes/topPairs (basic exact + pair liability
 * + plus tail proxy) — doc chỉ lưu RAW tuyến tính (bài học Keno Risk #4).
 * `updatedAt` của stats dùng làm ETag ở route → 304 khi chưa đổi (0 re-render FE).
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

    // Đọc song song — không phụ thuộc lẫn nhau (tránh waterfall). `ops.stats.topCombosK`/
    // `topAccountsK` cần config nên đọc config trước; nhưng config load nhanh (in-memory
    // cache), tách 2 Promise.all không đáng — giữ 1 lần đọc config trước, phần còn lại song song.
    const config = await this.getGlobalConfig.run();
    const ops = config.ops ?? DEFAULT_MAX3D_CONFIG.ops;

    const [draw, stats, topPairEntities, topAccountEntities, newCount, criticalCount] = await Promise.all([
      this.drawRepo.getDrawById(drawId),
      this.statsRepo.getByDrawId(drawId),
      this.pairStatsRepo.getTopPairs(drawId, ops.stats.topCombosK),
      this.accountStatsRepo.getTopAccounts(drawId, ops.stats.topAccountsK),
      this.alertRepo.countByStatus(OpsAlertStatus.New),
      this.alertRepo.countActiveCritical(),
    ]);

    const topPairs: Max3dTopPair[] = topPairEntities.map((p) => ({
      pairKey: p.pairKey,
      triplet1: p.triplet1,
      triplet2: p.triplet2,
      units: p.units,
      accounts: p.accountCount,
      amount: p.amount,
    }));

    // Exposure tính tại tầng đọc từ stakes/pairs — null khi chưa có stats.
    const exposure = stats
      ? computeMax3dExposure(stats.tripletStakes, topPairs, stats.byPlayType.plus.units, {
          basic: config.defaultPrizes.basic,
          combo: config.defaultPrizes.combo,
          plus: config.defaultPrizes.plus,
        })
      : null;

    return {
      drawId,
      drawStatus: draw?.status ?? null,
      stats,
      exposure,
      topPairs,
      topAccounts: topAccountEntities.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        amount: a.amount,
        entries: a.entries,
      })),
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
