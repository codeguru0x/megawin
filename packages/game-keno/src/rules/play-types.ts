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

/**
 * Xác định play type từ số lượng số đã chọn.
 */
export function getPlayTypeFromPickCount(count: number): KenoPlayType | null {
  if (count < 1 || count > 10) {
    return null;
  }

  return `pick${count}` as KenoPlayType;
}
