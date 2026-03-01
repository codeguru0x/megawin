/**
 * Power 6/55 – Ticket Entity (Vé dự thưởng)
 *
 * Mỗi vé (ticket) đại diện cho 1 lần mua của player.
 * Vé chứa tối đa 5 bảng (A-E), mỗi bảng có PlayType riêng.
 * Vé có thể tham gia 1-6 kỳ quay liên tiếp (multi-draw).
 *
 * Vé là IMMUTABLE sau khi tạo – không sửa boards/selection.
 * Chỉ update: progress (sau settle), settlement (tổng thắng), voidSummary.
 *
 * Giá vé = unitPrice × totalLines × drawCount.
 * Collection: power655Tickets.
 */

import type { TicketStatus, TicketChannel } from "@megawin/game-core/entities";
import type { PlayType } from "./enums";
import type { BoardSelection, BoardNo } from "./types";

/**
 * 1 bảng trên vé (A-E).
 * Mỗi bảng có loại chơi riêng (Standard, Bao, QuickPick).
 */
export interface Board {
  /** Ký hiệu bảng: "A", "B", "C", "D", "E". */
  boardNo: BoardNo;
  /** Loại chơi: standard, bao7-bao18, quickPick. */
  playType: PlayType;
  /** Các số đã chọn. Số lượng phụ thuộc playType. */
  selection: BoardSelection;
  /** Số bộ số (lines) expand từ bảng này. Standard=1, Bao7=7, Bao18=18564, etc. */
  lineCount: number;
  /** Bảng bị void (chỉ khi có lỗi nghiêm trọng – hiếm khi dùng). */
  isVoid: boolean;
}

/**
 * Thông tin expand của vé.
 * Tính 1 lần khi tạo vé, dùng cho tính giá và verify.
 */
export interface TicketExpansion {
  /** Tổng số lines = sum(board.lineCount) cho tất cả boards active. */
  totalLines: number;
  /** SHA-256 hash của canonical selection. Dùng verify entry khớp ticket gốc. */
  selectionHash: string;
}

/**
 * Kế hoạch tham gia kỳ quay.
 * Hỗ trợ multi-draw: 1 vé có thể tham gia 1-6 kỳ liên tiếp.
 */
export interface TicketDrawPlan {
  /** Danh sách drawIds đăng ký (VD: ["2026-03-03.001", "2026-03-05.001"]). */
  drawIds: string[];
  /** Danh sách drawIds đã tạo entry (ban đầu = drawIds, có thể < drawIds nếu void). */
  enrolledDrawIds: string[];
  /** Tổng số kỳ đăng ký. */
  drawCount: number;
  /** Số kỳ chưa settle/void. */
  remainingDraws: number;
  /** True khi tất cả entries đã tạo cho mọi kỳ. */
  fullyEnrolled: boolean;
}

/**
 * Tiến độ settle của vé.
 * Cập nhật sau mỗi kỳ settle bởi SyncTicketSummaries use case.
 */
export interface TicketProgress {
  /** DrawId kỳ tiếp theo chưa settle (null khi xong hết). */
  nextDrawId?: string;
  /** Số kỳ đã settle xong. */
  settledDrawCount: number;
  /** Số kỳ bị void. */
  voidDrawCount: number;
}

/**
 * Tổng kết thưởng sau settle.
 * Aggregate từ tất cả entries đã settled.
 */
export interface TicketSettlement {
  /** Tổng tiền thắng (trước phí). */
  totalWinAmount: number;
  /** Tổng tiền đã trả (sau phí, split bonus). */
  totalPayoutAmount: number;
  /** Thời điểm settle gần nhất. */
  lastSettledAt?: Date;
}

/**
 * Tổng kết hoàn tiền khi có kỳ quay bị void.
 */
export interface TicketVoidSummary {
  /** Tổng tiền đã hoàn. */
  totalRefundAmount: number;
  /** Số kỳ bị void. */
  voidDrawCount: number;
}

/**
 * MongoDB document cho vé Power 6/55.
 * Collection: power655Tickets.
 */
export interface TicketDoc {
  _id: unknown;
  /** Mã vé unique format: "P655-YYYYMMDD-N" (game prefix + date + sequence). */
  ticketNo: string;
  /** ID tenant/đại lý bán vé. */
  tenantId: string;
  /** ID tài khoản Megawin (internal). */
  accountId: string;
  /** ID người chơi (external, từ tenant). */
  playerId: string;
  /** Kênh bán: "pos" (điểm bán), "web", "sdk". */
  channel: TicketChannel;
  /** Danh sách bảng đã chọn (1-5 bảng). */
  boards: Board[];
  /** Thông tin expand: tổng lines + hash verify. */
  expansion: TicketExpansion;
  /** Tiền cược mỗi kỳ = unitPrice × totalLines. */
  stakePerDraw: number;
  /** Tổng tiền cược = stakePerDraw × drawCount. */
  totalStake: number;
  /** Kế hoạch multi-draw. */
  drawPlan: TicketDrawPlan;
  /** Tiến độ settle. Cập nhật bởi worker sau mỗi kỳ. */
  progress: TicketProgress;
  /** Tổng kết thắng/thua. Cập nhật bởi worker. */
  settlement: TicketSettlement;
  /** Tổng kết void (chỉ có khi có kỳ bị void). */
  voidSummary?: TicketVoidSummary;
  /** Trạng thái vé: paid → completed, hoặc → refunded/void. */
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Application layer entity. */
export interface TicketEntity extends Omit<TicketDoc, "_id"> {
  id: string;
}
