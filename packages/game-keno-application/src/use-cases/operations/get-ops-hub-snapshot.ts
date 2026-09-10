import { UseCase } from "@megawin/app-core/use-cases";

import { BettingStatsRepository } from "../../infras/repos/betting-stats-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { OpsAlertRepository } from "../../infras/repos/ops-alert-repo";
import type { HubAlertCounts, HubDrawRow, HubStatsRow } from "../../infras/repos/types";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type {
  OpsHubDrawRow,
  OpsHubSnapshotInput,
  OpsHubSnapshotOutput,
  OpsHubThresholds,
} from "./dto/hub-snapshot.dto";

/**
 * Trần số kỳ trả về mỗi lần poll.
 *
 * Cơ sở: Bingo18 ~158 kỳ/ngày (`drawIntervalMinutes = 6`), Keno ~119 (`= 8`). 500 ≈ 3 ngày
 * Bingo18 / ~4 ngày Keno — đủ cho tồn đọng nhiều ngày + tạo kỳ mới cùng lúc (300 từng
 * cắt sớm khi backlog + ngày mới).
 *
 * KHÔNG giảm dưới 200: một ngày Bingo18 bình thường đã 158 kỳ, giảm nữa là `truncated`
 * gần như luôn `true` → banner cảnh báo mất ý nghĩa vì lúc nào cũng hiện.
 */
export const DEFAULT_HUB_LIMIT = 500;

/**
 * Default ngưỡng per-chặng CHƯA có trong `OpsConfig` (`pendingClose*`, `awaitingSettle*`,
 * `processingStuckSec`) — xem `p0-03-hub-query-foundation.plan.md` §5.3.
 *
 * TODO(p0-03 follow-up): thêm các field này vào `OpsAlertsConfig`/`OpsConfig` per-game để
 * staff chỉnh qua backoffice UI, giống `largeBetAmount`/`exposureWarnPct`. Tới lúc đó dùng
 * default cứng dưới đây — KHÔNG rải giá trị này ở component FE, chỉ giữ 1 nguồn ở đây.
 */
const DEFAULT_STAGE_THRESHOLDS = {
  /** ~90 phút. */
  pendingCloseWarnSec: 90 * 60,
  /** ~4 giờ. */
  pendingCloseStuckSec: 4 * 60 * 60,
  /** ~15 phút. */
  awaitingSettleWarnSec: 15 * 60,
  /** ~60 phút. */
  awaitingSettleStuckSec: 60 * 60,
  /** ~5 phút — Settling/Voiding nên xong trong giây. */
  processingStuckSec: 5 * 60,
} as const;

/**
 * Snapshot vận hành ĐA KỲ — nguồn duy nhất cho trang Ops Hub.
 *
 * Khác `GetOpsSnapshotUseCase` (1 kỳ, chi tiết sâu: heatmap, topCombos, topAccounts):
 * use-case này đọc NHIỀU kỳ nhưng MỎNG, chỉ đủ dựng 1 dòng bảng. Trang chi tiết 1 kỳ vẫn
 * gọi `GetOpsSnapshotUseCase` như cũ — không nhân bản logic.
 *
 * RÀNG BUỘC 1 — đúng 4 query, KHÔNG tỷ lệ với số kỳ. Với mô hình bán cả ngày, `rows` LUÔN
 * ~120-160 kỳ (không phải "chỉ khi backlog"). Mọi thay đổi làm số query phụ thuộc N là
 * regression, không phải "tối ưu sau".
 *
 * RÀNG BUỘC 2 — trả RAW + `serverNow`, KHÔNG dẫn xuất trạng thái. `status = salesOpen` là
 * `Selling` hay `PendingClose` phụ thuộc `now` vs `closeAt`; đếm ở server bằng `status` thô
 * cho ra số KHÔNG khớp bảng người vận hành đang nhìn. Xem plan §1.2.
 *
 * 2 tầng `Promise.all` (không phải 1): tầng 2 cần `drawIds` từ tầng 1. Không dùng `$lookup`
 * gộp thành 1 round-trip vì nó buộc materialize doc stats 33KB, mất lợi ích projection.
 */
export class GetOpsHubSnapshotUseCase extends UseCase<OpsHubSnapshotInput, OpsHubSnapshotOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
  private readonly drawRepo = new DrawRepository();
  private readonly statsRepo = new BettingStatsRepository();
  private readonly alertRepo = new OpsAlertRepository();

  /**
   * Đọc snapshot raw (không bọc NextResponse) — route dùng để tính ETag + xử lý 304.
   *
   * Tách khỏi `execute` để route lấy được nguyên liệu ETag (max `updatedAt` stats + draw,
   * `rows.length`, `oldestDrawId`) TRƯỚC khi serialize response. Xem plan §7.
   */
  async getData(input: OpsHubSnapshotInput): Promise<OpsHubSnapshotOutput> {
    return this.execute(input);
  }

  protected async execute(input: OpsHubSnapshotInput): Promise<OpsHubSnapshotOutput> {
    const limit = input.limit ?? DEFAULT_HUB_LIMIT;

    // Tầng 1: config KHÔNG phụ thuộc draws → chạy song song. `rows` cần có trước khi
    // biết `drawIds` cho tầng 2 (stats + alertCounts) — waterfall 2 tầng có chủ đích (§2).
    const [config, rows] = await Promise.all([this.getGlobalConfig.run(), this.drawRepo.listUnfinishedDrawRows(limit)]);

    const drawIds = rows.map((r) => r.drawId);

    // 0 kỳ chưa hoàn thành → khỏi gọi 2 query còn lại (test case §8.1).
    const [statsRows, alertCounts] =
      drawIds.length > 0
        ? await Promise.all([this.statsRepo.getRowsByDrawIds(drawIds), this.alertRepo.countByDrawIds(drawIds)])
        : [[] as HubStatsRow[], new Map<string, HubAlertCounts>()];

    // Merge bằng Map một lần rồi lookup O(1) — KHÔNG `.find()` trong `.map()` (O(N×M)).
    const statsByDrawId = new Map(statsRows.map((s) => [s.drawId, s]));

    const { alerts, stats: statsConfig } = config.ops;
    const { play } = config;

    return {
      rows: rows.map((row) => this.buildRow(row, statsByDrawId.get(row.drawId), alertCounts.get(row.drawId))),
      serverNow: new Date().toISOString(),
      // `>=` (không `===`) để an toàn nếu repo trả nhiều hơn limit vì lý do nào đó.
      truncated: rows.length >= limit,
      thresholds: this.buildThresholds(play.drawIntervalMinutes, alerts.largeBetAmount, alerts.exposureWarnPct),
      pollSeconds: statsConfig.tickSeconds,
      drawIntervalMinutes: play.drawIntervalMinutes,
      salesCloseBeforeSeconds: play.salesCloseBeforeSeconds,
    };
  }

  /**
   * Gộp 1 dòng draw + stats (nếu có) + alert counts (nếu có) → `OpsHubDrawRow`.
   *
   * Kỳ chưa có stats doc (chưa ai cược) hoặc chưa có alert → điền `0`, KHÔNG để `undefined`
   * lọt DTO (FE render `NaN`). Ngoại lệ duy nhất được `null`: `openAt`/`publishedAt`/
   * `settledAt` — `null` ở đây có nghĩa nghiệp vụ (chưa mở bán/chưa có KQ/chưa kết sổ).
   */
  private buildRow(
    draw: HubDrawRow,
    stats: HubStatsRow | undefined,
    alerts: HubAlertCounts | undefined,
  ): OpsHubDrawRow {
    return {
      drawId: draw.drawId,
      drawNo: draw.drawNo,
      status: draw.status,
      drawTime: draw.drawTime.toISOString(),
      closeAt: draw.closeAt.toISOString(),
      openAt: draw.openAt ? draw.openAt.toISOString() : null,
      publishedAt: draw.publishedAt ? draw.publishedAt.toISOString() : null,
      settledAt: draw.settledAt ? draw.settledAt.toISOString() : null,
      updatedAt: draw.updatedAt.toISOString(),
      revenue: stats?.revenue ?? 0,
      entries: stats?.entries ?? 0,
      sets: stats?.sets ?? 0,
      commission: stats?.commission ?? 0,
      largeBetCount: stats?.largeBetCount ?? 0,
      exposureRaw: stats?.exposureRaw ?? 0,
      alertsOpen: alerts?.open ?? 0,
      alertsCritical: alerts?.critical ?? 0,
      statsFinal: stats?.final ?? false,
    };
  }

  /**
   * Ngưỡng `AwaitingResult` tính động = 2×/4× `drawIntervalMinutes` (chu kỳ per-game khác
   * nhau — Keno 8 phút, Bingo18 6 phút, guideline §8.3). Field còn lại dùng default cứng
   * cho tới khi `OpsConfig` có field tương ứng (xem {@link DEFAULT_STAGE_THRESHOLDS}).
   */
  private buildThresholds(
    drawIntervalMinutes: number,
    largeBetAmount: number,
    exposureWarnPct: number,
  ): OpsHubThresholds {
    const cycleSec = drawIntervalMinutes * 60;

    return {
      ...DEFAULT_STAGE_THRESHOLDS,
      awaitingResultWarnSec: 2 * cycleSec,
      awaitingResultStuckSec: 4 * cycleSec,
      largeBetAmount,
      exposureWarnPct,
    };
  }
}
