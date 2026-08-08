import { NextApiUseCase } from "@megawin/next/server";
import { OpsAlertStatus } from "@megawin/game-keno/entities";
import type { KenoTopCombo, TopAccountStat } from "@megawin/game-keno/entities";
import { capExposureByPlayType } from "@megawin/game-keno/rules";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { GetOpsSnapshotInput, GetOpsSnapshotOutput } from "./dto/snapshot.dto";

/**
 * Snapshot vận hành 1 kỳ — gộp stats + top-K + alert count + draw status trong 1 use-case.
 *
 * Nguồn cho **timer 1 duy nhất** ở FE (analysis §4.1): thay 5–6 request aggregation
 * on-demand cũ. Mọi query chạy SONG SONG, đều là findOne/index-only:
 *
 * | Nguồn | Query | Index |
 * |---|---|---|
 * | counters + heatmap + exposure | `findOne({drawId})` | `idx_drawId_unique` |
 * | `drawStatus` | `find({drawId}).project({status})` | `idx_drawId_unique` |
 * | `topCombos` | `sort({sets:-1}).limit(K)` | `idx_drawId_sets` |
 * | `topAccounts` | `sort({amount:-1}).limit(K)` | `idx_drawId_amount` |
 * | `uniquePlayers` | `countDocuments({drawId})` | `idx_drawId_amount` |
 *
 * ## Vì sao 4 query thay vì 1?
 *
 * Đây là **đánh đổi CÓ CHỦ ĐÍCH** (p2-01 §3.5): `topCombos`/`topAccounts` là top-K theo
 * metric TÍCH LUỸ nên KHÔNG thể nuôi trong stats doc mà chính xác (mảng top-K phải seed lại
 * mỗi tick → phần rơi ngoài K mất lịch sử → drift không tự sửa). Đọc nhiều hơn 3 query
 * index-only ở đường ĐỌC để đường GHI (6 lần/phút × D kỳ) khỏi drift là lãi rõ ràng.
 *
 * `updatedAt` của stats dùng làm ETag ở route → 304 khi chưa đổi (0 re-render FE).
 */
export class GetOpsSnapshotUseCase extends NextApiUseCase<GetOpsSnapshotInput, GetOpsSnapshotOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly comboRepo = new ComboStatsRepository();
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

    // Config phải có trước để biết topCombosK/topAccountsK — đọc cùng lượt với các query
    // KHÔNG phụ thuộc nó, rồi mới chạy 3 query top-K (tránh waterfall 3 tầng).
    const [config, drawStatuses, stats, newCount, criticalCount] = await Promise.all([
      this.getGlobalConfig.run(),
      // Chỉ cần `status` để FE biết kỳ còn mở bán — không kéo full DrawDoc (financial,
      // settleSummary, vietlottRef…) trên route FE poll mỗi 10s.
      this.drawRepo.getStatusesByDrawIds([drawId]),
      this.statsRepo.getByDrawId(drawId),
      this.alertRepo.countByStatus(OpsAlertStatus.New),
      this.alertRepo.countActiveCritical(),
    ]);

    const { alerts, stats: statsConfig } = config.ops;
    const caps = config.payoutCaps;

    // Chưa có stats doc ⇒ chưa có cược ⇒ 3 collection kia cũng rỗng → khỏi query.
    const [topCombos, topAccounts, uniquePlayers] = stats
      ? await Promise.all([
          this.comboRepo.getTopCombos(drawId, statsConfig.topCombosK),
          this.accountStatsRepo.getTopAccounts(drawId, statsConfig.topAccountsK),
          this.accountStatsRepo.countPlayers(drawId),
        ])
      : [[], [], 0];

    // Cap exposure lúc BUILD RESPONSE (doc lưu RAW — analysis §3.4). null khi chưa có stats.
    const cappedExposure = stats ? capExposureByPlayType(stats.exposure.worstCaseByPlayType, caps) : null;

    return {
      drawId,
      drawStatus: drawStatuses.get(drawId) ?? null,
      stats,
      topCombos: topCombos.map(
        (c): KenoTopCombo => ({
          playType: c.playType,
          numbers: c.numbers,
          sets: c.sets,
          accounts: c.accountCount,
          amount: c.amount,
        }),
      ),
      topAccounts: topAccounts.map(
        (a): TopAccountStat => ({
          accountId: a.accountId,
          username: a.username,
          amount: a.amount,
          entries: a.entries,
        }),
      ),
      uniquePlayers,
      cappedExposure,
      alertCounts: { new: newCount, critical: criticalCount },
      // Ngưỡng từ config → FE tô màu đúng cấu hình thực (§4.3), không hardcode default.
      thresholds: {
        exposureWarnPct: alerts.exposureWarnPct,
        sidebetSkewPct: alerts.sidebetSkewPct,
        comboSetsWarn: alerts.comboSetsWarn,
        maxSetsForFixed: {
          pick8: caps.pick8MaxSetsForFixed,
          pick9: caps.pick9MaxSetsForFixed,
          pick10: caps.pick10MaxSetsForFixed,
        },
      },
      pollSeconds: statsConfig.tickSeconds,
    };
  }
}
