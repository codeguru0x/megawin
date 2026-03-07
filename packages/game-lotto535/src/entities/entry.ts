/**
 * Lotto 5/35 – Ticket Entry Document
 *
 * Collection: lotto535TicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay (draw) cụ thể.
 * Đây là đơn vị vận hành chính:
 *   - Settle theo drawId
 *   - Báo cáo theo tenantId + drawDate
 *   - Lịch sử chơi theo accountId + drawDate
 *
 * LƯU Ý cho báo cáo:
 * - tenantId luôn được lưu ở top-level để query nhanh (compound index).
 * - drawDate (ISODateString) dùng cho group aggregation.
 * - amount (tiền cược) lưu sẵn để tránh join với ticket khi report.
 *
 * Pattern naming: {Game}TicketEntryDoc – áp dụng cho mọi game.
 */

import type { PlayType, PrizeTier, PayoutStatus, RefundStatus } from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString, MainTuple, Special } from "./types";
import type { Long } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý áp dụng cho entry này. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /** Tiền hoa hồng = Math.round(amount × commissionRate). Tính sẵn lúc place-bet. */
  commissionAmount: number;
}

/** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
export interface EntrySummary {
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Snapshot boards (lựa chọn, không phải lines expand). */
  boards: EntryBoardSnapshot[];
}

/** Kết quả kỳ quay – copy từ draw.result khi publish. */
export interface EntryResult {
  /** 5 số chính trúng thưởng, sorted. */
  winningMain: MainTuple;
  /** Số đặc biệt trúng thưởng. */
  winningSpecial: Special;
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Chi tiết trả thưởng cho entry này. Chỉ có sau khi settle. */
export interface EntryPayout {
  /** Tổng tiền thắng kỳ này (VND). = 0 khi thua, > 0 khi thắng. */
  winAmount: number;
  /**
   * Tiền trả thưởng thực tế cho khách (sau thuế/phí nếu có).
   * Hiện tại = winAmount (chưa có thuế).
   */
  payoutAmount: number;
  /** Chi tiết theo từng hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle. */
  settledAt: Date;
  /**
   * Trạng thái gửi tiền trả thưởng cho tenant.
   * Chỉ có ý nghĩa khi winAmount > 0.
   */
  payoutStatus?: PayoutStatus;
  /** Thời điểm dispatch gần nhất (gửi request cho tenant). */
  payoutDispatchedAt?: Date;
  /** Số lần retry dispatch (0 = lần đầu). */
  payoutRetryCount?: number;
  /** Lỗi lần dispatch gần nhất (nếu failed). */
  payoutLastError?: string;
}

/**
 * Thông tin huỷ cược + hoàn tiền.
 * Chỉ có khi entry bị void (draw void / admin void).
 */
export interface EntryVoidInfo {
  /** Tiền cược gốc của entry này (= amount). */
  originalAmount: number;
  /** Tiền hoàn trả cho player. */
  refundAmount: number;
  /** Trạng thái hoàn tiền. */
  refundStatus: RefundStatus;
  /** Thời điểm huỷ. */
  voidedAt: Date;
  /** Thời điểm hoàn tiền. */
  refundedAt?: Date;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  // ───── Partition / Ownership ─────

  /**
   * Tenant/đại lý sở hữu entry.
   * Key chính cho báo cáo tenant backoffice + megawin backoffice.
   */
  tenantId: string;

  /** ID tài khoản chung (hệ thống account service). */
  accountId: string;

  /** Username hiển thị của player. */
  username: string;

  /** Tham chiếu ticket gốc (ObjectId). */
  ticketId: string;

  // ───── Draw Snapshot ─────

  /**
   * ID kỳ quay cụ thể (ví dụ "2026-02-22.001").
   * Primary key để settle batch theo draw.
   */
  drawId: string;

  /** Thời điểm quay – dùng sort timeline, query theo range. */
  drawTime: Date;

  /**
   * Ngày quay theo timezone vận hành (Asia/Ho_Chi_Minh), format "YYYY-MM-DD".
   * Dùng cho group aggregation report.
   */
  drawDate: ISODateString;

  // ───── Financial Date ─────

  /**
   * Ngày tài chính mà entry này thuộc về, format "YYYY-MM-DD".
   * Dùng cho báo cáo tài chính hàng ngày (không nhất thiết = drawDate).
   * Business rule: ngày tài chính tính từ 11h sáng → 11h sáng hôm sau.
   * Compound index: { tenantId, financialDate } cho report query.
   */
  financialDate: ISODateString;

  // ───── Tenant (snapshot đại lý lúc đặt cược) ─────

  /**
   * Snapshot thông tin đại lý tại thời điểm tạo entry.
   *
   * Snapshot cứng: dùng rate + amount tại thời điểm mua,
   * không thay đổi dù tenant config update sau.
   * Khi settle, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
   */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /**
   * Trạng thái vòng đời entry.
   * pending → settled (có kết quả) hoặc pending → voided (kỳ quay bị huỷ).
   */
  status: EntryStatus;

  // ───── Stake (tiền cược kỳ này) ─────

  /** Tổng line của ticket trong kỳ này. */
  lineCount: number;

  /**
   * Tiền cược kỳ này (VND) = lineCount × unitPrice.
   * Lưu sẵn (denormalized) để report nhanh, tránh join ticket.
   */
  amount: number;

  /** Giá 1 line tại thời điểm mua (snapshot). */
  unitPrice: number;

  // ───── Entry Summary (snapshot cho UI) ─────

  /** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot (khi draw published) ─────

  /** Kết quả kỳ quay – copy từ draw.result khi publish. */
  result?: EntryResult;

  // ───── Outcome (kết quả thắng/thua – gán khi settle) ─────

  /**
   * Kết quả cuối cùng của entry sau khi settle.
   * Dùng cho query/filter nhanh, hiển thị UI.
   * Chỉ có sau khi settle xong.
   */
  outcome?: EntryOutcome;

  // ───── Payout (khi settle xong) ─────

  /** Chi tiết trả thưởng cho entry này. Chỉ có sau khi settle. */
  payout?: EntryPayout;

  // ───── Void / Refund (khi draw bị huỷ) ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Timestamps ─────

  /** Thời điểm tạo entry (= thời điểm place-bet thành công). */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (settle, void, payout dispatch...). */
  updatedAt: Date;

  // ───── Change Tracking ─────

  /**
   * Global change sequence (BSON Long / Int64).
   * Gán từ entryChangeSeq mỗi khi entry được insert hoặc update.
   * Worker dùng field này để detect thay đổi: version > lastProcessedVersion.
   */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board trong entry – chỉ lưu selection, không lưu lines. */
export interface EntryBoardSnapshot {
  /** Mã board ("A", "B", "C", "D", "E"). */
  boardNo: string;
  /** Kiểu chơi của board (standard, mainCover, specialCover...). */
  playType: PlayType;

  /** Các số chính user chọn — string zero-padded, sorted tăng dần. */
  mainNumbers: string[];

  /** Các số đặc biệt user chọn — string zero-padded, sorted tăng dần. */
  specialNumbers: string[];

  /** Số line con sinh ra từ board. */
  expandedLines: number;
}

/** Chi tiết trả thưởng cho 1 hạng giải trong entry. */
export interface EntryPayoutTier {
  /** Hạng giải – type-safe enum. */
  tier: PrizeTier;

  /** Số line trúng hạng này. */
  hitCount: number;

  /**
   * Tiền thưởng mỗi hit (VND).
   * Bao gồm cả split bonus nếu đang trong kỳ chia Jackpot.
   */
  unitAmount: number;

  /** Tổng tiền hạng này = hitCount × unitAmount. */
  amount: number;

  /**
   * Đánh dấu tiền thưởng có bao gồm phần bổ sung
   * từ chia Jackpot (split cycle) hay không.
   */
  isSplitBonus?: boolean;
}
