import type { AuditActor } from "@megawin/audit/logger";
import type { DrawStatus } from "@megawin/game-core/entities";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import type { DrawEntity } from "@megawin/game-keno/entities";
import type { WireType } from "@megawin/shared/types";

// ─────────────────────────────────────────────
// CreateDraw (batch)
// ─────────────────────────────────────────────

export interface CreateDrawSlotInput {
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /**
   * Giờ quay ISO 8601 có timezone offset (ví dụ: "2026-03-20T06:08:00+07:00").
   * closeAt tính tự động phía server: drawTime − play.salesCloseBeforeSeconds.
   */
  drawTime: string;
  /** Mở bán ngay sau khi tạo. */
  openNow: boolean;
}

export interface CreateDrawInput {
  /** Danh sách kỳ cần tạo (trần suy ra từ config: đủ 2 ngày theo lịch play). */
  draws: CreateDrawSlotInput[];
}

export interface CreateDrawOutputItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  closeAt: string;
  financialDate: string;
  status: string;
}

export interface CreateDrawOutput {
  draws: CreateDrawOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  /** Số kỳ muốn preview. */
  count: number;
}

export interface PreviewDrawItem {
  drawNo: number;
  /** Ngày quay (YYYY-MM-DD) — có thể khác nhau khi cross-day rollover. */
  drawDate: string;
  drawTime: string;
  closeAt: string;
  /** salesOpen nếu trong [firstDrawTime, lastDrawTime], scheduled nếu ngoài. */
  status: string;
}

export interface PreviewDrawsOutput {
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  drawId: string;
}

/**
 * Input cho open/close-sales — kèm actor để ghi audit ai đổi trạng thái kỳ.
 * `actor` optional để không phá các caller nội bộ chỉ cần chuyển trạng thái;
 * route BO luôn truyền actor.
 */
export interface DrawTransitionInput extends DrawIdInput {
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface DrawTransitionOutput {
  drawId: string;
  previousStatus: string;
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult — single entry point cho "nhập/sửa kết quả".
// Nhận winningNumbers + vietlottRef? cùng lúc; use case tự phân biệt publish lần
// đầu, republish (mở resettle), hay chỉ cập nhật vietlottRef (không resettle).
// ─────────────────────────────────────────────

export interface PublishResultInput {
  drawId: string;
  /** 20 số trúng thưởng ("01"-"80"), unique, giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface PublishResultOutput {
  drawId: string;
  status: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle / TriggerResettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  drawId: string;
  /** ARN của Step Function kết sổ Keno. */
  SETTLE_SFN_ARN: string;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface TriggerSettleOutput {
  drawId: string;
  status: string;
}

export interface TriggerResettleInput {
  drawId: string;
  /** ARN của Step Function resettle Keno (orchestrate cả Settle SFN bên trong). */
  RESETTLE_SFN_ARN: string;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface TriggerResettleOutput {
  drawId: string;
  status: string;
  /** ID phiên resettle — staff theo dõi qua `metadata.resettleId` ở dispatch orders. */
  resettleId: string;
  /** Owner token của WorkerLock — debug / trace. */
  lockOwnerToken: string;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export interface DrawSummary {
  id: string;
  drawId: string;
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  drawNo: number;
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  status: string;
  hasResult: boolean;
  /** 20 số trúng thưởng (01-80), chỉ có sau khi published. */
  result?: { winningNumbers: string[] };
  ticketEntryCount?: number;
  totalRevenue?: number;
  /** Tổng tiền trả thưởng thực tế (VND) — từ stats.totalPayoutAmount. */
  totalPayout?: number;
  /** Thông tin tài chính tổng hợp sau settle. */
  financial?: {
    /** Tổng tiền thưởng đã trả. */
    totalPrizes: number;
    /** Tổng hoa hồng đại lý (VND). */
    totalAgentCommission: number;
    /** Lợi nhuận thực tế công ty (VND) = revenue - prizes - commission. */
    companyTake: number;
  };
}

export interface ListDrawsOutput {
  draws: DrawSummary[];
  page: number;
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Entity đầy đủ của kỳ quay — Date fields đã serialize thành ISO string qua JSON response. */
  draw: WireType<DrawEntity>;
}

// ─────────────────────────────────────────────
// GetVietlottSuggestion — gợi ý mã kỳ Vietlott cho dialog publish (P1.3)
// ─────────────────────────────────────────────

export interface GetVietlottSuggestionInput {
  drawId: string;
}

export interface GetVietlottSuggestionOutput {
  /** Mã kỳ Vietlott suy được, giữ zero-pad. `null` nếu không suy được — xem `reason`. */
  suggestedPeriod: string | null;
  /** Lý do `suggestedPeriod` là `null` — dùng để UI hiện đúng thông báo (overview §7.1). `null` khi suy được. */
  reason: VietlottSuggestionUnavailableReason | null;
  /** `drawDate` của CHÍNH kỳ đang publish — dùng để prefill ô ngày Vietlott, độc lập có neo hay không. */
  suggestedDrawDate: string;
}
