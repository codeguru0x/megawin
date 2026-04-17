/**
 * Max 3D Pro – Ticket Entry Document
 *
 * Collection: max3d_pro_ticket_entries
 *
 * 1 entry = 1 vé tham gia 1 kỳ quay.
 * Primary operational unit cho settle, payout, void.
 */

import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";
import type { PlayMode, PlayType, PrizeTier, PayoutStatus, RefundStatus } from "./enums";
import type { Triplet, ISODateString } from "./types";
import type { Max3dproDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Entry Board Snapshot
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: multiNumber / multiDigit. */
  playMode: PlayMode;
  /** Kiểu chơi: straight. */
  playType: PlayType;
  /** Danh sách các bộ ba số (triplets) đã chọn hoặc sinh ra. */
  triplets: Triplet[];
  /** Chỉ cho multiDigit: 3 chữ số đầu chọn. */
  frontDigits?: number[];
  /** Chỉ cho multiDigit: 3 chữ số sau chọn. */
  backDigits?: number[];
  /** Số cặp (pairs) sinh ra từ board. multiNumber: P(n,2). */
  lineCount: number;
  /**
   * Số lần cược nhân bội (≥ 1). Snapshot từ ticket board lúc place-bet.
   * Tiền thưởng pair = matchWinAmount × betCount.
   */
  betCount: number;
}

// ─────────────────────────────────────────────
// Entry Payout Tier
// ─────────────────────────────────────────────

/**
 * Chi tiết trúng thưởng 1 hạng giải trong entry (Max 3D Pro).
 *
 * ─────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG CÓ `playMode` — KHÔNG CÓ COLLISION TÊN TIER
 * ─────────────────────────────────────────────────────────────────
 *
 * Max 3D Pro chỉ có **1 enum `PrizeTier` duy nhất** với 8 tên tier đều độc nhất:
 *   special, specialSub, first, second, third, fourth, fifth, sixth
 *
 * Không có 2 cách chơi dùng chung tên tier → `$group by tier` khi aggregate
 * `aggregateSettledPayoutSummary` đủ chính xác, không cần phân biệt thêm bằng playMode.
 *
 * Khác với Max 3D (basic + plus) có 4 tên tier trùng nhau (special/first/second/third)
 * nhưng giá trị giải thưởng chênh lệch đến ×1000 → Max 3D bắt buộc lưu `playMode`
 * trong tier để tách đúng khi aggregate. Xem JSDoc `EntryPayoutTier` trong
 * `@megawin/game-max3d/entities` để hiểu đầy đủ vấn đề collision.
 */
export interface EntryPayoutTier {
  /** Hạng giải: special/specialSub/first/second/third/fourth/fifth/sixth. */
  tier: PrizeTier;
  /** Số pairs trúng hạng giải này. */
  hitCount: number;
  /**
   * Giá trị trung bình 1 lần trúng (VND) = totalAmount / hitCount.
   * Bao gồm duplicate multiplier (×2) và betCount.
   * Công thức thực tế: prizeConfig[tier] × duplicateMultiplier × betCount.
   */
  unitAmount: number;
  /** Tổng tiền = Σ(unitAmount) qua hitCount lần trúng = hitCount × unitAmount. */
  amount: number;
}

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin tenant tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng snapshot tại thời điểm tạo entry. */
  commissionRate: number;
  /** Số tiền hoa hồng = amount × commissionRate. */
  commissionAmount: number;
}

/** Tóm tắt nội dung entry (số vé + danh sách boards). */
export interface EntrySummary {
  /** Số vé hiển thị cho người chơi. */
  ticketNo: string;
  /** Danh sách boards snapshot từ vé gốc. */
  boards: EntryBoardSnapshot[];
}

/** Thông tin thanh toán thưởng. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(tiers[].amount). */
  winAmount: number;
  /** Tiền trả cho player = winAmount. */
  payoutAmount: number;
  /** Chi tiết thắng theo hạng giải (8 hạng: special → sixth). */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle entry. */
  settledAt: Date;
  /** Trạng thái dispatch tiền thưởng. */
  payoutStatus?: PayoutStatus;
  /** Thời điểm gửi lệnh trả thưởng. */
  payoutDispatchedAt?: Date;
  /** Thời điểm xác nhận trả thưởng thành công. */
  payoutConfirmedAt?: Date;
  /** Thông báo lỗi nếu trả thưởng thất bại. */
  payoutError?: string;

  /**
   * Idempotency key cho payout transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại settle time, ghi atomic cùng payout data.
   * Dispatch đọc field này làm `tx` khi gửi tenant — retry luôn gửi cùng giá trị.
   * Chỉ sinh khi entry thắng (có payout cần dispatch).
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  payoutTx?: string;
}

/** Snapshot kết quả kỳ quay ghi vào entry khi settle. */
export interface EntryResult extends Max3dproDrawResult {
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Thông tin huỷ entry (khi void). */
export interface EntryVoidInfo {
  /** Tiền cược gốc trước khi void (VND). */
  originalAmount: number;
  /** Tiền hoàn trả cho người chơi (VND). */
  refundAmount: number;
  /** Trạng thái hoàn tiền: pending → dispatched → confirmed. */
  refundStatus: RefundStatus;
  /** Thời điểm huỷ entry. */
  voidedAt: Date;
  /** Thời điểm gửi lệnh hoàn tiền cho ví người chơi. */
  refundDispatchedAt?: Date;
  /** Thời điểm xác nhận hoàn tiền thành công. */
  refundConfirmedAt?: Date;
  /** Thông báo lỗi nếu hoàn tiền thất bại. */
  refundError?: string;

  /**
   * Idempotency key cho refund transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại void time, ghi atomic cùng void data.
   * Mọi entry bị void đều phát sinh refund → field này required.
   *
   * @example `"01907a12-c3d4-7abc-9ef0-123456789abc"`
   */
  refundTx: string;
}

// ─────────────────────────────────────────────
// Ticket Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  /** ID đại lý (tenant). */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi. */
  username: string;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;
  /** ID vé gốc (ticket) chứa entry này. */
  ticketId: string;

  /** ID kỳ quay entry tham gia. */
  drawId: string;
  /** Ngày tài chính dùng cho báo cáo. */
  financialDate: ISODateString;

  /** Snapshot thông tin tenant tại thời điểm tạo entry. */
  tenant: EntryTenantSnapshot;

  /** Tổng cặp (pairs) = Σ(board.lineCount). Dùng cho settle (matching). */
  lineCount: number;

  /**
   * Tổng đơn vị cược = Σ(board.lineCount × board.betCount).
   * Dùng để tính tiền: amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;

  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;

  /** Mệnh giá 1 pair (VND). Snapshot từ global config. */
  unitPrice: number;

  /** Tóm tắt nội dung entry (số vé + danh sách boards). */
  entrySummary: EntrySummary;

  /** Kết quả quay thưởng, gắn khi publish result. Set khi settle. */
  result?: EntryResult;

  /** Kết quả đối soát: win / lose / void. */
  outcome?: EntryOutcome;
  /** Trạng thái entry: scheduled → settled / void. */
  status: EntryStatus;

  /** Thông tin thanh toán thưởng. */
  payout?: EntryPayout;

  /** Thông tin huỷ entry (khi void). */
  voidInfo?: EntryVoidInfo;

  /** Phiên bản optimistic locking. */
  version: Long;
  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối. */
  updatedAt: Date;
}

/**
 * Application-layer entity sau khi qua mapper.
 *
 * Chuyển đổi so với TicketEntryDoc:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `version` (BSON Long) → `version` (string) – safe cho JSON serialize.
 */
export interface TicketEntryEntity extends Omit<TicketEntryDoc, "_id" | "version"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
  /**
   * Global change sequence đã convert từ BSON Long → string.
   * Dùng cho feed sync detect thay đổi.
   */
  version: string;
}
