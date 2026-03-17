/**
 * Keno – Draw Document
 *
 * Collection: kenoDraws
 *
 * 1 document = 1 kỳ quay Keno.
 * Keno quay mỗi 8 phút, ~120 kỳ/ngày (06:00-21:52).
 *
 * Kết quả: 20 số ngẫu nhiên từ 01-80.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { KenoBigSmallBet, KenoEvenOddBet, KenoSideBetPlayType } from "./enums";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé cho kỳ quay. */
export interface DrawSales {
  /** Thời điểm mở bán. Chỉ có sau khi staff nhấn "Mở bán". */
  openAt?: Date;
  /** Keno đóng bán 5 phút trước giờ quay (configurable). */
  closeAt: Date;
}

/** Tham chiếu kỳ quay Vietlott. */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (ví dụ "123456"). */
  drawPeriod: string;
  drawDate: ISODateString;
}

/**
 * Kết quả kỳ quay: 20 số từ 01-80.
 * Set khi status chuyển sang "published".
 */
export interface DrawResult {
  /** 20 số trúng thưởng dạng string "01"-"80", giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  /** Thời điểm công bố. */
  publishedAt: Date;
  /** Số lượng số "lớn" (41-80) trong 20 số quay. */
  bigCount: number;
  /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
  smallCount: number;
  /** Số lượng số chẵn trong 20 số quay. */
  evenCount: number;
  /** Số lượng số lẻ trong 20 số quay. */
  oddCount: number;
}

/** Phân tích tài chính kỳ quay, tính sau settle. */
export interface DrawFinancial {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  /** Keno: companyTake = revenue - prizes - commission (công ty thu toàn bộ phần dư). */
  companyTake: number;
}

/** Thống kê vận hành kỳ quay. */
export interface DrawStats {
  /** Số entry tham gia kỳ này. */
  ticketEntryCount: number;
  /** Tổng doanh thu kỳ này. */
  totalSalesAmount: number;
  /** Tổng payout sau settle. */
  totalPayoutAmount?: number;
}

/**
 * Kết quả trúng thưởng 1 bậc chơi cơ bản trong kỳ quay (denormalize cho player API).
 *
 * Ví dụ: "Trúng 7 trong 20 số" → pickCount=10, matchCount=7, winnerCount=3, prizeAmount=710000
 * (1 bộ = 1 board trên 1 entry có pickCount trùng matchCount).
 */
export interface DrawBasicPrizeSummary {
  /** Bậc chơi (pickCount): 1-10. */
  pickCount: number;
  /** Số trùng khớp (matchCount): 0-pickCount. */
  matchCount: number;
  /** Tổng số bộ trúng (= tổng boards có kết quả này across tất cả entries). */
  winnerCount: number;
  /**
   * Tiền thưởng mỗi bộ (VND).
   * Bậc 8/9/10 có thể bị cap nếu vượt ngưỡng.
   */
  prizePerUnit: number;
}

/**
 * Kết quả trúng thưởng side bet trong kỳ quay (denormalize cho player API).
 *
 * Mô hình đối xứng với DrawBasicPrizeSummary:
 *   BasicPrize: {pickCount, matchCount} → {winnerCount, prizePerUnit}
 *   SideBetPrize: {playType, bet}       → {winnerCount, prizePerUnit}
 *
 * Ví dụ: player đặt "big" trúng → playType="bigSmall", bet="big", winnerCount=5, prizePerUnit=26000.
 * Client derive outcome ("big13Plus" v.v.) từ bet + draw.result.bigCount/smallCount nếu cần.
 */
export interface DrawSideBetPrizeSummary {
  /** Loại side bet: "bigSmall" hoặc "evenOdd". */
  playType: KenoSideBetPlayType;
  /**
   * Lựa chọn cụ thể người chơi đặt và trúng.
   * bigSmall: "big" | "bigSmallDraw" | "small"
   * evenOdd:  "even" | "even1112" | "evenOddDraw" | "odd1112" | "odd"
   */
  bet: KenoBigSmallBet | KenoEvenOddBet;
  /** Số người đặt cược trúng với bet value này. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Tổng kết settle kỳ quay Keno — denormalize trên draw để player API đọc trực tiếp.
 *
 * Ghi 1 lần bởi CalculateFinancials step, idempotent (overwrite).
 *
 * totalWinners và totalPrizeAmount được tính ở use case layer bằng cách sum từ basicPrizes[]:
 *   totalWinners     = basicPrizes.reduce((s, b) => s + b.winnerCount, 0)
 *   totalPrizeAmount = basicPrizes.reduce((s, b) => s + b.winnerCount * b.prizePerUnit, 0)
 */
export interface DrawSettleSummary {
  /** Bảng giải thưởng cơ bản — chỉ chứa entries có winnerCount > 0. */
  basicPrizes: DrawBasicPrizeSummary[];
  /** Bảng giải thưởng side bet — chỉ chứa bet values có winnerCount > 0. */
  sideBetPrizes: DrawSideBetPrizeSummary[];
}

/** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay, do admin nhập. */
  reason: string;
  /** ID admin thực hiện void. undefined nếu void bởi hệ thống tự động. */
  voidedBy?: string;
  /** Thời điểm thực hiện void. */
  voidedAt: Date;
}

/** Tổng kết void flow (entries refund). Ghi sau khi FinalizeVoid hoàn tất. */
export interface DrawVoidSummary {
  /** Tổng entries đã bị void. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc của các entries bị void (VND) = Σ(entry.amount). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả cho người chơi (VND) = Σ(entry.voidInfo.refundAmount). */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất xử lý void. */
  completedAt: Date;
}

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw sequence 001-120).
   */
  drawId: string;

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /**
   * Số thứ tự kỳ quay trong ngày (1-120).
   * Kỳ 1 = 06:00, kỳ 2 = 06:10, ...
   */
  drawNo: number;

  /** Thời điểm quay chính xác. */
  drawTime: Date;

  /** Trạng thái vận hành kỳ quay. */
  status: DrawStatus;

  sales: DrawSales;

  vietlottRef?: DrawVietlottRef;

  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Tính từ drawTime theo rule: 11h sáng → 11h sáng hôm sau (giờ VN).
   * Set 1 lần duy nhất khi tạo draw. Ticket/entry lấy từ đây.
   */
  financialDate: ISODateString;

  /** Kết quả kỳ quay. */
  result?: DrawResult;

  /** Phân tích tài chính kỳ quay. */
  financial?: DrawFinancial;

  /** Thống kê vận hành. */
  stats?: DrawStats;

  /** Thông tin khi kỳ quay bị huỷ. */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết void flow (entries refund). */
  voidSummary?: DrawVoidSummary;

  /** Tổng kết settle — denormalize cho player API xem kết quả kỳ quay. */
  settleSummary?: DrawSettleSummary;

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
