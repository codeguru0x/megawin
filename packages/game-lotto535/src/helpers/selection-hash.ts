/**
 * Lotto 5/35 – Selection Hash (Canonicalize & Hash)
 *
 * Dùng để:
 * - Tạo canonical form cho selection → so sánh 2 selection có giống nhau không
 * - Tạo hash → lưu vào ticket.expansion.selectionHash + entry.entrySummary.selectionHash
 * - Audit: verify entry snapshot đúng với ticket gốc
 *
 * Hash dùng SHA-256 native (Node.js crypto).
 * Nếu cần chạy trên browser, thay bằng SubtleCrypto.
 */

import { createHash } from "node:crypto";
import type { Lotto535Board } from "../entities/lotto535.ticket";

/**
 * Canonicalize 1 board: sort mainNumbers + specialNumbers.
 * Trả về chuỗi deterministic cho hashing.
 */
function canonicalizeBoard(board: {
  boardNo: string;
  playType: string;
  mainNumbers: number[];
  specialNumbers: number[];
}): string {
  const main = [...board.mainNumbers].sort((a, b) => a - b).join(",");
  const special = [...board.specialNumbers].sort((a, b) => a - b).join(",");

  return `${board.boardNo}:${board.playType}:M[${main}]:S[${special}]`;
}

/**
 * Canonicalize toàn bộ boards → chuỗi deterministic.
 * Boards được sort theo boardNo để đảm bảo consistent.
 *
 * @param boards - Danh sách boards từ ticket
 * @returns Chuỗi canonical cho hashing
 */
export function canonicalizeSelection(boards: Lotto535Board[]): string {
  const active = boards
    .filter((b) => !b.isVoid)
    .sort((a, b) => a.boardNo.localeCompare(b.boardNo));

  return active
    .map((b) =>
      canonicalizeBoard({
        boardNo: b.boardNo,
        playType: b.playType,
        mainNumbers: b.selection.mainNumbers,
        specialNumbers: b.selection.specialNumbers,
      }),
    )
    .join("|");
}

/**
 * Tính SHA-256 hash cho selection canonical string.
 *
 * @param boards - Danh sách boards
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```ts
 * const hash = computeSelectionHash(ticket.boards);
 * // → "a1b2c3d4..."
 * ```
 */
export function computeSelectionHash(boards: Lotto535Board[]): string {
  const canonical = canonicalizeSelection(boards);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
