import type { AuditActor } from "@megawin/audit/logger";
import type { DrawStatus } from "@megawin/game-core/entities";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import type { DrawEntity, Max3dDrawResult } from "@megawin/game-max3d/entities";
import type { WireType } from "@megawin/shared/types";

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

/**
 * Thông tin override cho 1 kỳ trong batch tạo.
 * Nếu truyền `drawDate` + `drawTime`, backend dùng giá trị này thay vì tự tính từ lịch cố định.
 */
export interface CreateDrawItemOverride {
  /**
   * Ngày quay (format: `YYYY-MM-DD`).
   * Phải trùng với ngày T2/T4/T6 theo lịch Max 3D.
   */
  drawDate: string;
  /** Giờ quay ISO 8601 (VD: `2026-04-07T18:00:00+07:00`). */
  drawTime: string;
  /** Mở bán ngay khi tạo xong. Mặc định `true`. */
  openNow: boolean;
}

export interface CreateDrawsInput {
  /**
   * Danh sách kỳ cần tạo — mỗi phần tử tương ứng 1 slot lịch quay.
   * Backend dùng `drawDate` + `drawTime` từ input; nếu thiếu, tự tính theo lịch T2/T4/T6.
   */
  draws: CreateDrawItemOverride[];
}

export interface CreateDrawsOutputItem {
  /** Mã định danh kỳ quay (format: MAX3D-YYYYMMDD-NN). */
  drawId: string;
  /** Ngày quay thưởng (ISO date, vd: 2024-06-15). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Ngày tài chính áp dụng cho kỳ quay. */
  financialDate: string;
  /** Trạng thái kỳ quay sau khi tạo. */
  status: string;
}

export interface CreateDrawsOutput {
  /** Danh sách các kỳ quay vừa được tạo. */
  draws: CreateDrawsOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  /** Số kỳ cần xem trước. */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Trạng thái dự kiến của kỳ quay. */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước. */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** Mã định danh kỳ quay cần thao tác. */
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
  /** Mã định danh kỳ quay. */
  drawId: string;
  /** Trạng thái trước khi chuyển đổi. */
  previousStatus: string;
  /** Trạng thái sau khi chuyển đổi. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// GetVietlottSuggestion — gợi ý mã kỳ Vietlott cho dialog publish (P4)
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

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** Mã định danh kỳ quay cần công bố kết quả. */
  drawId: string;
  /** Kết quả quay thưởng: 20 bộ ba số (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba). */
  result: Max3dDrawResult;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott (vd: "00123"). */
    drawPeriod: string;
    /** Ngày quay của Vietlott (ISO date). */
    drawDate: string;
  };
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface PublishResultOutput {
  /** Mã định danh kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái kỳ quay sau khi công bố kết quả. */
  status: string;
  /** Kết quả quay thưởng kèm thời điểm công bố. */
  result: Max3dDrawResult & {
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle / TriggerResettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** Mã định danh kỳ quay cần đối soát. */
  drawId: string;

  /** ARN của Step Function để kết sổ. */
  SETTLE_SFN_ARN: string;

  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface TriggerSettleOutput {
  /** Mã định danh kỳ quay đã đối soát. */
  drawId: string;
  /** Trạng thái kỳ quay sau khi đối soát. */
  status: string;
}

export interface TriggerResettleInput {
  /** Mã định danh kỳ quay cần resettle. */
  drawId: string;
  /** ARN của Step Function resettle Max 3D (orchestrate cả Settle SFN bên trong). */
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
  /** Lọc theo trạng thái kỳ quay. */
  status?: DrawStatus;
  /** Lọc từ ngày (ISO date, bao gồm). */
  fromDate?: string;
  /** Lọc đến ngày (ISO date, bao gồm). */
  toDate?: string;
  /** Số trang hiện tại (bắt đầu từ 1). */
  page?: number;
  /** Số bản ghi mỗi trang. */
  size?: number;
}

export interface DrawSummary {
  /** ID nội bộ (primary key). */
  id: string;
  /** Mã định danh kỳ quay (format: MAX3D-YYYYMMDD-NN). */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  /** Đã có kết quả quay thưởng hay chưa. */
  hasResult: boolean;
  /** Kết quả quay — 20 bộ ba số chia 4 hạng. */
  result?: {
    special: string[];
    first: string[];
    second: string[];
    third: string[];
  };
  /** Số lượt đặt cược (ticket entries) trong kỳ. */
  ticketEntryCount?: number;
  /** Tổng doanh thu bán vé của kỳ. */
  totalRevenue?: number;
  /** Tổng tiền trả thưởng thực tế (VND) — từ stats.totalPayoutAmount. */
  totalPayout?: number;
  /** Thông tin tài chính tổng hợp của kỳ quay. */
  financial?: {
    /** Tổng tiền thưởng cố định đã trả. */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý. */
    totalAgentCommission: number;
    /** Lợi nhuận thực tế công ty (VND) = revenue - prizes - commission. */
    companyTake: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách kỳ quay tóm tắt. */
  draws: DrawSummary[];
  /** Số trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  /** Mã định danh kỳ quay cần xem chi tiết. */
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Thông tin chi tiết đầy đủ của kỳ quay — Date fields đã serialize thành ISO string qua JSON response. */
  draw: WireType<DrawEntity>;
}
