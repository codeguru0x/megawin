/**
 * Mega 6/45 – Selection Hash
 *
 * Tạo hash SHA-256 đại diện cho lựa chọn số trên toàn bộ vé.
 * Dùng để detect vé trùng (duplicate ticket) và lưu dấu vân tay vé.
 *
 * Quy trình:
 *   boards → canonicalize từng board → nối chuỗi → SHA-256 → hex string
 *
 * Format canonical 1 board: "<boardNo>:<playType>:M[<n1>,<n2>,...]"
 * Ví dụ: "A:standard:M[01,07,12,23,34,45]"
 */

import { createHash } from "node:crypto";
import type { Board } from "../entities/ticket";

/**
 * Chuyển 1 board thành chuỗi canonical (chuẩn hoá).
 * mainNumbers được sort tăng dần để đảm bảo cùng bộ số → cùng canonical,
 * bất kể thứ tự người dùng chọn.
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
 * Tạo chuỗi canonical cho toàn bộ vé.
 * Chỉ xét boards chưa bị void (isVoid = false).
 * Boards được sort theo boardNo (A→F) để thứ tự không ảnh hưởng hash.
 * Các boards nối nhau bằng "|".
 *
 * @example
 * // Vé 2 boards: "A:standard:M[01,07,12,23,34,45]|B:standard:M[02,08,15,27,38,44]"
 */
export function canonicalizeSelection(boards: Board[]): string {
  const active = boards.filter((b) => !b.isVoid).sort((a, b) => a.boardNo.localeCompare(b.boardNo));

  return active
    .map((b) =>
      canonicalizeBoard({
        boardNo: b.boardNo,
        playType: b.playType,
        mainNumbers: b.selection.mainNumbers,
      }),
    )
    .join("|");
}

/**
 * Tính SHA-256 hash (hex) cho lựa chọn số của vé.
 * Hash này được lưu vào ticket.selectionHash để tra cứu vé trùng.
 *
 * Bất biến: cùng bộ boards (dù thứ tự khác nhau) → cùng hash.
 */
export function computeSelectionHash(boards: Board[]): string {
  const canonical = canonicalizeSelection(boards);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
