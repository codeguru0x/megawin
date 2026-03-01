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
 *   scheduled → active → drawn → settled
 *                              ↘ void
 *
 * Collection: power655TicketEntries.
 */

import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { PrizeTier, PayoutStatus, RefundStatus } from "./enums";
import type { Board } from "./ticket";
import type { ISODateString } from "./types";

/**
 * Thông tin trả thưởng cho entry thắng.
 * Ghi sau settle – dùng cho dispatch payout worker.
 */
export interface EntryPayout {
  /** Tổng tiền thắng (giải cố định + split bonus nếu có). */
  winAmount: number;
  /** Tiền thực trả (= winAmount, có thể điều chỉnh trong tương lai). */
  payoutAmount: number;
  /** Trạng thái dispatch: pending → dispatched → confirmed/failed. */
  payoutStatus: PayoutStatus;
  /** Chi tiết thắng theo từng hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm dispatch thành công. */
  dispatchedAt?: Date;
  /** Lỗi gần nhất khi dispatch (retry). */
  lastError?: string;
  /** Số lần retry dispatch (max 10). */
  retryCount: number;
}

/**
 * Chi tiết thắng 1 hạng giải trong entry.
 * Ví dụ: trúng 3 lines Giải Ba → matchCount=3, prizePerLine=50000, totalPrize=150000.
 */
export interface EntryPayoutTier {
  /** Hạng giải: jackpot1, jackpot2, tier1, tier2, tier3. */
  tier: PrizeTier;
  /** Số lines trúng hạng này. */
  matchCount: number;
  /** Giải thưởng mỗi line (cố định: 40tr, 500k, 50k). */
  prizePerLine: number;
  /** Tổng = matchCount × prizePerLine. */
  totalPrize: number;
  /** True nếu đây là bonus từ split cycle (patch thêm sau settle). */
  isSplitBonus?: boolean;
  /** Số tiền split bonus mỗi winner nhận. */
  splitBonusAmount?: number;
}

/**
 * Thông tin hoàn tiền khi kỳ quay bị void.
 */
export interface EntryRefund {
  /** Số tiền hoàn = stakeAmount. */
  refundAmount: number;
  /** Trạng thái: pending → dispatched → confirmed/failed. */
  refundStatus: RefundStatus;
  /** Lý do void (copy từ DrawVoidSummary). */
  reason: string;
  /** Thời điểm dispatch thành công. */
  dispatchedAt?: Date;
  /** Lỗi gần nhất. */
  lastError?: string;
  /** Số lần retry (max 10). */
  retryCount: number;
}

/**
 * Tóm tắt entry – dùng cho query nhanh mà không cần đọc boards.
 */
export interface EntrySummary {
  /** Tổng lines = sum(board.lineCount). */
  totalLines: number;
  /** Hash selection – verify entry khớp ticket gốc. */
  selectionHash: string;
}

/**
 * MongoDB document cho entry Power 6/55.
 * Collection: power655TicketEntries.
 */
export interface TicketEntryDoc {
  _id: unknown;
  /** Reference đến ticket gốc (ObjectId as string). */
  ticketId: string;
  /** Mã vé (denormalized từ ticket – hiển thị cho player). */
  ticketNo: string;
  /** ID tenant/đại lý. */
  tenantId: string;
  /** ID tài khoản Megawin (internal). */
  accountId: string;
  /** ID người chơi (external, từ tenant). */
  playerId: string;
  /** Mã kỳ quay: "YYYY-MM-DD.001". Join key với draws. */
  drawId: string;
  /** Ngày quay "YYYY-MM-DD". Dùng cho filter/report. */
  drawDate: ISODateString;
  /** Ngày tài chính (11h→10h59 hôm sau). Dùng cho báo cáo doanh thu. */
  financialDate: string;
  /** Thời điểm quay chính xác (UTC). Dùng cho sort và display. */
  drawTime: Date;
  /** Trạng thái lifecycle: scheduled → active → drawn → settled / void. */
  status: EntryStatus;
  /** Kết quả thắng/thua (ghi sau settle). */
  outcome?: EntryOutcome;
  /** Snapshot boards từ ticket gốc. Settle dùng field này, không join ticket. */
  boards: Board[];
  /** Tiền cược entry = ticket.stakePerDraw. */
  stakeAmount: number;
  /** Tóm tắt: tổng lines + hash. */
  entrySummary: EntrySummary;
  /** Chi tiết trả thưởng (chỉ có sau settle, outcome = win). */
  payout?: EntryPayout;
  /** Chi tiết hoàn tiền (chỉ có khi entry bị void). */
  refund?: EntryRefund;
  /** BSON Long – global sequence, tăng mỗi lần insert/update. Dùng cho feed sync. */
  version: unknown;
  /** Thời điểm settle xong. */
  settledAt?: Date;
  /** Thời điểm bị void. */
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Application layer entity (version chuyển Long → string). */
export interface TicketEntryEntity extends Omit<
  TicketEntryDoc,
  "_id" | "version"
> {
  id: string;
  /** Version dạng string (BigInt serialized). */
  version: string;
}
