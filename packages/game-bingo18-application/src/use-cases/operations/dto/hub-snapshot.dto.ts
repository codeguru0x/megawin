import type { DrawStatus } from "@megawin/game-core/entities";

/** Input snapshot Ops Hub — đa kỳ, 1 lần fetch cho cả trang. */
export interface OpsHubSnapshotInput {
  /** Trần số kỳ trả về. Bỏ trống = `DEFAULT_HUB_LIMIT` (500, xem use-case). */
  limit?: number;
}

/**
 * Một dòng kỳ quay trên Ops Hub — gộp draw + stats + alert counts.
 *
 * TOÀN BỘ field là RAW. Server KHÔNG dẫn xuất `gate`/`stage`/`health`/`ageInStage` —
 * xem JSDoc {@link OpsHubSnapshotOutput.serverNow} để biết vì sao. FE derive bằng 1 hàm
 * pure duy nhất (`derive-draw-state.ts`).
 *
 * Shape khớp Keno `OpsHubDrawRow` (kể cả `exposureRaw`) — FE Bingo18 mirror 1:1. Khác
 * Keno chỉ ở **nguồn** `exposureRaw`: Bingo18 tính lúc đọc qua `computeBingo18Exposure`,
 * không đọc từ field lưu trên stats doc.
 */
export interface OpsHubDrawRow {
  /** `YYYY-MM-DD.NNN`. Khoá của mọi action trên dòng này. */
  drawId: string;
  /** Số kỳ trong ngày (1-based), hiển thị ngắn trên card/cột `Kỳ`. */
  drawNo: number;
  /** Trạng thái kỳ (raw). Đầu vào dẫn xuất `SaleGate`/`OpsStage` ở FE. */
  status: DrawStatus;
  /** Giờ quay (ISO 8601). Mốc so `now` để biết đã qua giờ quay chưa. */
  drawTime: string;
  /**
   * Hết giờ nhận cược (ISO 8601) — KHOÁ CỨNG tự động, không phải mốc "phải đóng sổ".
   *
   * Đây là TRỤC CHÍNH của cả trang Hub: `now >= closeAt` là điều kiện duy nhất xác định
   * `SaleGate = Ended` (không phải `status`).
   */
  closeAt: string;
  /**
   * Bắt đầu nhận cược (ISO 8601), `null` khi kỳ CHƯA TỪNG mở bán.
   *
   * `null` là thông tin nghiệp vụ, không phải thiếu dữ liệu: kỳ `scheduled` chưa mở bán
   * thì không có `openAt`.
   */
  openAt: string | null;
  /**
   * Thời điểm publish kết quả (ISO 8601), `null` khi chưa có kết quả.
   *
   * Cặp với `settledAt` để phát hiện `NeedsResettle`: `settledAt < publishedAt` nghĩa là
   * kết quả đã bị sửa SAU khi kết sổ → tiền đã trả có thể sai, phải kết sổ lại.
   */
  publishedAt: string | null;
  /** Thời điểm kết sổ gần nhất (ISO 8601), `null` khi chưa kết sổ. */
  settledAt: string | null;
  /**
   * Lần ghi cuối vào doc kỳ (ISO 8601).
   *
   * Mốc DUY NHẤT để tính `ageInStage` cho `Settling`/`Voiding` — hai chặng này không có
   * timestamp riêng trên doc. Vì vậy field này BẮT BUỘC có, không phải "nice to have".
   */
  updatedAt: string;

  /** Doanh thu (VND). `0` khi kỳ chưa có cược nào. */
  revenue: number;
  /** Số vé. `0` khi chưa có cược. */
  entries: number;
  /** Số bộ số. `0` khi chưa có cược. */
  sets: number;
  /**
   * Hoa hồng đại lý cộng dồn (VND) — **SỐ THẬT, không ước tính**. `0` khi chưa có cược.
   *
   * Tích luỹ từ `entry.tenant.commissionAmount` (snapshot lúc place-bet theo `commissionRate`
   * RIÊNG của từng tenant). FE hiện thẳng con số này, **KHÔNG** tự tính
   * `revenue × defaultCommissionRate`.
   */
  commission: number;
  /** Số cược lớn vượt ngưỡng `largeBetAmount`. `0` khi chưa có cược. */
  largeBetCount: number;
  /**
   * Exposure xấu nhất (VND) — tính lúc đọc qua `computeBingo18Exposure(byPlayType, prizes)`.
   *
   * Bingo18 KHÔNG lưu exposure trên stats doc (khác Keno `exposure.worstCaseTotal`).
   * UI so với `exposureWarnPct` (map từ `alerts.exposureWarnRevenuePct` — % của revenue).
   */
  exposureRaw: number;
  /** Số alert chưa resolved (`new` + `ack`). `0` khi không có. */
  alertsOpen: number;
  /** Số alert `critical` chưa resolved — quyết định tô đỏ dòng. `0` khi không có. */
  alertsCritical: number;
  /** `true` khi worker đã chốt stats (`final`) — số liệu không đổi nữa. */
  statsFinal: boolean;
}

/**
 * Ngưỡng per-chặng để FE tô màu `health` (warn/stuck) — đọc từ config, KHÔNG hardcode ở FE.
 *
 * `awaitingResultWarnSec`/`awaitingResultStuckSec` tính động = 2×/4× `drawIntervalMinutes`
 * (Bingo18 6 phút) — KHÔNG phải hằng số cứng copy từ Keno (8 phút).
 *
 * Field còn lại (`pendingCloseWarnSec`…) hiện dùng default cứng trong use-case vì
 * `OpsConfig` CHƯA có các field này.
 */
export interface OpsHubThresholds {
  /** `PendingClose` cảnh báo khi kỳ cũ nhất treo quá X giây (~90 phút). */
  pendingCloseWarnSec: number;
  /** `PendingClose` báo stuck khi kỳ cũ nhất treo quá X giây (~4 giờ). */
  pendingCloseStuckSec: number;
  /** `AwaitingResult` cảnh báo khi treo quá X giây (~2 × chu kỳ kỳ). */
  awaitingResultWarnSec: number;
  /** `AwaitingResult` báo stuck khi treo quá X giây (~4 × chu kỳ kỳ). */
  awaitingResultStuckSec: number;
  /** `AwaitingSettle` cảnh báo khi treo quá X giây (~15 phút). */
  awaitingSettleWarnSec: number;
  /** `AwaitingSettle` báo stuck khi treo quá X giây (~60 phút). */
  awaitingSettleStuckSec: number;
  /** `Settling`/`Voiding` báo stuck khi treo quá X giây (~5 phút) — nên xong trong giây. */
  processingStuckSec: number;
  /** Ngưỡng cược lớn (VND) — từ `OpsAlertsConfig.largeBetAmount`, KHÔNG hardcode. */
  largeBetAmount: number;
  /**
   * % revenue để cảnh báo exposure — map từ Bingo18 `OpsAlertsConfig.exposureWarnRevenuePct`
   * (KHÔNG phải Keno `exposureWarnPct`). DTO giữ tên `exposureWarnPct` để FE mirror Keno.
   */
  exposureWarnPct: number;
}

/**
 * Snapshot toàn bộ Ops Hub — 1 response cho 1 lần poll. Nguồn DUY NHẤT cho trang Hub.
 */
export interface OpsHubSnapshotOutput {
  /** Các kỳ chưa hoàn thành, sort `drawId` GIẢM (kỳ mới nhất trước). */
  rows: OpsHubDrawRow[];
  /**
   * Giờ SERVER lúc tạo snapshot (ISO 8601) — BẮT BUỘC dùng thay `Date.now()` của client.
   *
   * Toàn bộ `SaleGate`/`OpsStage`/`StageHealth` dẫn xuất bằng cách so `now` với `closeAt`
   * và `drawTime`. Laptop staff lệch giờ 5 phút sẽ phân loại SAI cả trang.
   *
   * FE tính `offset = serverNow − Date.now()` một lần mỗi lần fetch, rồi dùng
   * `Date.now() + offset` cho mọi phép dẫn xuất.
   *
   * KHÔNG được đưa field này vào ETag ở route — mọi lần fetch `serverNow` khác nhau nên
   * ETag ghép nó sẽ KHÔNG BAO GIỜ khớp `If-None-Match`, vô hiệu hoá 304 hoàn toàn.
   */
  serverNow: string;
  /**
   * `true` khi số kỳ chưa hoàn thành VƯỢT trần `limit` → `rows` bị cắt.
   *
   * FE PHẢI hiện banner destructive. Im lặng bỏ sót kỳ là lỗi nặng nhất của trang này.
   */
  truncated: boolean;
  /** Ngưỡng từ config để FE tô màu — KHÔNG hardcode ở FE. */
  thresholds: OpsHubThresholds;
  /** Nhịp poll (giây), từ `ops.stats.tickSeconds`. FE dùng làm `refetchInterval` + `staleTime`. */
  pollSeconds: number;
  /**
   * Khoảng cách giữa 2 kỳ (phút) — Bingo18 6, Keno 8, CẤU HÌNH ĐƯỢC.
   *
   * FE cần để: (a) tính ngưỡng `awaitingResultWarnSec` ≈ 2 × chu kỳ; (b) render trục Focus Rail.
   */
  drawIntervalMinutes: number;
  /** Số giây trước giờ quay mà `closeAt` được đặt — Bingo18 30, Keno 60. Cấu hình được. */
  salesCloseBeforeSeconds: number;
}
