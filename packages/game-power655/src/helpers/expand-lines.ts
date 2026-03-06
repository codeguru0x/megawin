/**
 * Power 6/55 – Board Expansion (expand boards → lines)
 *
 * Standard/QuickPick: 1 board → 1 line (6 số)
 * Bao N: 1 board (N số) → C(N,6) lines
 */

import { PlayType } from "../entities/enums";
import type { MainTuple, LineValue, BoardSelection } from "../entities/types";
import { POWER655_MAIN_COUNT } from "../entities/types";
import type { Board } from "../entities/ticket";

function generateCombinations(numbers: string[], k: number): string[][] {
  const result: string[][] = [];
  const combo: string[] = [];

  function backtrack(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < numbers.length; i++) {
      combo.push(numbers[i]!);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

export function expandBoardToLines(
  playType: PlayType,
  selection: BoardSelection
): LineValue[] {
  const sorted = [...selection.mainNumbers].sort();

  if (playType === PlayType.Standard || playType === PlayType.QuickPick) {
    return [{ main: sorted.slice(0, POWER655_MAIN_COUNT) as unknown as MainTuple }];
  }

  // Bao: generate all C(N, 6) combinations
  const combos = generateCombinations(sorted, POWER655_MAIN_COUNT);
  return combos.map((combo) => ({
    main: combo as unknown as MainTuple,
  }));
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
