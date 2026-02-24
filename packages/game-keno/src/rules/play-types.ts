/**
 * Keno – Play Type Validation
 *
 * Validate lựa chọn số theo play type.
 */

import { KenoPlayType, KENO_BASIC_PLAY_TYPES } from "../entities/enums";
import { KENO_NUMBER_MIN, KENO_NUMBER_MAX } from "../entities/types";
import { getPickCountFromPlayType } from "./prize-tables";

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate lựa chọn số cho board cơ bản.
 *
 * @param playType - Kiểu chơi (pick1-pick10)
 * @param numbers - Danh sách số đã chọn
 * @returns Kết quả validate
 */
export function validateBasicSelection(
  playType: KenoPlayType,
  numbers: number[],
): ValidationResult {
  const errors: string[] = [];

  if (!KENO_BASIC_PLAY_TYPES.includes(playType)) {
    errors.push(`Play type "${playType}" không phải cách chơi cơ bản`);
    return { valid: false, errors };
  }

  const pickCount = getPickCountFromPlayType(playType);
  if (pickCount === null) {
    errors.push(`Không xác định được pick count từ play type "${playType}"`);
    return { valid: false, errors };
  }

  if (numbers.length !== pickCount) {
    errors.push(`Cần chọn đúng ${pickCount} số, hiện có ${numbers.length} số`);
  }

  for (const n of numbers) {
    if (!Number.isInteger(n) || n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX) {
      errors.push(`Số ${n} ngoài phạm vi ${KENO_NUMBER_MIN}-${KENO_NUMBER_MAX}`);
    }
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push("Các số không được trùng nhau");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Xác định play type từ số lượng số đã chọn.
 *
 * @param count - Số lượng số đã chọn (1-10)
 * @returns KenoPlayType tương ứng hoặc null
 */
export function getPlayTypeFromPickCount(count: number): KenoPlayType | null {
  if (count < 1 || count > 10) return null;
  return `pick${count}` as KenoPlayType;
}
