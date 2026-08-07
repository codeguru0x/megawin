/**
 * Power 6/55 – Get Ops Snapshot Use Case
 *
 * Snapshot vận hành 1 kỳ — gộp stats + top-K + alert count + draw status + exposure
 * jackpot trong 1 use-case. Nguồn cho **timer 1 duy nhất** ở FE (analysis §5.2, D2):
 * trang Power 6/55 dùng CHUNG nhịp `tickSeconds` cho cả snapshot và live feed.
 *
 * | Nguồn | Query | Index |
 * |---|---|---|
 * | draw (status + jackpot snapshot) | `findOne({drawId})` | `idx_drawId_unique` |
 * | stats (counters + exposure fixed) | `findOne({drawId})` | `idx_drawId_unique` |
 * | numberStats (heatmap 55 số) | `find({drawId})` ≤55 doc | `idx_drawId_number_unique` |
 * | alert counts | `$group` theo status | `{drawId, status}` |
 * | topCombos | `sort({sets:-1}).limit(K)` | `idx_drawId_sets` |
 * | topAccounts | `sort({amount:-1}).limit(K)` | `idx_drawId_amount` |
 * | uniquePlayers | `countDocuments({drawId})` | `idx_drawId_amount` |
 *
 * `numberStats`/`topCombos`/`topAccounts`/`uniquePlayers` CHỈ query khi đã có stats doc
 * (chưa có cược ⇒ các collection kia cũng rỗng → khỏi query — cùng lý do Keno §"Vì sao 4
 * query thay vì 1?", ở đây là 5 query vì tách thêm `numberStats`).
 *
 * ## Exposure 2 phần (analysis §3.6 — KHÁC KENO CĂN BẢN, game jackpot không có cap)
 *
 * 1. `fixedWorstCase` = `stats.exposure.fixedWorstCase` — đọc thẳng, RAW không cap
 *    (Power 6/55 không có `maxPerDraw`).
 * 2. `jackpotExposure` = `closingJackpot1 + closingJackpot2` — KHÔNG lưu ở đâu, đọc
 *    snapshot pool lúc build response (R6 — tránh đọc sai kỳ):
 *    - Draw ĐÃ settled (`draw.jackpot` có mặt) → dùng closing SNAPSHOT của chính kỳ
 *      đó (`draw.jackpot.closingJackpot1/2`) — không phải cycle hiện hành (có thể đã
 *      sang kỳ/cycle khác).
 *    - Draw CHƯA settled (`draw.jackpot` undefined) → dùng cycle ĐANG ACTIVE
 *      (`jackpot1CurrentAmount`/`jackpot2CurrentAmount`) — pool thật tại thời điểm xem.
 *    - Không có draw / không có cycle active (dữ liệu bất thường) → 0 (không throw —
 *      snapshot phải luôn trả được cho UI).
 */

import { NextApiUseCase } from "@megawin/next/server";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { NumberStatsRepository } from "../../infras/repos/number-stats-repo";
import { ComboStatsRepository } from "../../infras/repos/combo-stats-repo";
import { AccountStatsRepository } from "../../infras/repos/account-stats-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type {
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput,
  Power655SnapshotExposure,
  Power655TopCombo,
} from "./dto/ops.dto";

export class GetOpsSnapshotUseCase extends NextApiUseCase<
  GetOpsSnapshotInput,
  GetOpsSnapshotOutput
> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly numberStatsRepo = new NumberStatsRepository();
  private readonly comboRepo = new ComboStatsRepository();
  private readonly accountStatsRepo = new AccountStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();
  private readonly jackpotCycleRepo = new JackpotCycleRepository();

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

    // Query độc lập chạy SONG SONG — config không phụ thuộc draw/stats, ngược lại.
    const [config, draw, stats, alertCounts] = await Promise.all([
      this.getGlobalConfig.run(),
      this.drawRepo.getDrawById(drawId),
      this.statsRepo.findByDrawId(drawId),
      this.alertRepo.countByStatus(drawId),
    ]);

    const { alerts, stats: statsConfig } = config.ops;

    // Chưa có stats doc ⇒ chưa có cược ⇒ 4 collection kia cũng rỗng → khỏi query.
    const [numberStats, topCombos, topAccounts, uniquePlayers] = stats
      ? await Promise.all([
          this.numberStatsRepo.findByDrawId(drawId),
          this.comboRepo.findTopBySets(drawId, statsConfig.topCombosK),
          this.accountStatsRepo.findTopByAmount(drawId, statsConfig.topAccountsK),
          this.accountStatsRepo.countByDrawId(drawId),
        ])
      : [[], [], [], 0];

    const exposure = stats ? await this.buildExposure(stats.exposure.fixedWorstCase, draw) : null;

    return {
      drawId,
      drawStatus: draw?.status ?? null,
      stats,
      numberStats,
      topCombos: topCombos.map((c): Power655TopCombo => ({
        comboKey: c.comboKey,
        playType: c.playType,
        mainNumbers: c.mainNumbers,
        sets: c.sets,
        accounts: c.accountCount,
        amount: c.amount,
      })),
      topAccounts: topAccounts.map((a) => ({
        accountId: a.accountId,
        username: a.username,
        amount: a.amount,
        entries: a.entries,
      })),
      uniquePlayers,
      exposure,
      alertCounts,
      // Ngưỡng từ config → FE tô màu đúng cấu hình thực, không hardcode default.
      thresholds: {
        largeBetAmount: alerts.largeBetAmount,
        fixedExposureWarnAmount: alerts.fixedExposureWarnAmount,
        comboAccountsWarn: alerts.comboAccountsWarn,
        baoHighStakeAmount: alerts.baoHighStakeAmount,
      },
      pollSeconds: statsConfig.tickSeconds,
    };
  }

  /**
   * Build exposure 2 phần — xem JSDoc class cho lý giải đầy đủ nguồn jackpot pool
   * (R6: settled dùng snapshot draw, active dùng cycle hiện hành).
   */
  private async buildExposure(
    fixedWorstCase: number,
    draw: Awaited<ReturnType<DrawRepository["getDrawById"]>>,
  ): Promise<Power655SnapshotExposure> {
    let jackpot1 = 0;
    let jackpot2 = 0;

    if (draw?.jackpot) {
      // Draw đã settled — dùng snapshot CHÍNH XÁC của kỳ đó, không phải cycle hiện hành
      // (có thể đã roll sang cycle/kỳ khác lúc staff xem lại báo cáo cũ).
      jackpot1 = draw.jackpot.closingJackpot1;
      jackpot2 = draw.jackpot.closingJackpot2;
    } else {
      // Draw chưa settled — pool thật là cycle đang active tại thời điểm xem.
      const cycle = await this.jackpotCycleRepo.getActiveCycle();
      if (cycle) {
        jackpot1 = cycle.jackpot1CurrentAmount;
        jackpot2 = cycle.jackpot2CurrentAmount;
      }
    }

    return {
      fixedWorstCase,
      jackpot1,
      jackpot2,
      jackpotExposure: jackpot1 + jackpot2,
    };
  }
}
