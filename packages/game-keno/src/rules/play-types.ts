/**
 * Keno – Play Type Validation
 *
 * Validate lựa chọn số theo play type.
 * Số đầu vào dạng string "01"-"80" (zero-padded).
 *
 * Phân tách khỏi `prize-tables.ts` để tách biệt concern:
 *   - play-types.ts: logic chọn số / xác định play type từ input
 *   - prize-tables.ts: tra cứu giải thưởng sau khi đã có kết quả
 */

import type { KenoBasicPlayType } from "../entities/enums";

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

/**
 * Xác định play type từ số lượng số đã chọn.
 *
 * Precondition: count ∈ [1, 10]. Tất cả caller đều đã validate trước khi gọi
 * (Zod schema cho place-bet, DB aggregate cho settle, loop range cho odds).
 *
 * String literal "pick" là nguồn duy nhất trong toàn bộ codebase.
 * Tất cả chỗ cần build pickN playType PHẢI gọi hàm này, không được tự ghép string.
 */
export function getPlayTypeFromPickCount(count: number): KenoBasicPlayType {
  return `pick${count}` as KenoBasicPlayType;
}
