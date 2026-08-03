import { NextApiUseCase } from "@megawin/next/server";
import { OpsAlertStatus } from "@megawin/game-bingo18/entities";
import type { TopAccountStat } from "@megawin/game-bingo18/entities";
import { computeBingo18Exposure, DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { GetOpsSnapshotInput, GetOpsSnapshotOutput } from "./dto/snapshot.dto";

/**
 * Snapshot vận hành 1 kỳ Bingo 18 — gộp stats + exposure + alert count + draw status.
 *
 * Nguồn cho **timer 1 duy nhất** ở FE (analysis §4.1): thay 5 request aggregation
 * on-demand cũ. Đọc song song stats (findOne O(1)), alert count (index-only), draw status,
 * config (thresholds + pollSeconds). Không đụng hot path place-bet.
 *
 * Exposure tính CHÍNH XÁC per-outcome (216) từ bucket lúc build response — doc chỉ lưu
 * bucket RAW tuyến tính (bài học Keno Risk #4).
 *
 * `topAccounts`/`uniquePlayers` derive lúc ĐỌC từ `bingo18_draw_account_stats`
 * (`sort({amount:-1}).limit(K)` / `countDocuments`) — KHÔNG còn nằm trong `stats` doc
 * (top-K theo metric TÍCH LUỸ không thể seed lại chính xác trong doc, p0-03). 2 query này
 * CHỈ chạy khi đã có `stats` (chưa có stats ⇒ chưa có cược ⇒ account collection rỗng).
 *
 * `updatedAt` của stats dùng làm ETag ở route → 304 khi chưa đổi (0 re-render FE).
 */
export class GetOpsSnapshotUseCase extends NextApiUseCase<
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput
> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly statsRepo = new BettingStatsRepository();
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
    const ops = config.ops ?? DEFAULT_BINGO18_CONFIG.ops;

    // Chưa có stats doc ⇒ chưa có cược ⇒ account collection cũng rỗng → khỏi query.
    const [topAccounts, uniquePlayers] = stats
      ? await Promise.all([
          this.accountStatsRepo.getTopAccounts(drawId, ops.stats.topAccountsK),
          this.accountStatsRepo.countPlayers(drawId),
        ])
      : [[], 0];

    // Exposure CHÍNH XÁC tính tại tầng đọc từ bucket — null khi chưa có stats.
    const exposure = stats
      ? computeBingo18Exposure(stats.byPlayType, {
          singleNum: config.singleNumPrizes,
          doubleMatch: config.doubleMatchPrizes,
          tripleMatch: config.tripleMatchPrizes,
          sumTotal: config.sumTotalPrizes,
          bigSmallDraw: config.bigSmallDrawPrizes,
        })
      : null;

    return {
      drawId,
      drawStatus: draw?.status ?? null,
      stats,
      exposure,
      topAccounts: topAccounts.map((a): TopAccountStat => ({
        accountId: a.accountId,
        username: a.username,
        amount: a.amount,
        entries: a.entries,
      })),
      uniquePlayers,
      alertCounts: { new: newCount, critical: criticalCount },
      // Ngưỡng từ config → FE tô màu đúng cấu hình thực, không hardcode default.
      thresholds: {
        largeBetAmount: ops.alerts.largeBetAmount,
        exposureWarnRevenuePct: ops.alerts.exposureWarnRevenuePct,
        exposureWarnMinAmount: ops.alerts.exposureWarnMinAmount,
        sidebetSkewPct: ops.alerts.sidebetSkewPct,
        bucketConcentrationAmount: ops.alerts.bucketConcentrationAmount,
      },
      pollSeconds: ops.stats.tickSeconds,
    };
  }
}
