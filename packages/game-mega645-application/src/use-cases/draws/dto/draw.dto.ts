import type { AuditActor } from "@megawin/audit/logger";
import type { DrawStatus } from "@megawin/game-core/entities";
import type { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import type { DrawEntity, DrawNo } from "@megawin/game-mega645/entities";
import type { WireType } from "@megawin/shared/types";

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawSlotInput {
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-04-02T18:00:00+07:00").
   * closeAt tính tự động phía server: drawTime − play.salesCloseBeforeMinutes.
   */
  drawTime: string;
  /** Mở bán ngay sau khi tạo. */
  openNow: boolean;
}

export interface CreateDrawsInput {
  /** Danh sách kỳ cần tạo (1-12). */
  draws: CreateDrawSlotInput[];
}

export interface CreateDrawsOutputItem {
  /** ID duy nhất của kỳ quay (UUID / ULID). */
  drawId: string;
  /** Ngày quay thưởng, định dạng ISO date (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay (tuần tự tăng dần). */
  drawNo: number;
  /** Giờ quay thưởng, ví dụ "18:00". */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Ngày tài chính để ghi nhận doanh thu/chi phí. */
  financialDate: string;
  /** Trạng thái kỳ quay sau khi tạo (thường là "scheduled"). */
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
  /** Số kỳ cần xem trước (1-12). */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay thưởng dự kiến (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay dự kiến. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến. */
  drawTime: string;
  /** Thời điểm đóng bán vé dự kiến (ISO datetime). */
  closeAt: string;
  /** Trạng thái dự kiến (thường là "scheduled"). */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước (chưa lưu vào DB). */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** ID kỳ quay cần thao tác. */
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
  /** Trạng thái hiện tại sau khi chuyển. */
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
// GetVietlottResult — tự lấy kết quả Vietlott đã publish (ResultFeed) điền form publish
// ─────────────────────────────────────────────

export interface GetVietlottResultInput {
  /** Mã kỳ Vietlott — khớp `vietlottRef.drawPeriod` đang nhập ở dialog publish. */
  drawPeriod: string;
}

export interface GetVietlottResultOutput {
  /** `false` ⇒ ResultFeed chưa có kết quả cho kỳ này — KHÔNG phải lỗi, chỉ chưa sẵn sàng. */
  found: boolean;
  /** Dàn số trúng thưởng dạng flat (6 phần tử) — mapping sang field form do frontend tự làm. `null` khi `found = false`. */
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

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** ID kỳ quay cần công bố kết quả. */
  drawId: string;
  /** 6 số chính trúng thưởng ("01"-"45"), unique, draw order. */
  winningNumbers: string[];
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott gốc. */
    drawPeriod: string;
    /** Ngày quay của Vietlott (ISO date). */
    drawDate: string;
  };
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface PublishResultOutput {
  /** ID kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái sau khi công bố (thường là "published"). */
  status: string;
  /** Kết quả quay thưởng đã công bố. */
  result: {
    /** 6 số chính trúng thưởng ("01"-"45"), draw order. */
    winningNumbers: string[];
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** ID kỳ quay cần bắt đầu settle. */
  drawId: string;

  /** ARN của Step Function để kết sổ. */
  SETTLE_SFN_ARN: string;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface TriggerSettleOutput {
  /** ID kỳ quay đang được settle. */
  drawId: string;
  /** Trạng thái sau khi trigger (thường là "settling"). */
  status: string;
}

// ─────────────────────────────────────────────
// TriggerResettle
// ─────────────────────────────────────────────

export interface TriggerResettleInput {
  /** ID kỳ quay cần resettle. */
  drawId: string;
  /** ARN của Step Function resettle (orchestrate cả Settle SFN bên trong). */
  RESETTLE_SFN_ARN: string;
  /**
   * Xác nhận Quản trị hệ thống đã đồng ý thực hiện resettle cho scenario cần
   * can thiệp cycle thủ công (TYPE_B1 + TYPE_B2 cascade).
   *
   * - TYPE_A: bỏ qua — không cần xác nhận.
   * - TYPE_B1 / TYPE_B2: BẮT BUỘC `true`. Worker auto hoàn tiền + kết sổ lại
   *   payout (`skipCycleUpdate=true`), nhưng cycle do Quản trị hệ thống chốt
   *   thủ công sau mỗi kỳ. Thiếu xác nhận → reject `RESETTLE_REQUIRES_DBA`.
   */
  dbaConfirmed?: boolean;
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
// ReopenForCascade
// ─────────────────────────────────────────────

export interface ReopenForCascadeInput {
  /** ID kỳ T+n cần mở lại để cascade resettle (đang ở status Settled). */
  drawId: string;
  /**
   * Xác nhận Quản trị hệ thống đồng ý mở lại kỳ T+n trong cascade B2.
   * BẮT BUỘC `true` — reopen chỉ phục vụ cascade cần can thiệp cycle thủ công.
   * Thiếu → reject `RESETTLE_REQUIRES_DBA`.
   */
  dbaConfirmed?: boolean;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. Optional cho caller nội bộ. */
  actor?: AuditActor;
}

export interface ReopenForCascadeOutput {
  /** ID kỳ quay đã mở lại. */
  drawId: string;
  /** Trạng thái sau khi mở lại (luôn "published"). */
  status: string;
  /** Kết quả giữ nguyên + publishedAt mới re-stamp (ISO datetime). */
  result: {
    /** 6 số chính trúng thưởng ("01"-"45") — GIỮ NGUYÊN, không đổi. */
    winningNumbers: string[];
    /** Thời điểm re-stamp publishedAt (ISO datetime) — > settledAt. */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// ResettlePreflight
// ─────────────────────────────────────────────

export interface ResettlePreflightInput {
  /** ID kỳ quay cần phân tích tác động resettle. */
  drawId: string;
  /**
   * Kết quả dự kiến sau sửa — dùng để re-match kỳ T và phát hiện winner mới.
   * Mega 6/45: 6 số chính zero-padded ("01"–"45"), KHÔNG có bonus.
   */
  proposedWinningNumbers: string[];
}

export interface ResettlePreflightOutput {
  drawId: string;
  /**
   * Scenario phát hiện — xác định staff / DBA cần làm gì tiếp theo.
   * `TYPE_A`: tự động hoàn toàn.
   * `TYPE_B1`: auto payout, DBA cập nhật cycle thủ công (T là kỳ mới nhất).
   * `TYPE_B2`: cascade step-wise — resettle tuần tự từng kỳ (auto payout),
   *            DBA chốt cycle giữa các bước.
   * `LEDGER_MISSING`: ledger entry null dù kỳ đã settled — bất thường data
   *                   integrity, không xảy ra trong vận hành bình thường → báo kỹ thuật.
   */
  scenario: string;
  /** Chuỗi mô tả ngắn cho staff UI hiểu rõ tác động. */
  message: string;
  /**
   * Kết quả ĐỀ XUẤT có phát sinh JP winner hay không.
   * `false` khi scenario = LEDGER_MISSING (không thể xác định).
   */
  hasNewJpWinner: boolean;
  /**
   * Kết quả CŨ (đã settle trước) có JP winner hay không.
   * Dùng để hiển thị case "gỡ winner cũ" (có → không) cho staff.
   * `false` khi scenario = LEDGER_MISSING.
   */
  hadOldJpWinner: boolean;
  /**
   * Tổng số kỳ bị ảnh hưởng trong chain sau T (không tính T).
   * 0 khi TYPE_A hoặc LEDGER_MISSING.
   */
  chainLength: number;
  /**
   * Kỳ settle mới nhất trong chain bị ảnh hưởng.
   * undefined khi không có chain (TYPE_A, TYPE_B1).
   */
  lastAffectedDrawId?: string;
  /**
   * Danh sách drawId cần cascade resettle theo thứ tự (gồm cả T), sorted theo
   * `seq` ASC. Chỉ có giá trị khi TYPE_B2 — staff resettle tuần tự theo đúng
   * thứ tự này, DBA chốt cycle giữa mỗi kỳ.
   * undefined khi TYPE_A / TYPE_B1 / LEDGER_MISSING.
   */
  chainDrawIds?: string[];
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  /** Lọc theo trạng thái kỳ quay (tuỳ chọn). */
  status?: DrawStatus;
  /** Ngày bắt đầu lọc (ISO date, inclusive). */
  fromDate?: string;
  /** Ngày kết thúc lọc (ISO date, inclusive). */
  toDate?: string;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng bản ghi mỗi trang (mặc định 20). */
  size?: number;
}

export interface DrawSummary {
  /** MongoDB document ID. */
  id: string;
  /** ID kỳ quay (business key). */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: DrawNo;
  /** Giờ quay thưởng. */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Giá trị jackpot đầu kỳ (VND). */
  jackpotAmount?: number;
  /** Giá trị jackpot cuối kỳ sau khi settle (VND). */
  jackpotClosingAmount?: number;
  /** Kỳ quay đã có kết quả hay chưa. */
  hasResult: boolean;
  /** Kết quả quay thưởng (nếu có). */
  result?: {
    /** 6 số chính trúng thưởng ("01"-"45"), draw order. */
    winningNumbers: string[];
  };
  /** Kỳ này có phải kỳ split cycle không. */
  isSplitCycle?: boolean;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  /** Tổng số entry (lượt tham gia) trong kỳ. */
  ticketEntryCount?: number;
  /** Tổng doanh thu kỳ quay (VND). */
  totalRevenue?: number;
  /** Tổng tiền trả thưởng thực tế (VND) — từ stats.totalPayoutAmount. */
  totalPayout?: number;
  /** Thông tin tài chính tổng hợp sau settle. */
  financial?: {
    /** Tổng giải thưởng cố định đã trả (tier2 + tier3 + tier4) — VND. */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý (VND). */
    totalAgentCommission: number;
    /** Phần công ty được hưởng theo config (VND). */
    companyTake: number;
    /** Lợi nhuận thực tế công ty (VND) — sau tất cả các khoản. */
    actualCompanyTake: number;
    /** Đóng góp vào quỹ jackpot trong kỳ (VND). */
    jackpotContribution: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách tóm tắt các kỳ quay. */
  draws: DrawSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
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
  /** Thông tin chi tiết kỳ quay — Date fields đã serialize thành ISO string qua JSON response. */
  draw: WireType<DrawEntity>;
}
