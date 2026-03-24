/**
 * Max 3D – Ticket Entry Document
 *
 * Collection: max3d_ticket_entries
 *
 * 1 entry = 1 vé tham gia 1 kỳ quay.
 * Primary operational unit cho settle, payout, void.
 */

import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";
import type {
  PlayMode,
  PlayType,
  BasicPrizeTier,
  PlusPrizeTier,
  PayoutStatus,
  RefundStatus,
} from "./enums";
import type { Triplet, ISODateString } from "./types";
import type { Max3dDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Entry Board Snapshot
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: basic / plus. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / combo3 / combo6. */
  playType: PlayType;
  /** Danh sách bộ ba số đã chọn (hoặc đã expand từ combo). */
  triplets: Triplet[];
  /** Số lines của board = số lần dự thưởng. Phụ thuộc playType và chữ số trùng. */
  lineCount: number;
  /** Số lần cược nhân bội (≥ 1). Snapshot từ ticket board. */
  betCount: number;
}

// ─────────────────────────────────────────────
// Entry Payout Tier
// ─────────────────────────────────────────────

export interface EntryPayoutTier {
  /** Hạng giải: special/first/second/third (basic) hoặc special–sixth (plus). */
  tier: BasicPrizeTier | PlusPrizeTier;
  /**
   * Cách chơi sinh ra hạng giải này.
   * Cần thiết vì BasicPrizeTier và PlusPrizeTier có 4 tier trùng tên nhau
   * (special, first, second, third) nhưng giá trị giải thưởng khác nhau.
   * Dùng khi aggregate settleSummary để tách bảng basic vs plus.
   */
  playMode: PlayMode;
  /** Số lines trúng hạng giải này. */
  hitCount: number;
  /** Giá trị 1 lần trúng (VND). Từ bảng giải thưởng config. */
  unitAmount: number;
  /** Tổng tiền = hitCount × unitAmount. */
  amount: number;
}

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng snapshot tại thời điểm tạo entry. */
  commissionRate: number;
  /** Số tiền hoa hồng = amount × commissionRate. */
  commissionAmount: number;
}

/** Tóm tắt nội dung vé (boards, ticketNo). */
export interface EntrySummary {
  /** Mã vé hiển thị cho người chơi. */
  ticketNo: string;
  /** Danh sách boards snapshot khi tạo entry. */
  boards: EntryBoardSnapshot[];
}

/** Chi tiết thanh toán thưởng. Set khi settle. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(tiers[].amount). */
  winAmount: number;
  /** Tiền trả cho player = winAmount (Max 3D không có payout cap cho từng entry). */
  payoutAmount: number;
  /** Chi tiết thắng theo hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle. */
  settledAt: Date;
  /** Trạng thái dispatch payout: pending → dispatched → confirmed. */
  payoutStatus?: PayoutStatus;
  /** Thời điểm dispatch payout cho ví người chơi. */
  payoutDispatchedAt?: Date;
  /** Thời điểm xác nhận payout thành công. */
  payoutConfirmedAt?: Date;
  /** Thông báo lỗi nếu payout thất bại. */
  payoutError?: string;
}

/** Snapshot kết quả kỳ quay ghi vào entry khi settle. */
export interface EntryResult extends Max3dDrawResult {
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Thông tin huỷ entry. Set khi void. */
export interface EntryVoidInfo {
  /** Số tiền gốc trước khi huỷ (VND). */
  originalAmount: number;
  /** Số tiền hoàn trả cho người chơi (VND). */
  refundAmount: number;
  /** Trạng thái hoàn tiền: pending → dispatched → confirmed. */
  refundStatus: RefundStatus;
  /** Thời điểm huỷ entry. */
  voidedAt: Date;
  /** Thời điểm dispatch hoàn tiền cho ví người chơi. */
  refundDispatchedAt?: Date;
  /** Thời điểm xác nhận hoàn tiền thành công. */
  refundConfirmedAt?: Date;
  /** Thông báo lỗi nếu hoàn tiền thất bại. */
  refundError?: string;
}

// ─────────────────────────────────────────────
// Ticket Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  /** ID đại lý sở hữu entry. */
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
  /** ID vé gốc sinh ra entry này. */
  ticketId: string;

  /** ID kỳ quay entry tham gia. Format: "YYYY-MM-DD.NNN". */
  drawId: string;
  /** Ngày tài chính, dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  /** Snapshot thông tin đại lý tại thời điểm tạo entry. */
  tenant: EntryTenantSnapshot;

  /** Tổng lines matching = Σ(board.lineCount). Dùng cho settle. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(board.lineCount × board.betCount). Dùng tính tiền. */
  betUnitCount: number;
  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;
  /** Mệnh giá 1 line (VND). Snapshot từ global config. */
  unitPrice: number;

  /** Tóm tắt nội dung vé (boards, ticketNo). */
  entrySummary: EntrySummary;

  /** Snapshot kết quả kỳ quay ghi vào entry khi settle. Set khi settle. */
  result?: EntryResult;

  /** Kết quả: "win" | "lose" | "void". Set khi settle/void. */
  outcome?: EntryOutcome;
  /** Trạng thái vận hành entry: scheduled → settled / void. */
  status: EntryStatus;

  /** Chi tiết thanh toán. Set khi settle. */
  payout?: EntryPayout;

  /** Thông tin huỷ entry. Set khi void. */
  voidInfo?: EntryVoidInfo;

  /** Optimistic locking version. */
  version: Long;

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
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
