/**
 * Game Core – Game Display Labels
 *
 * Tên hiển thị chính thức của các game trong hệ thống.
 * Dùng cho tất cả UI components, báo cáo, navigation, v.v.
 *
 * Import: `import { GAME_LABELS, getGameLabel } from "@megawin/game-core/labels"`
 */

import { GameProduct } from "../entities/game-core.enums";

// ─────────────────────────────────────────────
// Game Display Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị chính thức của mỗi game.
 *
 * Key: `GameProduct` value (string)
 * Value: Tên tiếng Việt đầy đủ dùng trên UI
 */
export const GAME_LABELS: Record<GameProduct, string> = {
  [GameProduct.Lotto535]: "Lotto 5/35",
  [GameProduct.Power655]: "Power 6/55",
  [GameProduct.Mega645]: "Mega 6/45",
  [GameProduct.Keno]: "Keno",
  [GameProduct.Bingo18]: "Bingo 18",
  [GameProduct.Max3d]: "Max 3D",
  [GameProduct.Max3dpro]: "Max 3D Pro",
} as const;

/**
 * Lấy tên hiển thị của game theo `GameProduct` value.
 * Trả về key gốc nếu không tìm thấy (fallback an toàn).
 *
 * @param game - GameProduct value (e.g. "lotto535", "keno")
 */
export function getGameLabel(game: GameProduct): string {
  return GAME_LABELS[game] ?? game;
}

// ─────────────────────────────────────────────
// Draw Status Labels
// ─────────────────────────────────────────────

import { DrawStatus } from "../entities/game-core.enums";

/**
 * Tên hiển thị trạng thái kỳ quay.
 * Dùng chung cho tất cả game.
 */
export const DRAW_STATUS_LABELS: Record<DrawStatus, string> = {
  [DrawStatus.Scheduled]: "Chờ mở bán",
  [DrawStatus.SalesOpen]: "Đang bán",
  [DrawStatus.SalesClosed]: "Đã đóng bán",
  [DrawStatus.Published]: "Đã công bố",
  [DrawStatus.Settling]: "Đang tính thưởng",
  [DrawStatus.Settled]: "Đã tính thưởng",
  [DrawStatus.Voiding]: "Đang huỷ",
  [DrawStatus.Void]: "Đã huỷ",
} as const;

/**
 * Lấy label trạng thái kỳ quay.
 *
 * @param status - DrawStatus value
 */
export function getDrawStatusLabel(status: DrawStatus): string {
  return DRAW_STATUS_LABELS[status] ?? status;
}

// ─────────────────────────────────────────────
// Entry Status Labels
// ─────────────────────────────────────────────

import { EntryStatus } from "../entities/game-core.enums";

/**
 * Tên hiển thị trạng thái đơn cược (entry).
 * Dùng chung cho tất cả game.
 */
export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  [EntryStatus.Scheduled]: "Chờ quay",
  [EntryStatus.Settled]: "Đã tính thưởng",
  [EntryStatus.Void]: "Đã huỷ",
} as const;

/**
 * Lấy label trạng thái đơn cược.
 *
 * @param status - EntryStatus value
 */
export function getEntryStatusLabel(status: EntryStatus): string {
  return ENTRY_STATUS_LABELS[status] ?? status;
}

// ─────────────────────────────────────────────
// Ticket Status Labels
// ─────────────────────────────────────────────

import { TicketStatus } from "../entities/game-core.enums";

/**
 * Tên hiển thị trạng thái vé.
 * Dùng chung cho tất cả game.
 */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.Paid]: "Đã thanh toán",
  [TicketStatus.Refunded]: "Đã hoàn tiền",
  [TicketStatus.Void]: "Đã huỷ",
  [TicketStatus.Completed]: "Hoàn tất",
} as const;

/**
 * Lấy label trạng thái vé.
 *
 * @param status - TicketStatus value
 */
export function getTicketStatusLabel(status: TicketStatus): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}

// ─────────────────────────────────────────────
// Entry Outcome Labels
// ─────────────────────────────────────────────

import { EntryOutcome } from "../entities/game-core.enums";

/**
 * Tên hiển thị kết quả đơn cược (outcome).
 * Dùng chung cho tất cả game.
 */
export const ENTRY_OUTCOME_LABELS: Record<EntryOutcome, string> = {
  [EntryOutcome.Win]: "Trúng",
  [EntryOutcome.Loss]: "Không trúng",
  [EntryOutcome.Void]: "Đã huỷ",
} as const;

/**
 * Lấy label outcome đơn cược.
 *
 * @param outcome - EntryOutcome value
 */
export function getEntryOutcomeLabel(outcome: EntryOutcome): string {
  return ENTRY_OUTCOME_LABELS[outcome] ?? outcome;
}

// ─────────────────────────────────────────────
// Ticket Channel Labels
// ─────────────────────────────────────────────

import { TicketChannel } from "../entities/game-core.enums";

/**
 * Tên hiển thị kênh bán vé.
 * Dùng chung cho tất cả game.
 */
export const TICKET_CHANNEL_LABELS: Record<TicketChannel, string> = {
  [TicketChannel.Pos]: "Điểm bán lẻ",
  [TicketChannel.Web]: "Website",
  [TicketChannel.Sdk]: "SDK",
} as const;

/**
 * Lấy label kênh bán vé.
 *
 * @param channel - TicketChannel value
 */
export function getTicketChannelLabel(channel: TicketChannel): string {
  return TICKET_CHANNEL_LABELS[channel] ?? channel;
}
