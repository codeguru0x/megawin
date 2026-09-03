import type { AuditActor } from "@megawin/audit/logger";
import type { DrawEntity } from "@megawin/game-bingo18/entities";
import type { DrawStatus } from "@megawin/game-core/entities";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import type { WireType } from "@megawin/shared/types";

// ─────────────────────────────────────────────
// CreateDraw (batch)
// ─────────────────────────────────────────────

export interface CreateDrawInputItem {
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Thời điểm quay (ISO 8601, timezone +07:00). */
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
   * Trần số lượng: `BINGO18_CREATE_DRAW_BATCH_MAX` (dùng chung với Zod schema route + UI).
   */
  draws: CreateDrawInputItem[];
}

export interface CreateDrawOutputItem {
  /** ID duy nhất của kỳ quay (format: bingo18_{drawDate}_{drawNo}). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1, 2, 3, …). */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601) – trước drawTime một khoảng cấu hình. */
  closeAt: string;
  /** Ngày tài chính áp dụng cho kỳ này (YYYY-MM-DD). */
  financialDate: string;
  /** Trạng thái ban đầu của kỳ quay (scheduled | salesOpen). */
  status: string;
}

export interface CreateDrawOutput {
  /** Danh sách các kỳ quay vừa được tạo. */
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
  /** Giờ quay, ISO 8601 có offset `+07:00` (VD `"2026-08-31T06:06:00+07:00"`). */
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
  /** ID của kỳ quay cần thao tác. */
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
  /** ID kỳ quay đã chuyển trạng thái. */
  drawId: string;
  /** Trạng thái trước khi chuyển. */
  previousStatus: string;
  /** Trạng thái sau khi chuyển. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult — single entry point cho "nhập/sửa kết quả"
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** ID kỳ quay cần công bố kết quả. */
  drawId: string;
  /** 3 số kết quả (mỗi số 1-6), ví dụ [3, 5, 2]. */
  numbers: number[];
  /** Tham chiếu kết quả Vietlott (nếu đồng bộ từ Vietlott). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott. */
    drawPeriod: string;
    /** Ngày quay Vietlott (YYYY-MM-DD). */
    drawDate: string;
  };
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface PublishResultOutput {
  /** ID kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái sau khi công bố (published). */
  status: string;
  /** Kết quả quay. */
  result: {
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle / TriggerResettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** ID kỳ quay cần trigger settle. */
  drawId: string;

  /** ARN của Step Function để kết sổ. */
  SETTLE_SFN_ARN: string;

  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface TriggerSettleOutput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Trạng thái sau khi trigger (settling). */
  status: string;
}

export interface TriggerResettleInput {
  /** ID kỳ quay cần resettle. */
  drawId: string;
  /** ARN của Step Function resettle Bingo 18 (orchestrate cả Settle SFN bên trong). */
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
  /** Lọc theo trạng thái kỳ quay (scheduled, salesOpen, salesClosed, …). */
  status?: DrawStatus;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  fromDate?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  toDate?: string;
  /** Trang hiện tại (1-based). Default 1. */
  page?: number;
  /** Số bản ghi mỗi trang. Default 20. */
  size?: number;
}

export interface DrawSummary {
  /** MongoDB document ID. */
  id: string;
  /** ID logic kỳ quay (bingo18_{drawDate}_{drawNo}). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** true nếu đã có kết quả quay (numbers + sum). */
  hasResult: boolean;
  /** Kết quả quay — 3 số xúc xắc và tổng. */
  result?: {
    /** 3 số xúc xắc (1-6). */
    diceNumbers: number[];
    /** Tổng 3 số (3-18). */
    sum: number;
  };
  /** Số lượng entry đã tham gia kỳ này. */
  ticketEntryCount?: number;
  /** Tổng doanh thu (VND) từ entries. */
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
  /** Danh sách kỳ quay tóm tắt. */
  draws: DrawSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Kích thước trang. */
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  /** ID kỳ quay cần xem chi tiết. */
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Toàn bộ thông tin kỳ quay — Date fields đã serialize thành ISO string qua JSON response. */
  draw: WireType<DrawEntity>;
}

// ─────────────────────────────────────────────
// GetVietlottSuggestion — gợi ý mã kỳ Vietlott cho dialog publish (P2 mirror P1.3)
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
  /** Dàn số trúng thưởng dạng flat (3 phần tử, giữ thứ tự quay) — mapping sang `diceNumbers` do frontend tự làm. `null` khi `found = false`. */
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
