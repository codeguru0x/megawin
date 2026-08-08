/**
 * Keno – Display Labels
 *
 * Tên hiển thị tiếng Việt cho các kiểu chơi và lựa chọn side bet của Keno.
 * Dùng trong tất cả UI components: analytics, live-feed, tickets, reports...
 *
 * Tách riêng khỏi entity layer để:
 * 1. Frontend bundle không cần import toàn bộ entity
 * 2. Labels thay đổi (ví dụ i18n) không ảnh hưởng business logic
 *
 * Import: `import { KENO_PLAY_TYPE_LABELS, ... } from "@megawin/game-keno/labels"`
 */

import { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cho mỗi kiểu chơi Keno.
 *
 * Bao gồm cả cách chơi cơ bản (pick1-pick10) và side bet (bigSmall, evenOdd).
 * Dùng trong analytics, live-feed, dropdown filter, báo cáo.
 *
 * @example KENO_PLAY_TYPE_LABELS["pick5"] // "Pick 5"
 * @example KENO_PLAY_TYPE_LABELS["bigSmall"] // "Lớn/Nhỏ"
 */
export const KENO_PLAY_TYPE_LABELS: Record<KenoPlayType, string> = {
  [KenoPlayType.Pick1]: "Pick 1",
  [KenoPlayType.Pick2]: "Pick 2",
  [KenoPlayType.Pick3]: "Pick 3",
  [KenoPlayType.Pick4]: "Pick 4",
  [KenoPlayType.Pick5]: "Pick 5",
  [KenoPlayType.Pick6]: "Pick 6",
  [KenoPlayType.Pick7]: "Pick 7",
  [KenoPlayType.Pick8]: "Pick 8",
  [KenoPlayType.Pick9]: "Pick 9",
  [KenoPlayType.Pick10]: "Pick 10",
  [KenoPlayType.BigSmall]: "Lớn/Nhỏ",
  [KenoPlayType.EvenOdd]: "Chẵn/Lẻ",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Keno. Fallback về giá trị raw nếu không tìm thấy.
 *
 * @param playType - KenoPlayType value
 */
export function getKenoPlayTypeLabel(playType: KenoPlayType): string {
  return KENO_PLAY_TYPE_LABELS[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Big/Small Bet Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cho lựa chọn Lớn/Nhỏ.
 *
 * @example KENO_BIG_SMALL_BET_LABELS["big"] // "Lớn"
 * @example KENO_BIG_SMALL_BET_LABELS["bigSmallDraw"] // "Hoà Lớn Nhỏ"
 */
export const KENO_BIG_SMALL_BET_LABELS: Record<KenoBigSmallBet, string> = {
  [KenoBigSmallBet.Big]: "Lớn",
  [KenoBigSmallBet.BigSmallDraw]: "Hoà Lớn Nhỏ",
  [KenoBigSmallBet.Small]: "Nhỏ",
} as const;

/**
 * Lấy tên hiển thị lựa chọn Lớn/Nhỏ. Fallback về giá trị raw nếu không tìm thấy.
 *
 * @param bet - KenoBigSmallBet value
 */
export function getKenoBigSmallBetLabel(bet: KenoBigSmallBet): string {
  return KENO_BIG_SMALL_BET_LABELS[bet] ?? bet;
}

// ─────────────────────────────────────────────
// Even/Odd Bet Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cho lựa chọn Chẵn/Lẻ.
 *
 * @example KENO_EVEN_ODD_BET_LABELS["even"] // "Chẵn"
 * @example KENO_EVEN_ODD_BET_LABELS["even1112"] // "Chẵn 11-12"
 * @example KENO_EVEN_ODD_BET_LABELS["evenOddDraw"] // "Hoà Chẵn Lẻ"
 */
export const KENO_EVEN_ODD_BET_LABELS: Record<KenoEvenOddBet, string> = {
  [KenoEvenOddBet.Even]: "Chẵn",
  [KenoEvenOddBet.Even1112]: "Chẵn 11-12",
  [KenoEvenOddBet.EvenOddDraw]: "Hoà Chẵn Lẻ",
  [KenoEvenOddBet.Odd1112]: "Lẻ 11-12",
  [KenoEvenOddBet.Odd]: "Lẻ",
} as const;

/**
 * Lấy tên hiển thị lựa chọn Chẵn/Lẻ. Fallback về giá trị raw nếu không tìm thấy.
 *
 * @param bet - KenoEvenOddBet value
 */
export function getKenoEvenOddBetLabel(bet: KenoEvenOddBet): string {
  return KENO_EVEN_ODD_BET_LABELS[bet] ?? bet;
}
