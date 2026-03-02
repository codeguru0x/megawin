/**
 * Max 3D – Selection Hash
 */

import { createHash } from "node:crypto";
import type { Board } from "../entities/ticket";

function canonicalizeBoard(board: {
  boardNo: string;
  playMode: string;
  playType: string;
  triplets: string[];
}): string {
  const triplets = [...board.triplets].sort().join(",");
  return `${board.boardNo}:${board.playMode}:${board.playType}:T[${triplets}]`;
}

export function canonicalizeSelection(boards: Board[]): string {
  const active = boards
    .filter((b) => !b.isVoid)
    .sort((a, b) => a.boardNo.localeCompare(b.boardNo));

  return active
    .map((b) =>
      canonicalizeBoard({
        boardNo: b.boardNo,
        playMode: b.playMode,
        playType: b.playType,
        triplets: b.selection.triplets,
      })
    )
    .join("|");
}

export function computeSelectionHash(boards: Board[]): string {
  const canonical = canonicalizeSelection(boards);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
