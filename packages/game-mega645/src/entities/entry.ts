/**
 * Mega 6/45 – Ticket Entry Document
 *
 * Collection: mega645TicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay cụ thể.
 */

import type { PlayType, PrizeTier } from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { Long } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý. Ví dụ: 0.2 = 20%. */
  commissionRate: number;
  /**
   * Số tiền hoa hồng đại lý (VND).
   * Công thức: amount × commissionRate.
   */
  commissionAmount: number;
}

/** Tóm tắt nội dung entry (dùng cho hiển thị, truy vấn nhanh). */
export interface EntrySummary {
  /** Số vé (mã hiển thị cho người chơi). */
  ticketNo: string;

  /** Snapshot các board từ vé gốc. */
  boards: EntryBoardSnapshot[];
}

/** Kết quả kỳ quay (ghi lại khi settle). */
export interface EntryResult {
  /**
   * 6 số trúng thưởng theo thứ tự quay gốc (không sort).
   * Lưu dạng string[] (zero-padded "01"-"45") — dùng trực tiếp từ MongoDB, tránh cast.
   */
  winningNumbers: string[];

  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Thông tin trả thưởng (chỉ có khi trúng giải). */
export interface EntryPayout {
  /**
   * Tổng tiền trúng thưởng (VND).
   * Công thức: Σ(tiers[].amount).
   */
  winAmount: number;
  /** Tổng tiền thực trả cho người chơi (VND). Thường = winAmount. */
  payoutAmount: number;
  /** Chi tiết trúng thưởng theo từng hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle (tính toán kết quả). */
  settledAt: Date;

  /**
   * Idempotency key cho payout transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại settle time, ghi atomic cùng payout data.
   * `EnqueueDispatchPayouts` đọc field này, seed vào `TenantDispatchOrderDoc.tx`
   * để worker gửi tenant idempotent. Chỉ sinh khi entry thắng (có payout cần dispatch).
   *
   * Trạng thái dispatch (pending/dispatched/failed) lưu tại
   * `tenant_dispatch_orders` — KHÔNG còn lưu trên entry.
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  payoutTx?: string;
}

/** Thông tin huỷ entry (khi kỳ quay bị void). */
export interface EntryVoidInfo {
  /** Số tiền gốc của entry (VND). */
  originalAmount: number;
  /** Số tiền hoàn trả (VND). Thường = originalAmount. */
  refundAmount: number;
  /** Thời điểm huỷ. */
  voidedAt: Date;

  /**
   * Idempotency key cho refund transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại void time, ghi atomic cùng void data. Worker dùng field này làm
   * `TenantDispatchOrderDoc.tx` — retry luôn gửi cùng giá trị → tenant idempotent.
   *
   * Trạng thái dispatch lưu tại `tenant_dispatch_orders` — KHÔNG còn trên entry.
   *
   * @example `"01907a12-c3d4-7abc-9ef0-123456789abc"`
   */
  refundTx: string;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /** ID đại lý (tenant) bán vé. */
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
  /** Tham chiếu đến vé gốc (mega645Tickets._id). */
  ticketId: string;

  /** ID kỳ quay mà entry này tham gia. Format: "YYYY-MM-DD.001". */
  drawId: string;
  /** Ngày tài chính "YYYY-MM-DD". */
  financialDate: ISODateString;

  /** Snapshot thông tin đại lý tại thời điểm tạo entry. */
  tenant: EntryTenantSnapshot;

  /** Trạng thái entry (pending → active → settled / voided). */
  status: EntryStatus;

  /**
   * Tổng số line của entry (bao gồm cả lines từ bao).
   * Công thức: Σ(boards[].expandedLines).
   */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(expandedLines × betCount). Dùng tính tiền.
   */
  betUnitCount: number;
  /**
   * Tổng số tiền đặt cược (VND).
   * Công thức: betUnitCount × unitPrice.
   */
  amount: number;
  /** Đơn giá 1 line (VND). Snapshot từ config tại thời điểm đặt vé. */
  unitPrice: number;

  /** Tóm tắt nội dung entry (dùng cho hiển thị, truy vấn nhanh). */
  entrySummary: EntrySummary;

  /** Kết quả kỳ quay (ghi lại khi publish result). */
  result?: EntryResult;

  /** Kết quả đối soát (win / lose). Chỉ có sau khi settle. */
  outcome?: EntryOutcome;

  /** Thông tin trả thưởng (chỉ có khi trúng giải). */
  payout?: EntryPayout;

  /** Thông tin huỷ entry (khi kỳ quay bị void). */
  voidInfo?: EntryVoidInfo;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
  /** Số phiên bản document (optimistic locking). */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot board trong entry (ghi lại từ vé gốc). */
export interface EntryBoardSnapshot {
  /** Ký hiệu board ("A".."F"). */
  boardNo: string;

  /** Kiểu chơi (standard / bao5 / bao7-18). */
  playType: PlayType;

  /** Danh sách số người chơi đã chọn ("01"-"45"). */
  numbers: string[];

  /**
   * Số line sau khi expand từ board.
   * - standard: 1
   * - bao5: 40
   * - bao7-18: C(N, 6)
   */
  expandedLines: number;

  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board. */
  betCount: number;
}

/**
 * Chi tiết trúng thưởng 1 hạng giải trong entry (Mega 6/45).
 *
 * ─────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG CÓ `betUnitCount`?
 * ─────────────────────────────────────────────────────────────────
 *
 * Mega 6/45 không có Split Cycle (chia Jackpot tích luỹ xuống các hạng giải
 * thấp hơn). Vì vậy không cần aggregate `Σ(betCount × hitCount)` per tier
 * từ entry collection sau khi settle.
 *
 * `betCount` đã được tính vào `winAmount` của từng line doc khi settle:
 *   `winAmount = unitAmount × betCount`
 * → `amount = Σ(winAmount từ lines)` — đã nhân betCount, không cần lưu thêm.
 *
 * Để biết lý do đầy đủ và ví dụ phân bổ split bonus theo betUnitCount,
 * xem JSDoc của `EntryPayoutTier` trong `@megawin/game-lotto535/entities`.
 * ─────────────────────────────────────────────────────────────────
 */
export interface EntryPayoutTier {
  /** Hạng giải (jackpot / tier1 / tier2 / tier3). */
  tier: PrizeTier;

  /** Số lines vật lý trúng hạng giải này (không nhân betCount). */
  hitCount: number;

  /**
   * Tiền thưởng cho 1 đơn vị tham gia dự thưởng (VND).
   * Jackpot: = 0 tại SettleEntries, patch ở PatchJackpotPrize khi biết pool chính xác.
   */
  unitAmount: number;

  /**
   * Tổng tiền thưởng hạng giải này (VND).
   * Đã nhân betCount — player betCount=3 trúng tier2 nhận gấp 3 player betCount=1.
   * Công thức: `Σ(winAmount per line)` = `hitCount × unitAmount × betCount` (khi 1 board).
   */
  amount: number;
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
