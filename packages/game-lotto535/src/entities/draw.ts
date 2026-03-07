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
import type { ISODateString, DrawNo, MainTuple, Special } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cửa sổ bán vé cho kỳ quay. */
export interface DrawSales {
  /** Thời điểm mở bán. Chỉ có sau khi staff nhấn "Mở bán". */
  openAt?: Date;

  /**
   * Thời điểm đóng bán.
   * Thường = drawTime - 30 phút (cấu hình trong gameConfig.play.salesCloseBeforeMinutes).
   * Backend reject mua vé cho draw này sau closeAt.
   */
  closeAt: Date;
}

/**
 * Kết quả kỳ quay. Set khi status chuyển sang "published".
 */
export interface DrawResult {
  /** 5 số chính trúng thưởng, sorted tăng dần. */
  winningMain: MainTuple;

  /** 1 số đặc biệt trúng thưởng. */
  winningSpecial: Special;

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
   * Jackpot cuối kỳ (VND).
   * = openingAmount + jackpotContribution (không ai trúng)
   * = seedAmount (có người trúng Jackpot)
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
 *   jackpotContribution = totalRevenue - totalFixedPrizes - totalAgentCommission - companyTake
 */
export interface DrawFinancial {
  /** Tổng doanh thu tiền cược (100% revenue). */
  totalRevenue: number;

  /** Tổng tiền trả giải cố định (tier1 → consolation). */
  totalFixedPrizes: number;

  /** Tổng hoa hồng đại lý (sum across all tenants). */
  totalAgentCommission: number;

  /** Công ty thu về (sau cap). */
  companyTake: number;

  /** Tỷ lệ company take theo config. */
  companyTakeRate: number;

  /** Company take tối đa trước cap. */
  companyTakeMax: number;

  /**
   * Tiền tích luỹ vào Jackpot kỳ tiếp theo.
   * = totalRevenue - totalFixedPrizes - totalAgentCommission - companyTake
   * Có thể âm nếu trả thưởng nhiều hơn doanh thu (company bù).
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

/**
 * Tham chiếu kỳ quay Vietlott chính thức.
 * Cho phép khách hàng biết kết quả kỳ nào của Vietlott được sử dụng.
 * Staff nhập trên backoffice khi import kết quả.
 */
export interface DrawVietlottRef {
  /**
   * Mã kỳ quay Vietlott (ví dụ "00123").
   * Lấy từ website/hệ thống Vietlott.
   */
  drawPeriod: string;

  /** Ngày quay Vietlott. */
  drawDate: ISODateString;

  /** Phiên quay: 1 = 13h, 2 = 21h. */
  drawSession: number;
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

  /** Thông tin khi kỳ quay bị huỷ. Chỉ có khi status = void. */
  voidInfo?: DrawVoidInfo;

  /** Tổng kết void flow (entries refund). */
  voidSummary?: DrawVoidSummary;

  // ───── Timestamps ─────

  /** Thời điểm tạo draw document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (thay đổi status, ghi result, settle...). */
  updatedAt: Date;
}
