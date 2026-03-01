/**
 * Mega 6/45 – Expand Boards to Lines
 *
 * Chuyển đổi boards thành danh sách lines (bộ 6 số).
 *
 * Bao 5 đặc biệt: chọn 5 số, hệ thống ghép lần lượt 40 số còn lại.
 * Bao 7-18: tạo tất cả tổ hợp C(N,6) lines.
 */

import { PlayType } from "../entities/enums";
import {
  MEGA645_MAIN_MAX,
  MEGA645_MAIN_MIN,
  MEGA645_MAIN_COUNT,
  type BoardSelection,
  type LineValue,
  type MainTuple,
} from "../entities/types";
import type { Board } from "../entities/ticket";

// ─────────────────────────────────────────────
// Core: generate combinations
// ─────────────────────────────────────────────

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

function toMainTuple(nums: number[]): MainTuple {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted as unknown as MainTuple;
}

// ─────────────────────────────────────────────
// Expand functions per play type
// ─────────────────────────────────────────────

/** Standard / QuickPick: 6 số = 1 line. */
function expandStandard(sel: BoardSelection): LineValue[] {
  return [{ main: toMainTuple(sel.mainNumbers) }];
}

/**
 * Bao 5: chọn 5 số, hệ thống ghép lần lượt 40 số còn lại → 40 lines.
 * Mỗi line = 5 số đã chọn + 1 số bổ sung.
 */
function expandBao5(sel: BoardSelection): LineValue[] {
  const chosen = new Set(sel.mainNumbers);
  const lines: LineValue[] = [];

  for (let n = MEGA645_MAIN_MIN; n <= MEGA645_MAIN_MAX; n++) {
    if (chosen.has(n)) continue;
    const mainNums = [...sel.mainNumbers, n];
    lines.push({ main: toMainTuple(mainNums) });
  }

  return lines;
}

/**
 * Bao 7-18: chọn N số, expand thành C(N,6) lines.
 */
function expandBaoN(sel: BoardSelection): LineValue[] {
  const sorted = [...sel.mainNumbers].sort((a, b) => a - b);
  const lines: LineValue[] = [];

  for (const combo of combinations(sorted, MEGA645_MAIN_COUNT)) {
    lines.push({ main: combo as unknown as MainTuple });
  }

  return lines;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export function expandBoardToLines(
  playType: PlayType,
  selection: BoardSelection
): LineValue[] {
  switch (playType) {
    case PlayType.Standard:
    case PlayType.QuickPick:
      return expandStandard(selection);

    case PlayType.Bao5:
      return expandBao5(selection);

    case PlayType.Bao7:
    case PlayType.Bao8:
    case PlayType.Bao9:
    case PlayType.Bao10:
    case PlayType.Bao11:
    case PlayType.Bao12:
    case PlayType.Bao13:
    case PlayType.Bao14:
    case PlayType.Bao15:
    case PlayType.Bao18:
      return expandBaoN(selection);

    default: {
      const _exhaustive: never = playType;
      throw new Error(`Unknown play type: ${_exhaustive}`);
    }
  }
}

export function expandAllBoards(
  boards: Board[]
): Array<LineValue & { boardNo: string; lineIndex: number }> {
  const result: Array<LineValue & { boardNo: string; lineIndex: number }> = [];
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
