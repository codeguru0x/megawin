/**
 * Lotto 5/35 – Play Types (validation + line count)
 *
 * Định nghĩa quy tắc cho từng kiểu chơi:
 * - Bao nhiêu số chính / đặc biệt cần chọn
 * - Số lượng lines sinh ra
 * - Hàm validate selection
 *
 * Bảng tra cứu nhanh (từ ảnh vé Vietlott):
 * ┌──────────────┬────────────────────┬──────────────────────────────────────┐
 * │ Play Type    │ Selection          │ Lines                                │
 * ├──────────────┼────────────────────┼──────────────────────────────────────┤
 * │ standard     │ 5 chính + 1 ĐB    │ 1                                    │
 * │ mainCover4   │ 4 chính + 1 ĐB    │ 31 (HT ghép 31 số còn lại)          │
 * │ mainCover 6  │ 6 chính + 1 ĐB    │ C(6,5) = 6                           │
 * │ mainCover 7  │ 7 chính + 1 ĐB    │ C(7,5) = 21                          │
 * │ mainCover 8  │ 8 chính + 1 ĐB    │ C(8,5) = 56                          │
 * │ mainCover 9  │ 9 chính + 1 ĐB    │ C(9,5) = 126                         │
 * │ mainCover 10 │ 10 chính + 1 ĐB   │ C(10,5) = 252                        │
 * │ mainCover 11 │ 11 chính + 1 ĐB   │ C(11,5) = 462                        │
 * │ mainCover 12 │ 12 chính + 1 ĐB   │ C(12,5) = 792                        │
 * │ mainCover 13 │ 13 chính + 1 ĐB   │ C(13,5) = 1287                       │
 * │ mainCover 14 │ 14 chính + 1 ĐB   │ C(14,5) = 2002                       │
 * │ mainCover 15 │ 15 chính + 1 ĐB   │ C(15,5) = 3003                       │
 * │ specialCover │ 5 chính + K ĐB    │ K (2 ≤ K ≤ 12)                       │
 * │ quickPick    │ (máy chọn)        │ 1                                    │
 * └──────────────┴────────────────────┴──────────────────────────────────────┘
 */

import { PlayType } from "../entities/enums";
import {
  LOTTO535_MAIN_COUNT,
  VALID_MAIN_NUMBER_SET,
  VALID_SPECIAL_NUMBER_SET,
  type BoardSelection,
} from "../entities/types";

// ─────────────────────────────────────────────
// Combination helper
// ─────────────────────────────────────────────

/** Tính C(n, k) – tổ hợp chập k từ n. */
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;

  // Tối ưu: C(n,k) = C(n, n-k)
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ─────────────────────────────────────────────
// Line Count Calculation
// ─────────────────────────────────────────────

/**
 * Số lượng bao 4: chọn 4 số chính, hệ thống ghép 31 số còn lại.
 * 35 - 4 = 31 lines.
 */
const MAIN_COVER_4_LINES = 31;

/**
 * Tính số line sinh ra từ 1 board.
 *
 * @param playType - Kiểu chơi
 * @param selection - Lựa chọn số
 * @returns Số line con (bộ số) được tạo ra
 */
export function calculateLineCount(playType: PlayType, selection: BoardSelection): number {
  switch (playType) {
    case PlayType.Standard:
    case PlayType.QuickPick:
      return 1;

    case PlayType.MainCover4:
      return MAIN_COVER_4_LINES;

    case PlayType.MainCover:
      return combination(selection.mainNumbers.length, LOTTO535_MAIN_COUNT);

    case PlayType.SpecialCover:
      return selection.specialNumbers.length;

    default: {
      const _exhaustive: never = playType;
      throw new Error(`Unknown play type: ${_exhaustive}`);
    }
  }
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

/** Kết quả validate. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate lựa chọn số theo play type.
 *
 * @param playType - Kiểu chơi
 * @param selection - Lựa chọn số cần validate
 * @returns Kết quả validate
 */
export function validateSelection(playType: PlayType, selection: BoardSelection): ValidationResult {
  const errors: string[] = [];
  const { mainNumbers, specialNumbers } = selection;

  // QuickPick không cần validate selection (hệ thống tự sinh)
  if (playType === PlayType.QuickPick) {
    return { valid: true, errors };
  }

  // Validate main numbers — phải là string zero-padded thuộc tập hợp lệ
  for (const n of mainNumbers) {
    if (!VALID_MAIN_NUMBER_SET.has(n)) {
      errors.push(`Số chính "${n}" không hợp lệ (phải từ "01" đến "35")`);
    }
  }

  // Validate special numbers
  for (const n of specialNumbers) {
    if (!VALID_SPECIAL_NUMBER_SET.has(n)) {
      errors.push(`Số đặc biệt "${n}" không hợp lệ (phải từ "01" đến "12")`);
    }
  }

  // Validate uniqueness
  if (new Set(mainNumbers).size !== mainNumbers.length) {
    errors.push("Số chính không được trùng nhau");
  }
  if (new Set(specialNumbers).size !== specialNumbers.length) {
    errors.push("Số đặc biệt không được trùng nhau");
  }

  // Validate count theo play type
  switch (playType) {
    case PlayType.Standard:
      if (mainNumbers.length !== 5) {
        errors.push("Chơi thường: cần chọn đúng 5 số chính");
      }
      if (specialNumbers.length !== 1) {
        errors.push("Chơi thường: cần chọn đúng 1 số đặc biệt");
      }
      break;

    case PlayType.MainCover4:
      if (mainNumbers.length !== 4) {
        errors.push("Bao 4 số: cần chọn đúng 4 số chính");
      }
      if (specialNumbers.length !== 1) {
        errors.push("Bao 4 số: cần chọn đúng 1 số đặc biệt");
      }
      break;

    case PlayType.MainCover:
      if (mainNumbers.length < 6 || mainNumbers.length > 15) {
        errors.push("Bao số chính: cần chọn 6-15 số chính");
      }
      if (specialNumbers.length !== 1) {
        errors.push("Bao số chính: cần chọn đúng 1 số đặc biệt");
      }
      break;

    case PlayType.SpecialCover:
      if (mainNumbers.length !== 5) {
        errors.push("Bao số đặc biệt: cần chọn đúng 5 số chính");
      }
      if (specialNumbers.length < 2 || specialNumbers.length > 12) {
        errors.push("Bao số đặc biệt: cần chọn 2-12 số đặc biệt");
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}
