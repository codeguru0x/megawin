/**
 * Lotto 5/35 – Draw Document
 *
 * Collection: lotto535Draws
 *
 * 1 document = 1 kỳ mở thưởng (draw).
 * Game quay 2 lần/ngày (13h + 21h), tức 2 draws/ngày.
 *
 * Chức năng:
 * - Quản lý lịch (open/close bán vé)
 * - Lưu kết quả quay + Vietlott reference
 * - Tính toán tài chính: jackpot accumulation, commission, company take
 * - Cung cấp jackpot info cho UI người chơi
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawSales, DrawVietlottRef } from "@megawin/game-core/types";

import type { DrawNo, ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

export type { DrawSales, DrawVietlottRef };

/**
 * Kết quả kỳ quay. Set khi status chuyển sang "published".
 */
export interface DrawResult {
  /**
   * 5 số chính trúng thưởng theo thứ tự quay gốc (không sort).
   *
   * Thứ tự quay gốc phải được bảo toàn để hiển thị đúng với kết quả Vietlott công bố.
   * Lưu dạng string[] (zero-padded "01"-"35") — dùng trực tiếp từ MongoDB, tránh cast.
   */
  winningMain: string[];

  /**
   * 1 số đặc biệt trúng thưởng theo thứ tự quay gốc.
   * Lưu dạng string (zero-padded "01"-"12").
   */
  winningSpecial: string;

  /** Thời điểm công bố. */
  publishedAt: Date;
}

/**
 * Snapshot Jackpot cho kỳ quay.
 *
 * KHÔNG ghi khi tạo draw — chỉ ghi lúc settle (finalize-settle).
 * Kỳ đang active: UI đọc jackpot từ `lotto535_jackpot_cycles.currentAmount`.
 * Kỳ đã settle: đọc từ đây (bản ghi lịch sử).
 */
export interface DrawJackpotSnapshot {
  /** Jackpot đầu kỳ (VND). Ghi lúc settle. */
  openingAmount: number;

  /**
   * Jackpot cuối kỳ (VND) = openingAmount + jackpotContribution.
   * Luôn phản ánh giá trị quỹ JP tại thời điểm kỳ quay kết thúc.
   *
   * Nếu có JP winner: đây là tổng giải mà winner nhận.
   * Nếu split: đây là quỹ JP trước khi chia cho tier1-tier5.
   * Nếu tích luỹ: đây là quỹ JP mang sang kỳ sau.
   */
  closingAmount: number;

  /**
   * Đánh dấu kỳ này là kỳ chia giải (split cycle).
   * true khi Jackpot >= splitThreshold và chưa có người trúng.
   *
   * Chi tiết chia giải (tierAllocations, totalWinners, totalPaid) được lưu trong
   * `jackpotCycles` collection qua `JackpotSplitDetail` — không lưu trên draw.
   */
  isSplitCycle?: boolean;
}

/**
 * Tổng kết tài chính kỳ quay.
 * Populate sau khi settle xong.
 *
 * Công thức:
 *   jackpotContribution = max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0)
 */
export interface DrawFinancial {
  /** Tổng doanh thu tiền cược (100% revenue). */
  totalRevenue: number;

  /** Tổng tiền trả giải cố định (tier1 → consolation). */
  totalFixedPrizes: number;

  /** Tổng hoa hồng đại lý (sum across all tenants). */
  totalAgentCommission: number;

  /** Công ty thu về (sau cap). Công thức: min(companyTake, max(remain, 0)). */
  actualCompanyTake: number;

  /** Tỷ lệ company take theo config. */
  companyTakeRate: number;

  /** Company take lý thuyết trước cap. Công thức: round(totalRevenue × companyTakeRate). */
  companyTake: number;

  /**
   * Tiền tích luỹ vào Jackpot kỳ tiếp theo (VND).
   * = max(totalRevenue - totalFixedPrizes - totalAgentCommission - actualCompanyTake, 0).
   * Luôn >= 0: nếu tính ra âm (doanh thu không đủ bù giải + hoa hồng) thì = 0.
   */
  jackpotContribution: number;
}

/** Thống kê vận hành (cập nhật khi salesClosed + sau settle). */
export interface DrawStats {
  /** Số entry tham gia kỳ này. */
  ticketEntryCount: number;

  /** Tổng lines tất cả entries (dự báo tải settle). */
  totalLineCount: number;

  /** Tổng doanh thu kỳ này. */
  totalSalesAmount: number;

  /** Tổng payout sau settle. */
  totalPayoutAmount?: number;
}

/**
 * Tóm tắt giải thưởng 1 tier trong kỳ quay (denormalize cho player API).
 *
 * Chứa thông tin aggregate từ tất cả entries đã settle:
 * - Số lượng người trúng (winnerCount = tổng hitCount)
 * - Tổng tiền thưởng tier đó (prizeAmount)
 */
export interface DrawTierPrizeSummary {
  /** Hạng giải (jackpot, tier1, tier2, ..., consolation). */
  tier: string;

  /** Tổng số lượt trúng tier này trong kỳ (= Σ hitCount tất cả entries). */
  winnerCount: number;

  /**
   * Tổng tiền thưởng tier này (VND).
   *
   * Giải cố định: winnerCount × unitAmount.
   * Jackpot: 0 lúc ghi (chưa patch), sẽ được cập nhật sau PatchJackpotPrize.
   */
  prizeAmount: number;
}

/**
 * Tổng kết settle kỳ quay — denormalize trên draw để player API đọc trực tiếp.
 *
 * Ghi 1 lần duy nhất bởi CalculateFinancials (step 3), idempotent (overwrite).
 * Lưu ý: jackpot tier prizeAmount ban đầu = 0, được cập nhật bởi PatchJackpotPrize.
 *
 * totalWinners và totalPrizeAmount được tính ở use case layer bằng cách sum từ tiers[]:
 *   totalWinners      = tiers.reduce((s, t) => s + t.winnerCount, 0)
 *   totalPrizeAmount  = tiers.reduce((s, t) => s + t.prizeAmount, 0)
 */
export interface DrawSettleSummary {
  /** Chi tiết giải thưởng từng tier. */
  tiers: DrawTierPrizeSummary[];
}

/** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
export interface DrawVoidInfo {
  /** Lý do huỷ kỳ quay (do staff nhập). */
  reason: string;
  /** Tài khoản staff thực hiện huỷ. */
  voidedBy?: string;
  /** Thời điểm thực hiện huỷ kỳ quay. */
  voidedAt: Date;
}

/** Tổng kết void flow (entries refund). Ghi sau khi void step function hoàn tất. */
export interface DrawVoidSummary {
  /** Số lượng entry đã được huỷ cược. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc của các entry bị huỷ (VND). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả cho các player (VND). */
  totalRefundAmount: number;
  /** Thời điểm void flow hoàn tất. */
  completedAt: Date;
}

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.NNN" (NNN = draw number 001 hoặc 002).
   * Ví dụ: "2026-02-22.001" (kỳ 13h), "2026-02-22.002" (kỳ 21h).
   */
  drawId: string;

  /** Ngày quay theo timezone vận hành, format "YYYY-MM-DD". */
  drawDate: ISODateString;

  /**
   * Ngày tài chính "YYYY-MM-DD".
   * Tính từ drawTime theo rule: 11h sáng → 11h sáng hôm sau (giờ VN).
   * Set 1 lần duy nhất khi tạo draw. Ticket/entry lấy từ đây.
   */
  financialDate: ISODateString;

  /**
   * Số thứ tự kỳ quay trong ngày (1 = 13h, 2 = 21h).
   * Dùng cho UI hiển thị "Kỳ 1 / Kỳ 2".
   */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác (Date). */
  drawTime: Date;

  /** Trạng thái vận hành kỳ quay. */
  status: DrawStatus;

  /** Cửa sổ bán vé. */
  sales: DrawSales;

  /** Tham chiếu kỳ quay Vietlott chính thức. */
  vietlottRef?: DrawVietlottRef;

  /** Kết quả kỳ quay. Set khi status chuyển sang "published". */
  result?: DrawResult;

  /** Snapshot Jackpot tại kỳ quay, ghi khi settle. */
  jackpot?: DrawJackpotSnapshot;

  /** Tổng kết tài chính kỳ quay, ghi sau settle. */
  financial?: DrawFinancial;

  /** Thống kê vận hành kỳ quay. */
  stats?: DrawStats;

  /** Tổng kết settle: số người trúng + tiền thưởng theo tier. Ghi sau settle. */
  settleSummary?: DrawSettleSummary;

  /** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết void flow (entries refund). */
  voidSummary?: DrawVoidSummary;

  /**
   * Thời điểm kết sổ thành công (high-water mark).
   *
   * Set bởi `FinalizeSettle` khi settle complete. Đánh dấu kỳ đã được kết sổ —
   * dùng để chặn gọi `trigger-settle` lặp lại trên kỳ đã settle (Lotto 5/35
   * không có resettle nên field này không bao giờ bị $unset).
   */
  settledAt?: Date;

  // ───── Timestamps ─────

  /** Thời điểm tạo draw document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (thay đổi status, ghi result, settle...). */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface DrawEntity extends Omit<DrawDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
