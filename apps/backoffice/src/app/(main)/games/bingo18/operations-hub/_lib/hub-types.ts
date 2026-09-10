/**
 * Ops Hub — Types dùng chung giữa derive/context/UI. Tách riêng khỏi `derive-draw-state.ts`
 * (thuần hàm pure trạng thái 1 dòng) để file đó không phình thêm type tổng hợp cấp trang.
 */

import type { OpsHubDrawRow } from "@megawin/game-bingo18-application/use-cases/operations";

import type { DrawOpsState, OpsStage, ParsedDrawTimestamps, SaleGate, StageHealth } from "./derive-draw-state";

/** 1 dòng đã gộp raw + state dẫn xuất + timestamp đã parse — thứ mọi zone render. */
export type DerivedRow = OpsHubDrawRow &
  DrawOpsState & {
    ts: ParsedDrawTimestamps;
  };

/** 1 đoạn phễu khối (A) — 1 `OpsStage` × {count, revenue}. */
export interface FunnelSegment {
  count: number;
  revenue: number;
  /** Có ≥1 kỳ `health = stuck` trong đoạn này — bật `animate-pulse` icon. */
  hasStuck: boolean;
}

/** Phễu vận hành khối (A) — 5 đoạn đúng thứ tự dòng chảy + dòng bất thường rời rạc. */
export interface OpsFunnel {
  pendingClose: FunnelSegment;
  awaitingDraw: FunnelSegment;
  awaitingResult: FunnelSegment;
  awaitingSettle: FunnelSegment;
  /** Settling + Voiding gộp 1 đoạn hiển thị (guideline §3.1: `Settling/Voiding`). */
  processing: FunnelSegment;
  /** Tổng số kỳ `gate = Ended` — mẫu số cho tỉ lệ chiều rộng đoạn. */
  totalEnded: number;
  /** Bất thường rời rạc — số lượng nhỏ nhưng nghiêm trọng, không đưa vào đoạn phễu. */
  anomalies: {
    pendingOpen: number;
    halted: number;
    needsResettle: number;
    neverOpened: number;
  };
}

/** 1 kỳ outlier trong khối (B) — doanh thu lệch median cùng gate (guideline §9.2). */
export interface SellingOutlier {
  drawId: string;
  drawNo: number;
  revenue: number;
  /** Bội số so với median cùng gate — `null` khi outlier là "chưa có vé" (không phải đột biến). */
  multiplierOfMedian: number | null;
}

/** Tổng hợp khối (B) — tiền đang bán, KHÔNG có action (guideline §3.2). */
export interface SellingSummary {
  count: number;
  revenue: number;
  entries: number;
  sets: number;
  exposureRaw: number;
  /** `revenue / count`, `0` khi `count = 0` — thay cho "so cùng giờ hôm qua" (hoãn sang P2, §3.5). */
  avgRevenuePerDraw: number;
  outliers: SellingOutlier[];
}

/** 1 cột Day Flow — input tối thiểu để vẽ 2 tầng (chặng + tiền), guideline §4.2. */
export interface DayFlowColumn {
  drawId: string;
  drawNo: number;
  drawTimeMs: number;
  gate: SaleGate;
  stage: OpsStage;
  health: StageHealth;
  revenue: number;
  entries: number;
  sets: number;
  exposureRaw: number;
}

/** Kết quả của 1 vòng lặp derive toàn bộ `rows` (guideline §5.5 — 1 vòng, không nhiều `.filter()`). */
export interface HubDerived {
  rows: DerivedRow[];
  funnel: OpsFunnel;
  selling: SellingSummary;
  /**
   * `drawId` của "kỳ hiện tại" — kỳ có `drawTime` (giờ quay theo schedule) LỚN NHẤT mà `drawTime
   * <= now`. `null` nếu chưa có. KHÔNG dùng `closeAt` làm mốc — xem comment tại nơi tính trong
   * `derive-hub-summary.ts` (bug đã đo 09/09: đóng bán tay 1 kỳ tồn đọng ghi đè `closeAt` bằng
   * lúc bấm nút, hjack biên "hiện tại" về đúng kỳ tồn đọng đó).
   */
  boundaryDrawId: string | null;
  /** Cột Day Flow, sort theo `drawTimeMs` tăng — dùng thẳng cho Zone 3. */
  dayFlow: DayFlowColumn[];
  /** Tổng số kỳ `health = stuck` toàn trang — dùng cho banner + âm thanh (guideline §8.2). */
  stuckCount: number;
  /** Mốc gần nhất (epoch ms) mà BẤT KỲ kỳ nào đổi `gate`/`stage`/`health` — hẹn `setTimeout` tới đây. */
  nextBoundaryAtMs: number;
}
