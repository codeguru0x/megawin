/**
 * Lotto 5/35 – Expand Boards to Lines
 *
 * Chuyển đổi boards (lựa chọn của user) thành danh sách lines (bộ số con).
 * Mỗi line = 5 số chính + 1 số đặc biệt.
 *
 * Dùng khi:
 * - Settle (tính thưởng): expand boards → lines → match từng line với kết quả
 * - Materialize lines vào DB (expansion mode "onWrite" / "onSettle")
 */

import { Lotto535PlayType } from "../entities/lotto535.enums";
import {
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_MIN,
  type Lotto535BoardSelection,
  type Lotto535LineValue,
  type Lotto535MainTuple,
} from "../entities/lotto535.types";
import type { Lotto535Board } from "../entities/lotto535.ticket";
import { combination } from "../rules/play-types";

// ─────────────────────────────────────────────
// Core: generate combinations
// ─────────────────────────────────────────────

/**
 * Generate tất cả tổ hợp chập k từ mảng arr.
 * Kết quả đã sorted (do input sorted).
 */
function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i]!, ...rest];
    }
  }
}

/** Sort + assert tuple 5 phần tử. */
function toMainTuple(nums: number[]): Lotto535MainTuple {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted as unknown as Lotto535MainTuple;
}

// ─────────────────────────────────────────────
// Expand functions per play type
// ─────────────────────────────────────────────

/** Standard / QuickPick: 5 chính + 1 đặc biệt = 1 line. */
function expandStandard(sel: Lotto535BoardSelection): Lotto535LineValue[] {
  return [
    {
      main: toMainTuple(sel.mainNumbers),
      special: sel.specialNumbers[0]!,
    },
  ];
}

/**
 * MainCover4: chọn 4 số chính + 1 đặc biệt.
 * Hệ thống ghép lần lượt 31 số còn lại (35 - 4 = 31) thành 31 lines.
 */
function expandMainCover4(sel: Lotto535BoardSelection): Lotto535LineValue[] {
  const chosen = new Set(sel.mainNumbers);
  const special = sel.specialNumbers[0]!;
  const lines: Lotto535LineValue[] = [];

  for (let n = LOTTO535_MAIN_MIN; n <= LOTTO535_MAIN_MAX; n++) {
    if (chosen.has(n)) continue;
    const mainNums = [...sel.mainNumbers, n];
    lines.push({ main: toMainTuple(mainNums), special });
  }

  return lines;
}

/**
 * MainCover (6-15): chọn N số chính + 1 đặc biệt.
 * Expand thành C(N,5) lines.
 */
function expandMainCover(sel: Lotto535BoardSelection): Lotto535LineValue[] {
  const special = sel.specialNumbers[0]!;
  const sorted = [...sel.mainNumbers].sort((a, b) => a - b);
  const lines: Lotto535LineValue[] = [];

  for (const combo of combinations(sorted, 5)) {
    lines.push({ main: combo as unknown as Lotto535MainTuple, special });
  }

  return lines;
}

/**
 * SpecialCover: 5 số chính + K số đặc biệt (2-12).
 * Expand thành K lines (1 line per special number).
 */
function expandSpecialCover(
  sel: Lotto535BoardSelection,
): Lotto535LineValue[] {
  const main = toMainTuple(sel.mainNumbers);

  return sel.specialNumbers.map((special) => ({ main, special }));
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Expand 1 board thành danh sách lines.
 *
 * @param playType - Kiểu chơi
 * @param selection - Lựa chọn số
 * @returns Danh sách lines (mỗi line = 5 chính + 1 đặc biệt)
 */
export function expandBoardToLines(
  playType: Lotto535PlayType,
  selection: Lotto535BoardSelection,
): Lotto535LineValue[] {
  switch (playType) {
    case Lotto535PlayType.Standard:
    case Lotto535PlayType.QuickPick:
      return expandStandard(selection);

    case Lotto535PlayType.MainCover4:
      return expandMainCover4(selection);

    case Lotto535PlayType.MainCover:
      return expandMainCover(selection);

    case Lotto535PlayType.SpecialCover:
      return expandSpecialCover(selection);

    default: {
      const _exhaustive: never = playType;
      throw new Error(`Unknown play type: ${_exhaustive}`);
    }
  }
}

/**
 * Expand tất cả boards trên ticket thành flat list lines.
 * Kết quả bao gồm boardNo + lineIndex để truy vết.
 *
 * @param boards - Danh sách boards từ ticket
 * @returns Danh sách lines kèm metadata
 */
export function expandAllBoards(
  boards: Lotto535Board[],
): Array<Lotto535LineValue & { boardNo: string; lineIndex: number }> {
  const result: Array<
    Lotto535LineValue & { boardNo: string; lineIndex: number }
  > = [];

  let globalIndex = 0;

  for (const board of boards) {
    if (board.isVoid) continue;

    const lines = expandBoardToLines(board.playType, board.selection);
    for (const line of lines) {
      result.push({
        ...line,
        boardNo: board.boardNo,
        lineIndex: globalIndex++,
      });
    }
  }

  return result;
}
