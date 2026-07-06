/**
 * API Player – Shared Zod Schemas
 *
 * Chỉ chứa schemas dùng chung cho nhiều handlers.
 * Schemas đặc thù cho 1 handler → inline trong handler file đó.
 */

import { z } from "zod";

import { Pagination, OBJECT_ID_REGEX } from "@megawin/shared/constants";
import { alphaLabelSequence } from "@megawin/shared/utils";

// ─── Primitives ───

export const objectIdSchema = z.string().regex(OBJECT_ID_REGEX, "Invalid ID format");

// ─── Reusable field schemas (compose vào handler-specific schemas) ───

export const sizeSchema = z
  .string()
  .default(String(Pagination.Default.Size))
  .transform((v) =>
    Math.min(Pagination.Max.Size, Math.max(1, parseInt(v, 10) || Pagination.Default.Size)),
  );

// ─── Composed shared schemas ───

export const cursorQuerySchema = z.object({
  size: sizeSchema,
  cursor: objectIdSchema.optional(),
});

export const lineIndexCursorSchema = z
  .string()
  .transform((v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  })
  .optional();

export const lineCursorQuerySchema = z.object({
  size: sizeSchema,
  cursor: lineIndexCursorSchema,
});

// ─── Board order validation ───

/**
 * Tạo predicate validate boards[] phải là prefix liên tục từ đầu mảng validBoardNos.
 *
 * Rule: boards[i].boardNo === validBoardNos[i] với mọi i.
 * Điều này đảm bảo: bắt đầu từ phần tử đầu tiên, liên tục, đúng thứ tự, không skip.
 * Ví dụ validBoardNos = ["A","B","C","D","E","F"]:
 *   [A]       ✅  [A,B]     ✅  [A,B,C,D,E,F] ✅
 *   [B]       ❌  [A,C]     ❌  [B,C]         ❌
 *
 * Thay thế refine no-dup riêng lẻ vì prefix liên tục đã imply no-dup.
 *
 * @param validBoardNos Mảng boardNo hợp lệ theo thứ tự chuẩn của từng game.
 */
export function boardsOrderRefine(
  validBoardNos: readonly string[],
): (boards: Array<{ boardNo: string }>) => boolean {
  return (boards) => boards.every((board, i) => board.boardNo === validBoardNos[i]);
}

/**
 * Biến thể động của {@link boardsOrderRefine} — KHÔNG cần danh sách boardNo cố định.
 *
 * Tự sinh sequence chữ cái theo độ dài boards (A, B, C... AA...) rồi ép
 * `boards[i].boardNo === sequence[i]`. Dùng cho game cho phép số board động theo
 * config (không giới hạn A-F). Prefix liên tục từ "A" -> implies không skip, không trùng.
 *
 * Ví dụ: [A] ✅  [A,B] ✅  [A,B,C,D,E,F,G] ✅  [B] ❌  [A,C] ❌
 */
export function boardsSequentialRefine(): (boards: Array<{ boardNo: string }>) => boolean {
  return (boards) => {
    const expected = alphaLabelSequence(boards.length);
    return boards.every((board, i) => board.boardNo === expected[i]);
  };
}
