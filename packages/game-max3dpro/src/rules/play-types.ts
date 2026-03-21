/**
 * Max 3D Pro – Play Types & Validation
 *
 * Max 3D Pro có 4 boards (A-D), mỗi board tạo nhiều cặp 2 bộ ba số.
 *
 * - multiNumber: chọn 3-20 bộ ba số, hệ thống tạo P(n,2) = n×(n-1) ordered pairs
 *   (thứ tự quan trọng — Giải ĐB yêu cầu đúng thứ tự, phụ ĐB ngược thứ tự)
 * - multiDigit: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand
 *
 * Bảng số cặp cho multiNumber (n bộ ba → P(n,2) = n×(n-1) ordered pairs):
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
 * Tính P(n, 2) = n × (n-1) — số hoán vị chập 2 (ordered pairs).
 *
 * Max 3D Pro yêu cầu ordered pairs vì Giải ĐB = (first, second) khớp đúng thứ tự,
 * Giải phụ ĐB = (second, first) khớp ngược thứ tự → (A,B) và (B,A) là 2 cặp khác nhau.
 *
 * Ví dụ: 3 bộ ba ["096","389","683"] → P(3,2) = 6 ordered pairs:
 *   (096,389), (096,683), (389,096), (389,683), (683,096), (683,389)
 */
function permutations2(n: number): number {
  return n * (n - 1);
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
 * Công thức: Số hoán vị của n phần tử có lặp = n! / (n₁! × n₂! × ... × nₖ!)
 * Ví dụ: 3 chữ số [1,2,3] → 3! / (1! × 1! × 1!) = 6 hoán vị duy nhất.
 */
export function getPermutationCount(digits: number[]): number {
  const unique = new Set(digits).size;
  if (unique === 3) {
    return 6;
  }

  if (unique === 2) {
    return 3;
  }

  return 1;
}

/**
 * Tính số line (cặp hai bộ ba số) cho 1 board.
 *
 * - multiNumber: P(n, 2) = n×(n-1) ordered pairs
 *   (thứ tự quan trọng — Giải ĐB khớp đúng thứ tự, phụ ĐB ngược thứ tự)
 * - multiDigit: perms(front) × perms(back) cặp
 */
export function calculateLineCount(
  playMode: PlayMode,
  _playType: PlayType,
  selection: BoardSelection,
): number {
  if (playMode === PlayMode.MultiNumber) {
    return permutations2(selection.triplets.length);
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
 * - multiNumber: P(n,2) = n×(n-1) ordered pairs từ n bộ ba số
 *   Tạo tất cả cặp (i, j) với i ≠ j → mỗi cặp (A,B) và (B,A) là 2 entries khác nhau.
 *   Ví dụ: ["096","389","683"] → 6 ordered pairs:
 *     (096,389), (096,683), (389,096), (389,683), (683,096), (683,389)
 *
 * - multiDigit: tất cả hoán vị front × tất cả hoán vị back (Cartesian product, tự nhiên ordered)
 */
export function expandSelectionToPairs(
  playMode: PlayMode,
  selection: BoardSelection,
): TripletPair[] {
  if (playMode === PlayMode.MultiNumber) {
    const triplets = selection.triplets;
    const pairs: TripletPair[] = [];
    // i ≠ j → ordered pairs: (A,B) và (B,A) đều được tạo
    for (let i = 0; i < triplets.length; i++) {
      for (let j = 0; j < triplets.length; j++) {
        if (j === i) continue;
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

/**
 * Validate selection cho 1 board. Throw `Error` ngay khi gặp vi phạm.
 *
 * Các rule về triplet count / digit count đã được Zod validate ở handler.
 * Hàm này chỉ kiểm tra các constraint không thể express bằng Zod đơn giản
 * (ví dụ: triplet format, digit range).
 */
export function validateSelection(playMode: PlayMode, selection: BoardSelection): void {
  if (playMode === PlayMode.MultiNumber) {
    for (let i = 0; i < selection.triplets.length; i++) {
      const t = selection.triplets[i]!;
      if (!isValidTriplet(t)) {
        throw new Error(`Bộ ba số ${i + 1} không hợp lệ: ${t} (cần 3 chữ số 000-999)`);
      }
    }
  }

  if (playMode === PlayMode.MultiDigit) {
    const { frontDigits, backDigits } = selection;

    if (frontDigits) {
      for (const d of frontDigits) {
        if (!Number.isInteger(d) || d < 0 || d > 9) {
          throw new Error(`Chữ số đầu không hợp lệ: ${d} (cần 0-9)`);
        }
      }
    }

    if (backDigits) {
      for (const d of backDigits) {
        if (!Number.isInteger(d) || d < 0 || d > 9) {
          throw new Error(`Chữ số sau không hợp lệ: ${d} (cần 0-9)`);
        }
      }
    }
  }
}
