/**
 * Lotto 5/35 – Ticket Entry Document
 *
 * Collection: lotto535TicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay (draw) cụ thể.
 * Đây là đơn vị vận hành chính:
 *   - Settle theo drawId
 *   - Báo cáo theo tenantId + drawDate
 *   - Lịch sử chơi theo playerId + drawDate
 *
 * LƯU Ý cho báo cáo:
 * - tenantId luôn được lưu ở top-level để query nhanh (compound index).
 * - drawDate (ISODateString) dùng cho group aggregation.
 * - amount (tiền cược) lưu sẵn để tránh join với ticket khi report.
 *
 * Pattern naming: {Game}TicketEntryDoc – áp dụng cho mọi game.
 */

import type {
  Lotto535EntryStatus,
  Lotto535PlayType,
  Lotto535PrizeTier,
} from "./lotto535.enums";
import type {
  ISODateString,
  Lotto535MainTuple,
  Lotto535Special,
} from "./lotto535.types";

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface Lotto535TicketEntryDoc {
  _id: unknown;

  // ───── Partition / Ownership ─────
  // Tất cả field này cần cho query báo cáo – luôn lưu ở top-level.

  /**
   * Tenant/đại lý sở hữu entry.
   * Key chính cho báo cáo tenant backoffice + megawin backoffice.
   */
  tenantId: string;

  /** ID người chơi. */
  playerId: string;

  /** Tham chiếu ticket gốc (ObjectId). */
  ticketId: unknown;

  // ───── Draw Snapshot ─────

  /**
   * ID kỳ quay cụ thể (ví dụ "2026-02-22-001").
   * Primary key để settle batch theo draw.
   */
  drawId: string;

  /** Thời điểm quay – dùng sort timeline, query theo range. */
  drawTime: Date;

  /**
   * Ngày quay theo timezone vận hành, format "YYYY-MM-DD".
   * Dùng cho group aggregation report.
   * Timezone: Asia/Ho_Chi_Minh (cấu hình trong gameConfig.play.timezone).
   */
  drawDate: ISODateString;

  // ───── Entry Status ─────

  status: Lotto535EntryStatus;

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

  // ───── Entry Summary (snapshot cho UI + audit) ─────

  /**
   * Snapshot tối thiểu từ ticket tại thời điểm tạo entry.
   * Mục đích:
   * - UI hiển thị "hôm đó cược gì" mà không cần lookup ticket.
   * - Audit: selectionHash phải khớp ticket.expansion.selectionHash.
   */
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;

    /** Hash canonical selection – phải khớp ticket. */
    selectionHash: string;

    /** Version ticket tại thời điểm tạo entry. */
    ticketVersion: number;

    /** Snapshot boards (lựa chọn, không phải lines expand). */
    boards: Lotto535EntryBoardSnapshot[];
  };

  // ───── Result Snapshot (khi draw published) ─────

  /** Kết quả kỳ quay – copy từ draw.result khi publish. */
  result?: {
    /** 5 số chính trúng thưởng, sorted. */
    winningMain: Lotto535MainTuple;

    /** Số đặc biệt trúng thưởng. */
    winningSpecial: Lotto535Special;

    /** Thời điểm công bố kết quả. */
    publishedAt: Date;
  };

  // ───── Payout (khi settle xong) ─────

  /** Chi tiết trả thưởng cho entry này. */
  payout?: {
    /** Tổng tiền thắng kỳ này (VND). */
    winAmount: number;

    /** Chi tiết theo từng hạng giải. */
    tiers: Lotto535EntryPayoutTier[];

    /** Thời điểm settle. */
    settledAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board trong entry – chỉ lưu selection, không lưu lines. */
export interface Lotto535EntryBoardSnapshot {
  boardNo: string;
  isVoid?: boolean;
  playType: Lotto535PlayType;

  /** Các số chính user chọn (raw selection, không phải lines con). */
  mainNumbers: number[];

  /** Các số đặc biệt user chọn. */
  specialNumbers: number[];

  /** Số line con sinh ra từ board. */
  expandedLines: number;
}

/** Chi tiết trả thưởng cho 1 hạng giải trong entry. */
export interface Lotto535EntryPayoutTier {
  /** Hạng giải – type-safe enum. */
  tier: Lotto535PrizeTier;

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
