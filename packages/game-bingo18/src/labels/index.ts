/**
 * Bingo 18 – Display Labels
 *
 * Tên hiển thị cho các kiểu chơi, side bet, hạng giải, v.v. của Bingo 18.
 * Dùng trong tất cả UI components (analytics, live-feed, tickets, reports, ...).
 *
 * Import: `import { BINGO18_PLAY_TYPE_LABELS, ... } from "@megawin/game-bingo18/labels"`
 */

import { Bingo18PlayType, Bingo18BigSmallBet, Bingo18TripleKind } from "../entities/enums";

// ─────────────────────────────────────────────
// Play Type Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị cho mỗi kiểu chơi Bingo 18 (cơ bản + side bet).
 * Dùng trong analytics, live-feed, dropdown filter.
 */
export const BINGO18_PLAY_TYPE_LABELS: Record<Bingo18PlayType, string> = {
  [Bingo18PlayType.SingleNum]: "Số đơn",
  [Bingo18PlayType.DoubleMatch]: "Đôi",
  [Bingo18PlayType.TripleMatch]: "Ba số trùng",
  [Bingo18PlayType.SumTotal]: "Tổng điểm",
  [Bingo18PlayType.BigSmallDraw]: "Lớn/Hòa/Nhỏ",
} as const;

/**
 * Lấy tên hiển thị kiểu chơi Bingo 18.
 *
 * @param playType - Bingo18PlayType value
 */
export function getBingo18PlayTypeLabel(playType: Bingo18PlayType): string {
  return BINGO18_PLAY_TYPE_LABELS[playType] ?? playType;
}

// ─────────────────────────────────────────────
// Big/Small/Draw Bet Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị lựa chọn Lớn/Hòa/Nhỏ (side bet Bingo 18).
 *
 * Dựa vào tổng 3 số quay:
 * - Nhỏ: tổng 3-9
 * - Hòa: tổng 10-11
 * - Lớn: tổng 12-18
 */
export const BINGO18_BIG_SMALL_BET_LABELS: Record<Bingo18BigSmallBet, string> = {
  [Bingo18BigSmallBet.Big]: "Lớn",
  [Bingo18BigSmallBet.Draw]: "Hòa",
  [Bingo18BigSmallBet.Small]: "Nhỏ",
} as const;

/**
 * Lấy tên hiển thị lựa chọn Lớn/Hòa/Nhỏ.
 *
 * @param bet - Bingo18BigSmallBet value
 */
export function getBingo18BigSmallBetLabel(bet: Bingo18BigSmallBet): string {
  return BINGO18_BIG_SMALL_BET_LABELS[bet] ?? bet;
}

// ─────────────────────────────────────────────
// Triple Kind Labels
// ─────────────────────────────────────────────

/**
 * Tên hiển thị loại chơi ba số trùng.
 * `specific`: chọn đúng số (1.200.000đ). `any`: bất kỳ 3 số giống (200.000đ).
 */
export const BINGO18_TRIPLE_KIND_LABELS: Record<Bingo18TripleKind, string> = {
  [Bingo18TripleKind.Specific]: "Ba cụ thể",
  [Bingo18TripleKind.Any]: "Ba bất kỳ",
} as const;

/**
 * Lấy tên hiển thị loại ba số trùng.
 *
 * @param kind - Bingo18TripleKind value
 */
export function getBingo18TripleKindLabel(kind: Bingo18TripleKind): string {
  return BINGO18_TRIPLE_KIND_LABELS[kind] ?? kind;
}
