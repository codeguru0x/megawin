/**
 * Bingo 18 – Play Type Validation
 *
 * Validate lựa chọn theo play type.
 */

import { Bingo18PlayType, BINGO18_BASIC_PLAY_TYPES, Bingo18TripleKind } from "../entities/enums";
import { BINGO18_VALID_NUMBERS, BINGO18_VALID_SUMS } from "../entities/types";

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate lựa chọn cho board cơ bản "Một số".
 */
export function validateSingleNumSelection(number: number): ValidationResult {
  const errors: string[] = [];
  if (!BINGO18_VALID_NUMBERS.has(number)) {
    errors.push(`Số ${number} không hợp lệ. Phải từ 1 đến 6.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate lựa chọn cho board cơ bản "Hai số trùng nhau".
 */
export function validateDoubleMatchSelection(number: number): ValidationResult {
  const errors: string[] = [];
  if (!BINGO18_VALID_NUMBERS.has(number)) {
    errors.push(`Số ${number} không hợp lệ. Phải từ 1 đến 6.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate lựa chọn cho board cơ bản "Ba số trùng nhau".
 */
export function validateTripleMatchSelection(kind: string, number?: number): ValidationResult {
  const errors: string[] = [];

  if (kind !== Bingo18TripleKind.Specific && kind !== Bingo18TripleKind.Any) {
    errors.push(`Kind "${kind}" không hợp lệ. Phải là "specific" hoặc "any".`);
  }

  if (kind === Bingo18TripleKind.Specific) {
    if (number === undefined) {
      errors.push("Cần chọn số cho ba số trùng nhau cụ thể.");
    } else if (!BINGO18_VALID_NUMBERS.has(number)) {
      errors.push(`Số ${number} không hợp lệ. Phải từ 1 đến 6.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate lựa chọn side bet "Cộng tổng".
 */
export function validateSumTotalSelection(sum: number): ValidationResult {
  const errors: string[] = [];
  if (!BINGO18_VALID_SUMS.has(sum)) {
    errors.push(`Tổng ${sum} không hợp lệ. Phải từ 3 đến 18.`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Đếm số line (cược) cho 1 board/side bet.
 * Bingo 18: mỗi lựa chọn = 1 line.
 */
export function calculateLineCount(_playType: Bingo18PlayType): number {
  return 1;
}
