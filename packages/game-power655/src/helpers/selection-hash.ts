/**
 * Power 6/55 – Selection Hash (Duplicate Ticket Detection)
 *
 * Sinh SHA-256 hash từ selection (boards) của ticket để phát hiện vé trùng lặp.
 *
 * Pipeline:  boards → canonicalize → SHA-256 → hex string
 *
 * Mục đích:
 * - Phát hiện duplicate ticket khi place-bet (cùng player, cùng draw, cùng selection).
 * - Hash lưu trong TicketDoc.selectionHash, query bằng unique index.
 *
 * Canonicalization đảm bảo 2 selection tương đương luôn cho cùng hash, bất kể:
 * - Thứ tự mainNumbers trong board (sort trước khi hash).
 * - Thứ tự boards (sort theo boardNo alphabetically).
 * - Boards đã void bị loại bỏ (chỉ hash active boards).
 *
 * Format canonical string cho mỗi board: "{boardNo}:{playType}:M[{sorted numbers}]"
 * Ví dụ: "A:standard:M[01,05,12,23,34,45]|B:bao8:M[01,05,12,23,34,45,50,55]"
 */

import { createHash } from "node:crypto";
import type { Board } from "../entities/ticket";

/**
 * Chuyển 1 board thành canonical string representation.
 *
 * Format: "{boardNo}:{playType}:M[{sorted main numbers, comma-separated}]"
 * Ví dụ: "A:standard:M[01,05,12,23,34,45]"
 *
 * Sort mainNumbers để đảm bảo cùng tập số → cùng string, bất kể thứ tự chọn.
 *
 * @param board - Object chứa boardNo, playType, mainNumbers
 * @returns Canonical string đại diện board
 */
function canonicalizeBoard(board: {
  boardNo: string;
  playType: string;
  mainNumbers: string[];
}): string {
  const main = [...board.mainNumbers].sort().join(",");
  return `${board.boardNo}:${board.playType}:M[${main}]`;
}

/**
 * Chuyển toàn bộ boards của ticket thành 1 canonical string.
 *
 * Quy trình:
 * 1. Lọc bỏ boards đã void (isVoid = true) — chỉ hash active boards.
 * 2. Sort theo boardNo (A < B < C < D < E) — đảm bảo thứ tự nhất quán.
 * 3. Canonicalize từng board rồi nối bằng "|".
 *
 * Kết quả ví dụ: "A:standard:M[01,05,12,23,34,45]|B:bao7:M[01,05,12,23,34,45,50]"
 *
 * @param boards - Mảng boards từ TicketDoc (tối đa 5 boards A-E)
 * @returns Canonical string đại diện toàn bộ selection
 */
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

/**
 * Tính SHA-256 hash cho selection của ticket — dùng để detect duplicate.
 *
 * Pipeline: canonicalizeSelection(boards) → SHA-256 → hex digest (64 ký tự).
 * Hash được lưu trong TicketDoc.selectionHash và đánh unique index
 * kết hợp với (playerId, drawId) để chặn vé trùng.
 *
 * @param boards - Mảng boards từ TicketDoc
 * @returns SHA-256 hex string (64 ký tự lowercase)
 */
export function computeSelectionHash(boards: Board[]): string {
  const canonical = canonicalizeSelection(boards);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
