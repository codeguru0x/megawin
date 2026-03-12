/**
 * Bingo 18 – Ticket Entry Document
 *
 * Collection: bingo18_ticket_entries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Bingo 18 cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 */

import type {
  Bingo18PlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
  PayoutStatus,
  RefundStatus,
} from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { Long } from "@megawin/game-core/types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Thông tin hoa hồng đại lý, snapshot tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng snapshot tại thời điểm tạo entry. Lấy từ tenant config. */
  commissionRate: number;
  /** Số tiền hoa hồng = amount × commissionRate. Tính sẵn để dùng trong settle. */
  commissionAmount: number;
}

/** Tóm tắt nội dung cược, snapshot từ ticket. Dùng để hiển thị + settle. */
export interface EntrySummary {
  /** Mã vé (display), format do hệ thống sinh. */
  ticketNo: string;
  /** Danh sách boards cơ bản (singleNum, doubleMatch, tripleMatch). */
  boards: EntryBoardSnapshot[];
  /** Danh sách side bets (sumTotal, bigSmallDraw). */
  sideBets: EntrySideBetSnapshot[];
}

/**
 * Snapshot kết quả kỳ quay. Copy từ draw khi settle.
 * Giữ local để truy vấn entry không cần join draw.
 */
export interface EntryResult {
  /** 3 số kết quả quay (giữ nguyên thứ tự). */
  numbers: number[];
  /** Tổng 3 số quay (3-18). */
  sum: number;
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Chi tiết thanh toán. Set sau khi settle tính xong thắng/thua. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(boardPayouts.winAmount) + Σ(sideBetPayouts.winAmount). */
  winAmount: number;
  /** Tiền trả cho player = winAmount (Bingo 18 không có payout cap). */
  payoutAmount: number;
  /** Chi tiết payout từng board cơ bản. */
  boardPayouts: EntryBoardPayout[];
  /** Chi tiết payout từng side bet. */
  sideBetPayouts: EntrySideBetPayout[];
  /** Thời điểm settle hoàn tất (tính toán xong thắng/thua). */
  settledAt: Date;
  /** Trạng thái dispatch tiền thưởng vào ví player. */
  payoutStatus?: PayoutStatus;
  /** Thời điểm dispatch payout vào ví player. */
  payoutDispatchedAt?: Date;
  /** Số lần retry dispatch payout đã thực hiện. */
  payoutRetryCount?: number;
  /** Lỗi cuối cùng khi dispatch payout (nếu có). Dùng để debug. */
  payoutLastError?: string;
}

/**
 * Thông tin void + refund. Set khi kỳ quay bị huỷ.
 * Toàn bộ tiền cược được hoàn 100%.
 */
export interface EntryVoidInfo {
  /** Tiền cược gốc trước void = entry.amount. */
  originalAmount: number;
  /** Tiền hoàn trả = originalAmount (hoàn 100%). */
  refundAmount: number;
  /** Trạng thái refund: pending → completed hoặc failed. */
  refundStatus: RefundStatus;
  /** Thời điểm entry bị void. */
  voidedAt: Date;
  /** Thời điểm refund hoàn tất (tiền đã vào ví player). */
  refundedAt?: Date;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  /** MongoDB document ID. */
  _id: unknown;

  // ───── Partition / Ownership ─────

  /** ID đại lý sở hữu entry. Dùng để phân vùng dữ liệu multi-tenant. */
  tenantId: string;
  /** ID tài khoản player đặt cược. */
  accountId: string;
  /** Tên đăng nhập player, snapshot tại thời điểm tạo entry. */
  username: string;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;
  /** Reference đến ticket gốc (ObjectId). 1 ticket sinh N entries (N = drawCount). */
  ticketId: unknown;

  // ───── Draw Snapshot ─────

  /** ID kỳ quay mà entry tham gia. Format: "YYYY-MM-DD.NNN". */
  drawId: string;
  /** Ngày tài chính của kỳ quay. Snapshot từ draw, dùng cho báo cáo. */
  financialDate: ISODateString;

  // ───── Tenant ─────

  /** Thông tin hoa hồng đại lý, snapshot tại thời điểm tạo entry. */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /**
   * Trạng thái entry.
   * Luồng: pending → settled (nếu draw published) hoặc pending → voided (nếu draw void).
   */
  status: EntryStatus;

  // ───── Stake ─────

  /** Số lượng cược = boards.length + sideBets.length. */
  betCount: number;
  /** Tổng tiền cược = betCount × unitPrice. Trừ từ ví player khi tạo entry. */
  amount: number;
  /** Mệnh giá 1 lần cược (VND). Snapshot từ global config (mặc định 10.000đ). */
  unitPrice: number;

  // ───── Entry Summary ─────

  /** Tóm tắt nội dung cược, snapshot từ ticket. Dùng để hiển thị + settle. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot ─────

  /**
   * Snapshot kết quả kỳ quay. Copy từ draw khi settle.
   * Giữ local để truy vấn entry không cần join draw.
   */
  result?: EntryResult;

  // ───── Outcome ─────

  /** Kết quả thắng/thua tổng hợp: "win" | "lose" | "partial_win". Set sau settle. */
  outcome?: EntryOutcome;

  // ───── Payout ─────

  /** Chi tiết thanh toán. Set sau khi settle tính xong thắng/thua. */
  payout?: EntryPayout;

  // ───── Void / Refund ─────

  /**
   * Thông tin void + refund. Set khi kỳ quay bị huỷ.
   * Toàn bộ tiền cược được hoàn 100%.
   */
  voidInfo?: EntryVoidInfo;

  // ───── Timestamps ─────

  /** Thời điểm tạo entry. Set 1 lần khi ticket được place bet, không đổi. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. Tự động cập nhật mỗi khi document thay đổi. */
  updatedAt: Date;
  /** Optimistic concurrency version. Tăng +1 mỗi lần update, dùng chống race condition. */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board cơ bản từ ticket. Lưu cùng entry để settle mà không cần join ticket. */
export interface EntryBoardSnapshot {
  /** Mã board, format "B01", "B02",... Unique trong 1 ticket. */
  boardNo: string;
  /** Loại cược: "singleNum" | "doubleMatch" | "tripleMatch". Quyết định cách tính thưởng. */
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6). Dùng cho singleNum + doubleMatch. undefined cho tripleMatch any. */
  number?: number;
  /** Phân loại triple: "specific" (chọn số cụ thể) hoặc "any" (bất kỳ bộ ba). Chỉ dùng cho tripleMatch. */
  tripleKind?: Bingo18TripleKind;
}

/** Snapshot 1 side bet từ ticket. Lưu cùng entry để settle. */
export interface EntrySideBetSnapshot {
  /** Loại side bet: "sumTotal" | "bigSmallDraw". */
  playType: Bingo18PlayType;
  /** Tổng cụ thể đã chọn (3-18). Chỉ dùng cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ: "big" | "draw" | "small". Chỉ dùng cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
}

/** Kết quả payout 1 board cơ bản sau settle. */
export interface EntryBoardPayout {
  /** Mã board tương ứng trong entrySummary.boards. */
  boardNo: string;
  /** Loại cược của board. */
  playType: Bingo18PlayType;
  /**
   * Phân loại triple: "specific" (1.200.000đ) hoặc "any" (200.000đ).
   * Chỉ set cho tripleMatch — undefined với singleNum và doubleMatch.
   * Lưu vào payout để aggregation settleSummary có thể phân biệt 2 mức giải.
   */
  tripleKind?: Bingo18TripleKind;
  /** Số lần số đã chọn xuất hiện trong kết quả (0-3). Chỉ relevant cho singleNum. */
  matchCount: number;
  /** Tiền thắng board này. = 0 nếu thua, tra bảng prize theo playType + matchCount nếu thắng. */
  winAmount: number;
}

/** Kết quả payout 1 side bet sau settle. */
export interface EntrySideBetPayout {
  /** Loại side bet. */
  playType: Bingo18PlayType;
  /** Tổng đã chọn (3-18). Chỉ set cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ. Chỉ set cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Kết quả thực tế của kỳ quay (ví dụ: "big", "small", "draw", hoặc giá trị tổng). */
  outcome: string;
  /** Side bet này có thắng hay không. */
  isWin: boolean;
  /** Tiền thắng side bet này. = 0 nếu thua, tra bảng prize theo playType nếu thắng. */
  winAmount: number;
}
