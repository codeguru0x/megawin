/**
 * Bingo 18 – Draw Document
 *
 * Collection: bingo18_draws
 *
 * 1 document = 1 kỳ quay Bingo 18.
 * Bingo 18 quay mỗi 6 phút, từ 06:00 đến 21:53.
 *
 * Kết quả: 3 số từ {1, 2, 3, 4, 5, 6}.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { Bingo18PlayType, Bingo18BigSmallBet, Bingo18TripleKind } from "./enums";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé cho kỳ quay. */
export interface DrawSales {
  /** Thời điểm bắt đầu bán vé. undefined nếu chưa mở bán. */
  openAt?: Date;
  /** Thời điểm đóng bán = drawTime - salesCloseBeforeSeconds (từ global config). */
  closeAt: Date;
}

/** Tham chiếu kỳ quay Vietlott tương ứng (nếu liên kết). */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott. */
  drawPeriod: string;
  /** Ngày quay Vietlott, format "YYYY-MM-DD". */
  drawDate: ISODateString;
}

/**
 * Kết quả kỳ quay: 3 số từ {1,2,3,4,5,6}.
 * Set khi status chuyển sang "published".
 */
export interface DrawResult {
  /** 3 số kết quả (không sorted, giữ nguyên thứ tự quay). */
  numbers: number[];
  /** Tổng 3 số quay (3-18). Dùng để xác định side bet thắng/thua. */
  sum: number;
  /** Thời điểm công bố kết quả. Set bởi admin hoặc hệ thống tự động. */
  publishedAt: Date;
}

/**
 * Phân tích tài chính kỳ quay. Set sau khi settle hoàn tất.
 * Tính bởi `calculateBingo18DrawFinancials()`.
 */
export interface DrawFinancial {
  /** Tổng doanh thu = Σ(entry.amount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) cho tất cả entries thắng. */
  totalPrizes: number;
  /** Hoa hồng đại lý = Σ(tenant.revenue × tenant.commissionRate). */
  totalAgentCommission: number;
  /** Phần công ty. Bingo 18 không có Jackpot nên companyTake = profit (toàn bộ phần còn lại sau giải thưởng và hoa hồng). */
  companyTake: number;
}

/** Thống kê vận hành kỳ quay. Cập nhật realtime khi có entry mới hoặc payout. */
export interface DrawStats {
  /** Tổng entries tham gia kỳ quay. Mỗi ticket cho 1 entry per draw. */
  ticketEntryCount: number;
  /** Tổng doanh thu bán vé = Σ(entry.amount). Cập nhật khi entry được tạo. */
  totalSalesAmount: number;
  /** Tổng tiền đã trả = Σ(entry.payout.payoutAmount). Set sau dispatch payout. */
  totalPayoutAmount?: number;
}

/**
 * Thông tin huỷ kỳ quay. Set khi admin huỷ kỳ quay (status → voided).
 * Khi void, tất cả entries sẽ được refund.
 */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay, do admin nhập. */
  reason: string;
  /** ID admin thực hiện void. undefined nếu void bởi hệ thống tự động. */
  voidedBy?: string;
  /** Thời điểm thực hiện void. */
  voidedAt: Date;
}

/** Tổng hợp kết quả void sau khi refund toàn bộ entries hoàn tất.
 * Set sau khi tất cả refund đã dispatch thành công.
 */
export interface DrawVoidSummary {
  /** Tổng entries đã bị void trong kỳ. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc của các entries bị void = Σ(entry.amount). */
  totalOriginalAmount: number;
  /** Tổng tiền đã hoàn trả = Σ(entry.voidInfo.refundAmount). Bingo 18 hoàn 100%. */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất refund entry cuối cùng. */
  completedAt: Date;
}

// ─────────────────────────────────────────────
// Settle Summary (denormalized for player API)
// ─────────────────────────────────────────────

/**
 * Giải thưởng 1 loại cược cơ bản đã có người trúng trong kỳ quay.
 *
 * Chỉ ghi các combination có winnerCount > 0 — giảm kích thước document.
 * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải — 1 DB call.
 *
 * Group key: (playType, matchCount, tripleKind?).
 * - singleNum: group theo matchCount (1/2/3) — giải thưởng khác nhau.
 * - doubleMatch: matchCount = 1 (trúng hoặc không).
 * - tripleMatch: cần thêm tripleKind để phân biệt specific (1.2tr) vs any (200k).
 */
export interface DrawBasicPrizeSummary {
  /**
   * Loại cược: "singleNum" | "doubleMatch" | "tripleMatch".
   * Cùng với matchCount + tripleKind xác định duy nhất 1 bậc giải.
   */
  playType: Bingo18PlayType;
  /**
   * Số lần xuất hiện trong kết quả (1, 2, 3).
   * singleNum: 1/2/3 tương ứng giải khác nhau (12k/20k/30k).
   * doubleMatch + tripleMatch: luôn = 1 (trúng hoặc không).
   */
  matchCount: number;
  /**
   * Phân loại triple: "specific" (chọn số cụ thể, 1.200.000đ) hoặc "any" (bất kỳ bộ ba, 200.000đ).
   * Chỉ set cho tripleMatch — undefined với singleNum và doubleMatch.
   * Bắt buộc để phân biệt 2 mức giải của tripleMatch.
   */
  tripleKind?: Bingo18TripleKind;
  /** Số lượt cược trúng tổ hợp này trong kỳ quay. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Giải thưởng 1 loại side bet đã có người trúng trong kỳ quay.
 *
 * Chỉ ghi các (playType, sum/bet) có winnerCount > 0 — giảm kích thước document.
 *
 * Mirror structure của `EntrySideBetSnapshot`: dùng `sum` hoặc `bet` tuỳ playType,
 * không dùng string chung để tránh nhầm lẫn kiểu dữ liệu.
 */
export interface DrawSideBetPrizeSummary {
  /** Loại side bet: "sumTotal" | "bigSmallDraw". */
  playType: Bingo18PlayType;
  /**
   * Tổng cụ thể đã trúng (3-18). Chỉ set cho sumTotal.
   * undefined với bigSmallDraw.
   */
  sum?: number;
  /**
   * Cược Lớn/Hòa/Nhỏ đã trúng. Chỉ set cho bigSmallDraw.
   * undefined với sumTotal.
   */
  bet?: Bingo18BigSmallBet;
  /** Số lượt cược trúng với (playType, sum/bet) này trong kỳ quay. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Tổng kết settle kỳ quay Bingo 18 — denormalized cho player API.
 *
 * Ghi 1 lần bởi CalculateFinancials step (IDEMPOTENT, overwrite).
 * Chỉ chứa combinations có winnerCount > 0 → compact document.
 *
 * Dùng bởi GetDrawResultPlayerUseCase: 1 DB call trả bảng giải đầy đủ.
 */
export interface DrawSettleSummary {
  /**
   * Giải thưởng cơ bản có người trúng.
   * Mỗi entry = 1 (playType, matchCount, tripleKind?) unique có winnerCount > 0.
   */
  basicPrizes: DrawBasicPrizeSummary[];
  /**
   * Giải thưởng side bet có người trúng.
   * Mỗi entry = 1 (playType, sum/bet) unique có winnerCount > 0.
   */
  sideBetPrizes: DrawSideBetPrizeSummary[];
}

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw sequence).
   */
  drawId: string;

  /** Ngày quay theo lịch, format "YYYY-MM-DD". Dùng để phân vùng + truy vấn. */
  drawDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (1-based). Kết hợp drawDate tạo ra drawId. */
  drawNo: number;

  /** Thời điểm quay chính xác. Xác định bởi lịch quay (06:00–21:53, mỗi 6 phút). */
  drawTime: Date;

  /**
   * Trạng thái vận hành kỳ quay.
   * Luồng: scheduled → sales_open → sales_closed → published → settled.
   */
  status: DrawStatus;

  /** Cửa sổ bán vé cho kỳ quay. */
  sales: DrawSales;

  /** Tham chiếu kỳ quay Vietlott. */
  vietlottRef?: DrawVietlottRef;

  /** Ngày tài chính, dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  /** Kết quả kỳ quay. */
  result?: DrawResult;

  /** Phân tích tài chính kỳ quay. */
  financial?: DrawFinancial;

  /** Thống kê vận hành kỳ quay. */
  stats?: DrawStats;

  /**
   * Tổng kết bảng giải thưởng kỳ quay — denormalized cho player API.
   *
   * Ghi bởi CalculateFinancials (trong settle pipeline) sau khi tất cả entries settled.
   * Chỉ chứa combinations có winnerCount > 0 — document compact, query nhanh.
   * Dùng bởi GetDrawResultPlayerUseCase: 1 DB call, không join entries.
   */
  settleSummary?: DrawSettleSummary;

  /** Thông tin huỷ kỳ quay. */
  voidInfo?: DrawVoidInfo;

  /** Tổng hợp kết quả void. */
  voidSummary?: DrawVoidSummary;

  // ───── Timestamps ─────

  /** Thời điểm tạo kỳ quay. Set 1 lần khi tạo document, không đổi. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. Tự động cập nhật mỗi khi document thay đổi. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
