/**
 * Power 6/55 – Ticket Entry Entity (Đơn cược tham gia 1 kỳ quay)
 *
 * 1 Entry = 1 Ticket × 1 Draw.
 * Đây là đơn vị NHỎ NHẤT cho tất cả operations:
 * - Settle: match lines → tính thưởng → ghi payout
 * - Report: aggregate revenue/payout theo drawDate/tenant
 * - Payout: dispatch tiền thưởng cho tenant
 * - Void: hoàn tiền khi kỳ quay bị huỷ
 * - Feed: sync sang entryFeed cho tenant polling
 *
 * Entry mang snapshot đầy đủ boards từ ticket gốc → settle độc lập,
 * không cần join ticket document.
 *
 * Lifecycle (EntryStatus từ game-core):
 *   scheduled → settled
 *              ↘ void
 *
 * Collection: power655_ticket_entries.
 */

import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";
import type { PrizeTier, PayoutStatus, RefundStatus } from "./enums";
import type { PlayType } from "./enums";
import type { Board } from "./ticket";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Tóm tắt nội dung entry – dùng cho UI hiển thị mà không cần lookup ticket. */
export interface EntrySummary {
  /** Mã vé hiển thị cho khách. */
  ticketNo: string;
  /** Snapshot các board từ vé gốc. */
  boards: EntryBoardSnapshot[];
}

/** Kết quả kỳ quay (ghi lại khi publish result). */
export interface EntryResult {
  /** 6 số chính trúng thưởng, sorted ascending. */
  winningMain: string[];

  /** Số bonus – quay từ 49 quả bóng còn lại sau khi rút 6. */
  bonusNumber: string;

  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/**
 * Thông tin trả thưởng cho entry thắng.
 * Ghi sau settle – dùng cho dispatch payout worker.
 */
export interface EntryPayout {
  /**
   * Tổng tiền thắng (VND).
   * Công thức: Σ(tiers[].amount). JP1/JP2 = 0 tại SettleEntries, patch ở FinalizeSettle.
   */
  winAmount: number;
  /** Tiền thực trả (= winAmount, có thể điều chỉnh trong tương lai). */
  payoutAmount: number;
  /** Chi tiết thắng theo từng hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle (tính toán kết quả). */
  settledAt: Date;
  /**
   * Trạng thái dispatch tiền thưởng cho tenant.
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
 * Thông tin huỷ entry khi kỳ quay bị void.
 * Chỉ có khi entry bị void (draw void / admin void).
 */
export interface EntryVoidInfo {
  /** Số tiền gốc của entry (= amount). */
  originalAmount: number;
  /** Số tiền hoàn trả cho player (VND). */
  refundAmount: number;
  /** Trạng thái hoàn tiền: pending → dispatched → confirmed/failed. */
  refundStatus: RefundStatus;
  /** Thời điểm huỷ. */
  voidedAt: Date;
  /** Thời điểm hoàn tiền thành công. */
  refundedAt?: Date;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

/**
 * Snapshot thông tin hoa hồng đại lý tại thời điểm place-bet.
 *
 * Snapshot cứng: dùng rate + amount tại thời điểm mua,
 * không thay đổi dù tenant config update sau.
 * Khi report, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
 */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý áp dụng cho entry này. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /**
   * Tiền hoa hồng (VND).
   * Công thức: Math.round(amount × commissionRate). Tính sẵn lúc place-bet.
   */
  commissionAmount: number;
}

/**
 * MongoDB document cho entry Power 6/55.
 * Collection: power655_ticket_entries.
 */
export interface TicketEntryDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;

  // ───── Partition / Ownership ─────

  /**
   * Tenant/đại lý sở hữu entry.
   * Key chính cho báo cáo tenant backoffice + megawin backoffice.
   */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi (snapshot lúc place-bet). */
  username: string;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;
  /** Tham chiếu đến ticket gốc (ObjectId as string). */
  ticketId: string;

  // ───── Draw Snapshot ─────

  /** Mã kỳ quay: "YYYY-MM-DD.001". Join key với draws. */
  drawId: string;

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
   * Snapshot hoa hồng đại lý tại thời điểm place-bet.
   *
   * Snapshot cứng: không thay đổi dù tenant config update sau.
   * Khi settle, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
   */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /** Trạng thái lifecycle: scheduled → settled / void. */
  status: EntryStatus;

  // ───── Stake (tiền cược kỳ này) ─────

  /** Tổng line của entry trong kỳ này (= Σ boards[].derived.expandedLines). */
  lineCount: number;

  /**
   * Tiền cược kỳ này (VND) = lineCount × unitPrice.
   * Lưu sẵn (denormalized) để report nhanh, tránh join ticket.
   */
  amount: number;

  /** Giá 1 line tại thời điểm mua (snapshot từ config). */
  unitPrice: number;

  // ───── Entry Summary (snapshot cho UI) ─────

  /** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot (khi draw published) ─────

  /** Kết quả kỳ quay – copy từ draw.result khi publish. */
  result?: EntryResult;

  // ───── Outcome ─────

  /** Kết quả thắng/thua (ghi sau settle). */
  outcome?: EntryOutcome;

  // ───── Payout (khi settle xong) ─────

  /** Chi tiết trả thưởng (chỉ có sau settle, outcome = win). */
  payout?: EntryPayout;

  // ───── Void / Refund ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Timestamps ─────

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;

  // ───── Change Tracking ─────

  /**
   * Global change sequence (BSON Long / Int64).
   * Gán từ entryChangeSeq mỗi khi entry được insert hoặc update.
   * Worker dùng field này để detect thay đổi: version > lastProcessedVersion.
   */
  version: Long;
}

/** Application layer entity (version chuyển Long → string). */
export interface TicketEntryEntity extends Omit<TicketEntryDoc, "_id" | "version"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
  /** Version dạng string (BigInt serialized). Dùng cho feed sync. */
  version: string;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board trong entry – chỉ lưu selection, không lưu lines. */
export interface EntryBoardSnapshot {
  /** Ký hiệu board ("A".."E"). */
  boardNo: string;
  /** Kiểu chơi (standard / bao5 / bao7-18 / quickPick). */
  playType: PlayType;
  /** Danh sách số chính người chơi đã chọn ("01"-"55"). */
  mainNumbers: string[];
  /**
   * Số line sau khi expand từ board.
   * - Standard / QuickPick: 1
   * - Bao5: 55 - 5 = 50
   * - Bao7: C(7,6) = 7, Bao18: C(18,6) = 18.564
   */
  expandedLines: number;
}

/** Chi tiết trúng thưởng 1 hạng giải trong entry. */
export interface EntryPayoutTier {
  /** Hạng giải: jackpot1, jackpot2, tier1, tier2, tier3. */
  tier: PrizeTier;

  /** Số lines trúng hạng này. */
  hitCount: number;

  /**
   * Tiền thưởng mỗi hit (VND).
   * JP1/JP2: = 0 tại SettleEntries, patch ở FinalizeSettle khi biết pool chính xác.
   */
  unitAmount: number;

  /**
   * Tổng tiền hạng này (VND).
   * Công thức: hitCount × unitAmount.
   */
  amount: number;
}
