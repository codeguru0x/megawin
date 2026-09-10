/**
 * Types kết quả cho Ops Hub — repo methods đọc THIN, nhiều kỳ, dùng để dựng 1 dòng bảng.
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 * Giữ `Date` thô (KHÔNG serialize sang string) — đây là kết quả REPO; tầng use-case
 * (`GetOpsHubSnapshotUseCase`) mới quyết định serialize sang ISO string cho DTO
 * (`OpsHubDrawRow`). Không trộn 2 tầng: repo trả kiểu Mongo-native, use-case build DTO.
 *
 * ## Khác Keno — exposure
 *
 * Keno lưu `exposure.worstCaseTotal` trên stats doc → `HubStatsRow.exposureRaw` đọc thẳng.
 * Bingo18 **KHÔNG** lưu exposure trên doc (bucket RAW tuyến tính; max-over-216 tính lúc đọc
 * qua `computeBingo18Exposure`). Vì vậy:
 * - `HubStatsRow` có `byPlayType` (input tính exposure) và **KHÔNG** có `exposureRaw`.
 * - `GetOpsHubSnapshotUseCase.buildRow` gọi `computeBingo18Exposure` → ghi `exposureRaw`
 *   vào `OpsHubDrawRow` (DTO giữ shape giống Keno để FE mirror 1:1).
 */

import type { Bingo18ByPlayType } from "@megawin/game-bingo18/entities";
import type { DrawStatus } from "@megawin/game-core/entities";

/**
 * 1 dòng draw thin cho Ops Hub — nguồn từ `DrawRepository.listUnfinishedDrawRows`.
 *
 * Field RAW, KHÔNG dẫn xuất `gate`/`stage`/`health` — dẫn xuất trạng thái ở server là SAI
 * (phụ thuộc `now` vs `closeAt`; đếm bằng `status` thô không khớp bảng staff đang nhìn).
 */
export interface HubDrawRow {
  /** `YYYY-MM-DD.NNN`. Khoá join sang stats/alerts, và param của mọi action. */
  drawId: string;
  /** Số kỳ trong ngày (1-based). */
  drawNo: number;
  /** Trạng thái kỳ (raw) — đầu vào dẫn xuất `SaleGate`/`OpsStage` ở FE. */
  status: DrawStatus;
  /** Giờ quay — mốc so `now` để biết đã qua giờ quay chưa. */
  drawTime: Date;
  /** Hết giờ nhận cược — TRỤC CHÍNH của cả trang Hub (`sales.closeAt`). */
  closeAt: Date;
  /**
   * Bắt đầu nhận cược. `undefined` khi kỳ CHƯA TỪNG mở bán — field optional trên
   * `DrawSales` (`openAt?: Date`), không phải thiếu dữ liệu.
   */
  openAt: Date | undefined;
  /**
   * Thời điểm publish kết quả. `undefined` khi chưa có kết quả — `DrawDoc.result` là
   * optional field, không phải thiếu dữ liệu.
   */
  publishedAt: Date | undefined;
  /** Thời điểm kết sổ gần nhất. `undefined` khi chưa kết sổ. */
  settledAt: Date | undefined;
  /** Lần ghi cuối vào doc kỳ — mốc DUY NHẤT tính `ageInStage` cho `Settling`/`Voiding`. */
  updatedAt: Date;
}

/**
 * Stats thin cho Ops Hub — nguồn từ `BettingStatsRepository.getRowsByDrawIds`.
 *
 * Kỳ chưa có stats doc (chưa ai cược) KHÔNG có dòng trả về — use-case merge bằng `Map`
 * và điền `0`, KHÔNG để `undefined` lọt DTO.
 *
 * `byPlayType` là input `computeBingo18Exposure` ở use-case — KHÔNG có `exposureRaw` ở
 * tầng repo (xem JSDoc file). Kỳ vừa `ensureDocs` / chỉ có partial `$inc` → `byPlayType`
 * có thể `undefined` hoặc thiếu nhánh; use-case PHẢI `normalizeByPlayType()` trước khi tính
 * exposure (không chỉ `?? createEmptyByPlayType()`).
 */
export interface HubStatsRow {
  /** `YYYY-MM-DD.NNN` — khoá merge với `HubDrawRow`. */
  drawId: string;
  /** `true` khi worker đã chốt stats — số liệu không đổi nữa. */
  final: boolean;
  /** Lần worker cập nhật gần nhất — 1 thành phần của ETag ở route. */
  updatedAt: Date;
  /** Doanh thu (VND). */
  revenue: number;
  /** Số entry. */
  entries: number;
  /** Số bộ số. */
  sets: number;
  /**
   * Hoa hồng đại lý cộng dồn (VND) — **SỐ THẬT, không phải ước tính**.
   *
   * Nguồn: `totals.commission` do worker `$inc` mỗi tick từ `entry.tenant.commissionAmount`,
   * mà giá trị đó được snapshot lúc place-bet theo `commissionRate` RIÊNG của từng tenant.
   * KHÔNG thay bằng `revenue × defaultCommissionRate` ở FE.
   */
  commission: number;
  /** Số cược lớn vượt ngưỡng `largeBetAmount`. */
  largeBetCount: number;
  /**
   * Full-bucket 38 bucket — input `computeBingo18Exposure`. `undefined` khi doc mới seed
   * chưa có tick `applyDelta` (chưa ai cược).
   */
  byPlayType: Bingo18ByPlayType | undefined;
}

/**
 * Đếm alert đang mở (`new` + `ack`, KHÔNG tính `resolved`) theo 1 kỳ — nguồn từ
 * `OpsAlertRepository.countByDrawIds`.
 */
export interface HubAlertCounts {
  /** Tổng alert chưa resolved. */
  open: number;
  /** Alert `severity: critical` chưa resolved — quyết định tô đỏ dòng. */
  critical: number;
}
