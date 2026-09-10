/**
 * Ops Hub — Vòng lặp derive DUY NHẤT cho toàn bộ `rows` (guideline §5.5).
 *
 * Gộp mọi thứ cần cùng lúc trong 1 lần lặp: state từng dòng, phễu Zone 2 khối (A), tổng khối
 * (B) + outlier, Day Flow, biên "kỳ hiện tại" (theo `drawTime`), và mốc đổi trạng thái gần nhất
 * (`nextBoundaryAtMs`). Viết N lần `rows.filter(...)` là N lần lặp 200 phần tử
 * (`vercel-react-best-practices` §7.6) — cấm tách thành nhiều hàm gọi rời nhau trên `rows`.
 */

import type { OpsHubDrawRow, OpsHubThresholds } from "@megawin/game-bingo18-application/use-cases/operations";
import { MIN_SALES_WINDOW_SECONDS } from "@megawin/game-core/utils";

import { deriveDrawState, OpsStage, parseDrawTimestamps, SaleGate } from "./derive-draw-state";
import type {
  DayFlowColumn,
  DerivedRow,
  FunnelSegment,
  HubDerived,
  OpsFunnel,
  SellingOutlier,
  SellingSummary,
} from "./hub-types";

function emptySegment(): FunnelSegment {
  return { count: 0, revenue: 0, hasStuck: false };
}

/** Median của mảng ĐÃ sort tăng dần. `0` khi mảng rỗng. Tránh indexed-access `possibly undefined`. */
function medianOf(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted.at(mid) ?? 0;
  }
  const a = sorted.at(mid - 1) ?? 0;
  const b = sorted.at(mid) ?? 0;
  return (a + b) / 2;
}

function addToSegment(seg: FunnelSegment, revenue: number, isStuck: boolean): void {
  seg.count += 1;
  seg.revenue += revenue;
  if (isStuck) {
    seg.hasStuck = true;
  }
}

/**
 * Mốc kế tiếp mà 1 dòng ĐỔI `gate`/`stage`/`health` — dùng để hẹn `setTimeout` thay vì tick 1s
 * (guideline §5.3, plan §5.3). Trả `null` nếu dòng không còn mốc nào biết trước (chỉ đổi khi có
 * hành động thủ công của staff — VD `NeedsResettle`/`NeverOpened`, hoặc `PendingClose` đã qua
 * cả ngưỡng stuck).
 */
function nextRowBoundaryMs(row: DerivedRow, nowMs: number, thresholds: OpsHubThresholds): number | null {
  const candidates: number[] = [];
  const { ts, gate, stage } = row;

  if (gate === SaleGate.Open) {
    // Selling → Ended/PendingClose đúng lúc `closeAt`.
    candidates.push(ts.closeAtMs);
  } else if (gate === SaleGate.PendingOpen || gate === SaleGate.Halted) {
    // Còn cửa sổ bán: closeAt (gate flip) + 2 ngưỡng health remaining-based.
    candidates.push(ts.closeAtMs);
    candidates.push(ts.closeAtMs - MIN_SALES_WINDOW_SECONDS * 1000);
    candidates.push(ts.closeAtMs - 3 * MIN_SALES_WINDOW_SECONDS * 1000);
  } else {
    // gate = Ended — mốc theo NGƯỠNG RIÊNG của từng stage (guideline §8.3).
    switch (stage) {
      case OpsStage.PendingClose:
        candidates.push(ts.closeAtMs + thresholds.pendingCloseWarnSec * 1000);
        candidates.push(ts.closeAtMs + thresholds.pendingCloseStuckSec * 1000);
        break;
      case OpsStage.AwaitingDraw:
        candidates.push(ts.drawTimeMs);
        break;
      case OpsStage.AwaitingResult:
        candidates.push(ts.drawTimeMs + thresholds.awaitingResultWarnSec * 1000);
        candidates.push(ts.drawTimeMs + thresholds.awaitingResultStuckSec * 1000);
        break;
      case OpsStage.AwaitingSettle:
        if (ts.publishedAtMs !== null) {
          candidates.push(ts.publishedAtMs + thresholds.awaitingSettleWarnSec * 1000);
          candidates.push(ts.publishedAtMs + thresholds.awaitingSettleStuckSec * 1000);
        }
        break;
      case OpsStage.Settling:
      case OpsStage.Voiding:
        candidates.push(ts.updatedAtMs + thresholds.processingStuckSec * 1000);
        break;
      case OpsStage.NeedsResettle:
      case OpsStage.NeverOpened:
      case OpsStage.Selling:
        // Không có mốc thời gian biết trước — chỉ đổi khi staff hành động thủ công.
        break;
      default: {
        const _exhaustive: never = stage;
        return _exhaustive;
      }
    }
  }

  // Chỉ giữ mốc CÒN Ở TƯƠNG LAI so với `nowMs` — mốc đã qua không còn nghĩa hẹn giờ.
  let best: number | null = null;
  for (const c of candidates) {
    if (c > nowMs && (best === null || c < best)) {
      best = c;
    }
  }
  return best;
}

/**
 * Dẫn xuất TẤT CẢ trong 1 lần lặp qua `rows` — KHÔNG nhiều `.filter()` liên tiếp.
 *
 * @param rows - Raw rows từ snapshot (chưa derive).
 * @param nowMs - Giờ SERVER đã hiệu chỉnh (`Date.now() + clockOffsetMs`).
 * @param thresholds - Ngưỡng per-chặng từ server config.
 */
export function deriveHubSummary(
  rows: readonly OpsHubDrawRow[],
  nowMs: number,
  thresholds: OpsHubThresholds,
): HubDerived {
  const derivedRows: DerivedRow[] = [];
  const dayFlow: DayFlowColumn[] = [];

  const funnel: OpsFunnel = {
    pendingClose: emptySegment(),
    awaitingDraw: emptySegment(),
    awaitingResult: emptySegment(),
    awaitingSettle: emptySegment(),
    processing: emptySegment(),
    totalEnded: 0,
    anomalies: { pendingOpen: 0, halted: 0, needsResettle: 0, neverOpened: 0 },
  };

  let sellingCount = 0;
  let sellingRevenue = 0;
  let sellingEntries = 0;
  let sellingSets = 0;
  let sellingExposureRaw = 0;
  const sellingRevenuesPositive: number[] = [];

  let boundaryDrawId: string | null = null;
  let boundaryDrawTimeMs = -Infinity;

  let stuckCount = 0;
  let nextBoundaryAtMs = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const ts = parseDrawTimestamps(row);
    const state = deriveDrawState(row, ts, nowMs, thresholds);
    const derived: DerivedRow = { ...row, ...state, ts };
    derivedRows.push(derived);

    if (state.health === "stuck") {
      stuckCount += 1;
    }

    dayFlow.push({
      drawId: row.drawId,
      drawNo: row.drawNo,
      drawTimeMs: ts.drawTimeMs,
      gate: state.gate,
      stage: state.stage,
      health: state.health,
      revenue: row.revenue,
      entries: row.entries,
      sets: row.sets,
      exposureRaw: row.exposureRaw,
    });

    // Biên "kỳ hiện tại" = kỳ có `drawTime` (giờ quay THEO SCHEDULE, bất biến khi vận hành bình
    // thường) LỚN NHẤT mà đã tới. KHÔNG dùng `closeAt` (bug đã đo 09/09): `CloseSalesUseCase`
    // ghi đè `sales.closeAt = new Date()` khi staff bấm đóng bán TAY — 1 kỳ tồn đọng từ sáng
    // (VD giờ quay 07:12) bị đóng tay lúc 14:27 sẽ có `closeAt ≈ 14:27`, LỚN HƠN closeAt của mọi
    // kỳ đang bán bình thường khác → hjack biên "hiện tại" về đúng kỳ tồn đọng đó (Dải kỳ trỏ
    // sai "kỳ hiện tại" = kỳ 07:12 dù giờ thực đã 14:27). `drawTime` chỉ đổi qua use-case
    // reschedule riêng (`update-schedule.ts`), KHÔNG bị đóng/mở bán tay chạm vào → an toàn làm
    // mốc so sánh dù kỳ có bị xử lý tồn đọng ngoài thứ tự thời gian thực.
    if (ts.drawTimeMs <= nowMs && ts.drawTimeMs > boundaryDrawTimeMs) {
      boundaryDrawTimeMs = ts.drawTimeMs;
      boundaryDrawId = row.drawId;
    }

    if (state.gate === SaleGate.Open) {
      sellingCount += 1;
      sellingRevenue += row.revenue;
      sellingEntries += row.entries;
      sellingSets += row.sets;
      sellingExposureRaw += row.exposureRaw;
      if (row.revenue > 0) {
        sellingRevenuesPositive.push(row.revenue);
      }
    } else if (state.gate === SaleGate.PendingOpen) {
      funnel.anomalies.pendingOpen += 1;
    } else if (state.gate === SaleGate.Halted) {
      funnel.anomalies.halted += 1;
    } else {
      // gate = Ended
      const isStuck = state.health === "stuck";
      switch (state.stage) {
        case OpsStage.PendingClose:
          addToSegment(funnel.pendingClose, row.revenue, isStuck);
          funnel.totalEnded += 1;
          break;
        case OpsStage.AwaitingDraw:
          addToSegment(funnel.awaitingDraw, row.revenue, isStuck);
          funnel.totalEnded += 1;
          break;
        case OpsStage.AwaitingResult:
          addToSegment(funnel.awaitingResult, row.revenue, isStuck);
          funnel.totalEnded += 1;
          break;
        case OpsStage.AwaitingSettle:
          addToSegment(funnel.awaitingSettle, row.revenue, isStuck);
          funnel.totalEnded += 1;
          break;
        case OpsStage.Settling:
        case OpsStage.Voiding:
          addToSegment(funnel.processing, row.revenue, isStuck);
          funnel.totalEnded += 1;
          break;
        case OpsStage.NeedsResettle:
          funnel.anomalies.needsResettle += 1;
          break;
        case OpsStage.NeverOpened:
          funnel.anomalies.neverOpened += 1;
          break;
        case OpsStage.Selling:
          // Không xảy ra khi gate = Ended — nhánh phòng thủ, không đóng góp vào phễu.
          break;
        default: {
          const _exhaustive: never = state.stage;
          break;
        }
      }
    }

    const rowNextBoundary = nextRowBoundaryMs(derived, nowMs, thresholds);
    if (rowNextBoundary !== null && rowNextBoundary < nextBoundaryAtMs) {
      nextBoundaryAtMs = rowNextBoundary;
    }
  }

  // Median doanh thu trong CÙNG gate Open, revenue > 0 (guideline §9.2) — `toSorted()`, không
  // `sort()` (KHÔNG mutate mảng vừa thu thập — dù mảng này cục bộ nên an toàn, giữ quy tắc chung).
  const sortedRevenues = sellingRevenuesPositive.toSorted((a, b) => a - b);
  const median = medianOf(sortedRevenues);

  const outliers: SellingOutlier[] = [];
  if (median > 0) {
    for (const row of derivedRows) {
      if (row.gate !== SaleGate.Open) {
        continue;
      }
      if (row.revenue > 3 * median) {
        outliers.push({
          drawId: row.drawId,
          drawNo: row.drawNo,
          revenue: row.revenue,
          multiplierOfMedian: row.revenue / median,
        });
      }
    }
  }

  const selling: SellingSummary = {
    count: sellingCount,
    revenue: sellingRevenue,
    entries: sellingEntries,
    sets: sellingSets,
    exposureRaw: sellingExposureRaw,
    avgRevenuePerDraw: sellingCount > 0 ? sellingRevenue / sellingCount : 0,
    outliers,
  };

  return {
    rows: derivedRows,
    funnel,
    selling,
    boundaryDrawId,
    dayFlow: dayFlow.toSorted((a, b) => a.drawTimeMs - b.drawTimeMs),
    stuckCount,
    nextBoundaryAtMs,
  };
}
