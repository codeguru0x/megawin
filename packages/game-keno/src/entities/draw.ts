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
import type { DrawSales, DrawVietlottRef } from "@megawin/game-core/types";
import type { ISODateString } from "./types";
import type { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "./enums";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

export type { DrawSales, DrawVietlottRef };

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
 * Kết quả trúng thưởng 1 loại cược trong kỳ quay (denormalize cho player API).
 *
 * Unified cho cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd):
 * - Cơ bản: dùng pickCount + matchCount, bet = undefined.
 * - Bổ sung: dùng bet, pickCount = null, matchCount = null.
 */
export interface DrawPrizeSummary {
  /** Loại chơi: "pick1"–"pick10" | "bigSmall" | "evenOdd". */
  playType: KenoPlayType;

  /** Bậc chơi (pickCount): 1-10 cho cơ bản. null cho bổ sung. */
  pickCount: number | null;

  /** Số trùng khớp (matchCount): 0-pickCount cho cơ bản. null cho bổ sung. */
  matchCount: number | null;

  /**
   * Lựa chọn cụ thể cho bổ sung: "big"/"small"/"bigSmallDraw"/"even"/"odd"/...
   * Undefined cho cơ bản.
   */
  bet?: KenoBigSmallBet | KenoEvenOddBet;

  /** Tổng số bộ trúng (= tổng boards có kết quả này across tất cả entries). */
  winnerCount: number;

  /**
   * Tiền thưởng mỗi bộ (VND).
   * Bậc 8/9/10 có thể bị cap nếu vượt ngưỡng.
   */
  prizePerUnit: number;
}

/**
 * Tổng kết settle kỳ quay Keno — denormalize trên draw để player API đọc trực tiếp.
 *
 * Ghi 1 lần bởi CalculateFinancials step, idempotent (overwrite).
 * prizes[] chứa cả giải cơ bản và bổ sung, phân biệt qua playType.
 *
 * totalWinners và totalPrizeAmount được tính ở use case layer bằng cách sum từ prizes[]:
 *   totalWinners     = prizes.reduce((s, p) => s + p.winnerCount, 0)
 *   totalPrizeAmount = prizes.reduce((s, p) => s + p.winnerCount * p.prizePerUnit, 0)
 */
export interface DrawSettleSummary {
  /** Bảng giải thưởng — chỉ chứa entries có winnerCount > 0. Cả cơ bản và bổ sung. */
  prizes: DrawPrizeSummary[];
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

  /** Phân tích tài chính kỳ quay sau kết sổ. */
  financial?: DrawFinancial;

  /** Thống kê vận hành sau kết sổ. */
  stats?: DrawStats;

  /** Tổng kết settle sau khi kết sổ — denormalize cho player API xem kết quả kỳ quay. */
  settleSummary?: DrawSettleSummary;

  /** Thông tin khi kỳ quay bị huỷ. */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết void flow (entries refund) sau khi void hoàn tất. */
  voidSummary?: DrawVoidSummary;

  /**
   * Thời điểm kết sổ thành công lần gần nhất (high-water mark).
   *
   * Dùng để phân biệt "Settle lần đầu" vs "Resettle":
   * - `null/undefined` → chưa từng settle. UI hiện nút "Kết sổ" (trigger-settle).
   * - `>= result.publishedAt` → đã settle, không có republish mới. Không hiện nút.
   * - `< result.publishedAt` → có republish mới sau lần settle gần nhất. UI hiện
   *   nút "Kết sổ lại" (trigger-resettle).
   *
   * Set bởi `FinalizeSettle` mỗi khi settle complete — overwrite cả lần đầu lẫn
   * resettle (luôn = thời điểm settle gần nhất).
   *
   * KHÔNG bị $unset khi `republishResultAfterSettled` — đây là high-water mark
   * lịch sử settle, dùng để phân biệt với draw chưa từng settle.
   */
  settledAt?: Date;

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
