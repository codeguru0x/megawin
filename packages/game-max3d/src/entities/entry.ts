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
} from "./enums";
import type { Triplet, ISODateString } from "./types";
import type { Max3dDrawResult } from "./draw-result";

// ─────────────────────────────────────────────
// Entry Board Snapshot
// ─────────────────────────────────────────────

export interface EntryBoardSnapshot {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Board bị huỷ (khi void 1 phần). */
  isVoid?: boolean;
  /** Cách chơi: basic / plus. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / combo3 / combo6 / quickPick. */
  playType: PlayType;
  /** Danh sách bộ ba số đã chọn (hoặc đã expand từ combo). */
  triplets: Triplet[];
  /** Số lines của board = số lần dự thưởng. Phụ thuộc playType và chữ số trùng. */
  lineCount: number;
}

// ─────────────────────────────────────────────
// Entry Payout Tier
// ─────────────────────────────────────────────

export interface EntryPayoutTier {
  /** Hạng giải: special/first/second/third (basic) hoặc special–sixth (plus). */
  tier: BasicPrizeTier | PlusPrizeTier;
  /** Số lines trúng hạng giải này. */
  hitCount: number;
  /** Giá trị 1 lần trúng (VND). Từ bảng giải thưởng config. */
  unitAmount: number;
  /** Tổng tiền = hitCount × unitAmount. */
  amount: number;
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
  /** ID vé gốc sinh ra entry này. */
  ticketId: string;

  /** ID kỳ quay entry tham gia. Format: "YYYY-MM-DD.NNN". */
  drawId: string;
  /** Thời điểm quay của kỳ mà entry tham gia. */
  drawTime: Date;
  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;
  /** Ngày tài chính, dùng cho báo cáo. Thường = drawDate. */
  financialDate: ISODateString;

  /** Snapshot thông tin đại lý tại thời điểm tạo entry. */
  tenantSnapshot: {
    /** Tỷ lệ hoa hồng snapshot tại thời điểm tạo entry. */
    commissionRate: number;
    /** Số tiền hoa hồng = amount × commissionRate. */
    commissionAmount: number;
  };

  /** Tổng lines = Σ(board.lineCount). Mỗi line = 1 lần dự thưởng × unitPrice. */
  lineCount: number;
  /** Tổng tiền cược = lineCount × unitPrice (VND). */
  amount: number;
  /** Mệnh giá 1 line (VND). Snapshot từ global config. */
  unitPrice: number;

  /** Tóm tắt nội dung vé (boards, ticketNo). */
  entrySummary: {
    /** Mã vé hiển thị cho người chơi. */
    ticketNo: string;
    /** Danh sách boards snapshot khi tạo entry. */
    boards: EntryBoardSnapshot[];
  };

  /** Snapshot kết quả quay. Set khi settle. */
  result?: Max3dDrawResult & {
    /** Thời điểm publish kết quả. */
    publishedAt: Date;
  };

  /** Kết quả: "win" | "lose" | "void". Set khi settle/void. */
  outcome?: EntryOutcome;
  /** Trạng thái vận hành entry: pending → settled / voided. */
  status: EntryStatus;

  /** Chi tiết thanh toán. Set khi settle. */
  payout?: {
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
  };

  /** Thông tin huỷ entry. Set khi void. */
  voidInfo?: {
    /** Lý do huỷ entry. */
    reason: string;
    /** Số tiền gốc trước khi huỷ. */
    originalAmount: number;
    /** Số tiền hoàn trả cho người chơi. */
    refundAmount: number;
    /** Trạng thái hoàn tiền: pending → dispatched → confirmed. */
    refundStatus: string;
    /** Thời điểm huỷ entry. */
    voidedAt: Date;
    /** Thời điểm dispatch hoàn tiền. */
    refundDispatchedAt?: Date;
    /** Thời điểm xác nhận hoàn tiền thành công. */
    refundConfirmedAt?: Date;
    /** Thông báo lỗi nếu hoàn tiền thất bại. */
    refundError?: string;
  };

  /** Optimistic locking version. */
  version: Long;
  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}
