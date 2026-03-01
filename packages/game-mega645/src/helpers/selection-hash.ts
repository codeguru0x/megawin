/**
 * Mega 6/45 – Selection Hash
 */

import { createHash } from "node:crypto";
import type { Board } from "../entities/ticket";

function canonicalizeBoard(board: {
  boardNo: string;
  playType: string;
  mainNumbers: number[];
}): string {
  const main = [...board.mainNumbers].sort((a, b) => a - b).join(",");
  return `${board.boardNo}:${board.playType}:M[${main}]`;
}

export function canonicalizeSelection(boards: Board[]): string {
  const active = boards
    .filter((b) => !b.isVoid)
    .sort((a, b) => a.boardNo.localeCompare(b.boardNo));

  return active
    .map((b) =>
      canonicalizeBoard({
        boardNo: b.boardNo,
        playType: b.playType,
        mainNumbers: b.selection.mainNumbers,
      })
    )
    .join("|");
}

export function computeSelectionHash(boards: Board[]): string {
  const canonical = canonicalizeSelection(boards);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
