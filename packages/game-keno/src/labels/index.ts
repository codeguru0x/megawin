/**
 * Keno – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, side bet của Keno.
 * Dùng trong tất cả UI components (analytics, live-feed, tickets, reports, ...).
 *
 * Import: `import { KENO_PLAY_TYPE_LABELS, ... } from "@megawin/game-keno/labels"`
 */

import { KenoPlayType, KenoBigSmallBet, KenoEvenOddBet } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cho mỗi kiểu chơi Keno (cơ bản + side bet).
 * Dùng trong analytics, live-feed, dropdown filter.
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
 * Lấy tên hiển thị kiểu chơi Keno.
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
 * Tên hiển thị lựa chọn cách chơi bổ sung Lớn/Nhỏ.
 */
export const KENO_BIG_SMALL_BET_LABELS: Record<KenoBigSmallBet, string> = {
  [KenoBigSmallBet.Big]: "Lớn",
  [KenoBigSmallBet.BigSmallDraw]: "Hoà Lớn Nhỏ",
  [KenoBigSmallBet.Small]: "Nhỏ",
} as const;

/**
 * Lấy tên hiển thị lựa chọn Lớn/Nhỏ.
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
 * Tên hiển thị lựa chọn cách chơi bổ sung Chẵn/Lẻ.
 */
export const KENO_EVEN_ODD_BET_LABELS: Record<KenoEvenOddBet, string> = {
  [KenoEvenOddBet.Even]: "Chẵn",
  [KenoEvenOddBet.Even1112]: "Chẵn 11-12",
  [KenoEvenOddBet.EvenOddDraw]: "Hoà Chẵn Lẻ",
  [KenoEvenOddBet.Odd1112]: "Lẻ 11-12",
  [KenoEvenOddBet.Odd]: "Lẻ",
} as const;

/**
 * Lấy tên hiển thị lựa chọn Chẵn/Lẻ.
 *
 * @param bet - KenoEvenOddBet value
 */
export function getKenoEvenOddBetLabel(bet: KenoEvenOddBet): string {
  return KENO_EVEN_ODD_BET_LABELS[bet] ?? bet;
}
