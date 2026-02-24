/**
 * Keno – Play Type Validation
 *
 * Validate lựa chọn số theo play type.
 * Số đầu vào dạng string "01"-"80" (zero-padded).
 */

import { KenoPlayType, KENO_BASIC_PLAY_TYPES } from "../entities/enums";
import { KENO_VALID_NUMBERS } from "../entities/types";
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
 * @param numbers - Danh sách số dạng string ("01"-"80")
 */
export function validateBasicSelection(
  playType: KenoPlayType,
  numbers: string[],
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
    if (!KENO_VALID_NUMBERS.has(n)) {
      errors.push(`Số "${n}" không hợp lệ. Phải là chuỗi 2 ký tự "01"-"80".`);
    }
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push("Các số không được trùng nhau");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Xác định play type từ số lượng số đã chọn.
 */
export function getPlayTypeFromPickCount(count: number): KenoPlayType | null {
  if (count < 1 || count > 10) return null;
  return `pick${count}` as KenoPlayType;
}
