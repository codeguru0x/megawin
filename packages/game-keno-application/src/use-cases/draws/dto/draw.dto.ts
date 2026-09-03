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
  /**
   * Danh sách kỳ cần tạo — **toàn bộ phải cùng một `drawDate`** (use-case reject nếu lệch).
   *
   * Vì sao chỉ 1 ngày: `drawNo` cấp từ counter theo từng ngày và mọi guard sức chứa
   * (`computeDrawDayCapacity`) đều tính trên phạm vi 1 ngày. Cho lô trải nhiều ngày thì
   * thông báo lỗi trở nên vô nghĩa ("còn 3 kỳ" — của ngày nào?) và staff không kiểm soát
   * được mình vừa tạo gì. Cần nhiều ngày ⇒ bấm tạo nhiều lần.
   *
   * Trần số lượng: `KENO_CREATE_DRAW_BATCH_MAX` (dùng chung với Zod schema route + UI).
   */
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
  /**
   * Ngày cần tạo kỳ, `"YYYY-MM-DD"` (giờ VN). Bỏ trống = hôm nay.
   *
   * Preview luôn thuộc **đúng một ngày** — không còn cross-day rollover như bản cũ. Lý do:
   * lô tạo kỳ giờ chỉ nhắm 1 ngày (staff chọn ngày tường minh), nên nếu tự nhảy sang ngày kế
   * tiếp thì `drawNo` được cấp từ counter của ngày khác mà UI vẫn hiển thị chung một bảng —
   * staff không nhận ra mình đang tạo kỳ cho 2 ngày.
   */
  drawDate?: string;
}

/** Một kỳ quay **gợi ý** (chưa tồn tại trong DB) — output của `PreviewDrawsUseCase`. */
export interface PreviewDrawItem {
  /**
   * Số kỳ **dự kiến** trong ngày. CHỈ để hiển thị: khi tạo thật, server cấp lại từ atomic
   * counter (`getNextDrawNoBatch`) nên số cuối cùng có thể lệch nếu người khác vừa tạo kỳ
   * cho cùng ngày. Client KHÔNG được gửi giá trị này lên khi tạo.
   */
  drawNo: number;
  /** Ngày quay `"YYYY-MM-DD"` — mọi item trong một response đều CÙNG một ngày. */
  drawDate: string;
  /** Giờ quay, ISO 8601 có offset `+07:00` (VD `"2026-08-31T06:08:00+07:00"`). */
  drawTime: string;
  /** Thời điểm đóng bán = `drawTime − play.salesCloseBeforeSeconds`, ISO 8601. */
  closeAt: string;
}

export interface PreviewDrawsOutput {
  /** Ngày đã dùng để tính preview (echo lại input sau khi default về hôm nay). */
  drawDate: string;
  /**
   * Số kỳ tối đa/ngày theo lịch quay trong game config — mẫu số của "còn N/M kỳ" trên UI.
   *
   * Chỉ để hiển thị bối cảnh. Số kỳ staff thực sự tạo được là `draws.length`.
   */
  maxPerDay: number;
  /**
   * Các kỳ **còn tạo được**, sort theo giờ quay tăng dần. Rỗng ⇒ ngày này không còn slot nào.
   *
   * Đây là output DUY NHẤT staff cần: `draws.length` = số kỳ còn tạo được. KHÔNG trả về chi
   * tiết "vì sao hết" (đã qua giờ / đã tạo đủ) — cách xử lý của staff giống nhau trong cả 2
   * trường hợp là chọn ngày khác, nên tách ra chỉ thêm field mà không thêm quyết định nào.
   *
   * Client hiển thị TOÀN BỘ mảng này rồi cắt theo số kỳ staff muốn tạo (client-side slice) —
   * KHÔNG gọi lại API khi staff đổi số lượng, vì tập slot khả dụng không phụ thuộc số lượng.
   */
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

// ─────────────────────────────────────────────
// GetVietlottResult — tự lấy kết quả Vietlott đã publish (ResultFeed) điền form publish
// ─────────────────────────────────────────────

export interface GetVietlottResultInput {
  /** Mã kỳ Vietlott — khớp `vietlottRef.drawPeriod` đang nhập ở dialog publish. */
  drawPeriod: string;
}

export interface GetVietlottResultOutput {
  /** `false` ⇒ ResultFeed chưa có kết quả cho kỳ này — KHÔNG phải lỗi, chỉ chưa sẵn sàng. */
  found: boolean;
  /** Dàn số trúng thưởng dạng flat — mapping sang field form (Keno: gán thẳng) do frontend tự làm. `null` khi `found = false`. */
  numbers: string[] | null;
  /** Ngày quay theo nguồn Vietlott, format `"YYYY-MM-DD"`. `null` khi `found = false`. */
  drawDateSource: string | null;
  /** Thời điểm ResultFeed publish kết quả này, ISO 8601. `null` khi `found = false`. */
  publishedAt: string | null;
  /** `true` khi 1 người đã xác nhận kết quả. `false` = máy tự chốt theo consensus nguồn. `null` khi `found = false`. */
  verifiedByHuman: boolean | null;
  /** Số nguồn đã đồng ý với kết quả này. `null` khi `found = false`. */
  sourceCount: number | null;
}
