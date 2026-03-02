/**
 * Max 3D Pro – Play Types & Validation
 *
 * Max 3D Pro có 4 boards (A-D), mỗi board tạo nhiều cặp 2 bộ ba số.
 *
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo C(n,2) cặp
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand
 *
 * Bảng số cặp cho multiNumber (n bộ ba → C(n,2) cặp):
 *   3→6, 4→12, 5→20, 6→30, 7→42, 8→56, 9→72, 10→90,
 *   11→110, 12→132, 13→156, 14→182, 15→210, 16→240,
 *   17→272, 18→306, 19→342, 20→380
 *
 * Bảng số cặp cho multiDigit (tuỳ loại chữ số):
 * ┌──────────────────────┬──────────────────────┬────────┬───────────┐
 * │ Bộ ba số đầu         │ Bộ ba số sau         │ Số cặp │ Giá (VND) │
 * ├──────────────────────┼──────────────────────┼────────┼───────────┤
 * │ 3 số khác nhau (123) │ 3 số khác nhau (123) │ 36     │ 360,000   │
 * │ 3 số khác nhau (123) │ 2 số giống nhau (112)│ 18     │ 180,000   │
 * │ 2 số giống nhau (112)│ 3 số khác nhau (123) │ 18     │ 180,000   │
 * │ 2 số giống nhau (112)│ 2 số giống nhau (112)│ 09     │ 90,000    │
 * │ 3 số giống nhau (111)│ 3 số khác nhau (123) │ 06     │ 60,000    │
 * │ 3 số khác nhau (123) │ 3 số giống nhau (111)│ 06     │ 60,000    │
 * │ 3 số giống nhau (111)│ 2 số giống nhau (112)│ 03     │ 30,000    │
 * │ 2 số giống nhau (112)│ 3 số giống nhau (111)│ 03     │ 30,000    │
 * └──────────────────────┴──────────────────────┴────────┴───────────┘
 */

import { PlayMode, PlayType } from "../entities/enums";
import type { BoardSelection, Triplet, TripletPair } from "../entities/types";

export const VALID_BOARD_NOS = ["A", "B", "C", "D"] as const;

/**
 * Tính C(n, 2) = n * (n-1) / 2.
 */
function combinations2(n: number): number {
  return (n * (n - 1)) / 2;
}

/**
 * Tạo tất cả hoán vị duy nhất của 3 chữ số → bộ ba số.
 */
export function getUniquePermutations(digits: number[]): Triplet[] {
  const perms = new Set<string>();
  for (let i = 0; i < digits.length; i++) {
    for (let j = 0; j < digits.length; j++) {
      if (j === i) continue;
      for (let k = 0; k < digits.length; k++) {
        if (k === i || k === j) continue;
        perms.add(`${digits[i]}${digits[j]}${digits[k]}`);
      }
    }
  }
  return Array.from(perms);
}

/**
 * Đếm số hoán vị duy nhất của 3 chữ số.
 * - 3 khác nhau → 6
 * - 2 giống nhau → 3
 * - 3 giống nhau → 1
 */
export function getPermutationCount(digits: number[]): number {
  const unique = new Set(digits).size;
  if (unique === 3) return 6;
  if (unique === 2) return 3;
  return 1;
}

/**
 * Tính số line (cặp hai bộ ba số) cho 1 board.
 *
 * - multiNumber: C(n, 2) cặp
 * - multiDigit: perms(front) × perms(back) cặp
 */
export function calculateLineCount(
  playMode: PlayMode,
  _playType: PlayType,
  selection: BoardSelection
): number {
  if (playMode === PlayMode.MultiNumber) {
    return combinations2(selection.triplets.length);
  }

  if (playMode === PlayMode.MultiDigit) {
    const frontDigits = selection.frontDigits ?? [];
    const backDigits = selection.backDigits ?? [];
    if (frontDigits.length !== 3 || backDigits.length !== 3) return 0;
    const frontPerms = getPermutationCount(frontDigits);
    const backPerms = getPermutationCount(backDigits);
    return frontPerms * backPerms;
  }

  return 1;
}

/**
 * Expand board selection thành danh sách cặp (pairs).
 *
 * - multiNumber: C(n,2) cặp từ n bộ ba số
 * - multiDigit: tất cả hoán vị front × tất cả hoán vị back
 */
export function expandSelectionToPairs(
  playMode: PlayMode,
  selection: BoardSelection
): TripletPair[] {
  if (playMode === PlayMode.MultiNumber) {
    const triplets = selection.triplets;
    const pairs: TripletPair[] = [];
    for (let i = 0; i < triplets.length; i++) {
      for (let j = i + 1; j < triplets.length; j++) {
        pairs.push({ first: triplets[i]!, second: triplets[j]! });
      }
    }
    return pairs;
  }

  if (playMode === PlayMode.MultiDigit) {
    const frontDigits = selection.frontDigits ?? [];
    const backDigits = selection.backDigits ?? [];
    const frontPerms = getUniquePermutations(frontDigits);
    const backPerms = getUniquePermutations(backDigits);
    const pairs: TripletPair[] = [];
    for (const front of frontPerms) {
      for (const back of backPerms) {
        pairs.push({ first: front, second: back });
      }
    }
    return pairs;
  }

  return [];
}

/**
 * Validate bộ ba số.
 */
function isValidTriplet(t: Triplet): boolean {
  return /^\d{3}$/.test(t);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate selection cho 1 board.
 */
export function validateSelection(
  playMode: PlayMode,
  playType: PlayType,
  selection: BoardSelection
): ValidationResult {
  const errors: string[] = [];

  if (playMode === PlayMode.MultiNumber) {
    if (!selection.triplets || !Array.isArray(selection.triplets)) {
      errors.push("Thiếu danh sách bộ ba số");
      return { valid: false, errors };
    }

    if (selection.triplets.length < 3) {
      errors.push("Cần chọn ít nhất 3 bộ ba số");
    }

    if (selection.triplets.length > 20) {
      errors.push("Tối đa 20 bộ ba số");
    }

    for (let i = 0; i < selection.triplets.length; i++) {
      const t = selection.triplets[i]!;
      if (!isValidTriplet(t)) {
        errors.push(
          `Bộ ba số ${i + 1} không hợp lệ: ${t} (cần 3 chữ số 000-999)`
        );
      }
    }
  }

  if (playMode === PlayMode.MultiDigit) {
    const frontDigits = selection.frontDigits;
    const backDigits = selection.backDigits;

    if (
      !frontDigits ||
      !Array.isArray(frontDigits) ||
      frontDigits.length !== 3
    ) {
      errors.push("Cần chọn đúng 3 chữ số đầu");
    } else {
      for (const d of frontDigits) {
        if (!Number.isInteger(d) || d < 0 || d > 9) {
          errors.push(`Chữ số đầu không hợp lệ: ${d} (cần 0-9)`);
        }
      }
    }

    if (!backDigits || !Array.isArray(backDigits) || backDigits.length !== 3) {
      errors.push("Cần chọn đúng 3 chữ số sau");
    } else {
      for (const d of backDigits) {
        if (!Number.isInteger(d) || d < 0 || d > 9) {
          errors.push(`Chữ số sau không hợp lệ: ${d} (cần 0-9)`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
