/**
 * Mega 6/45 – Play Types (validation + line count)
 *
 * Mega 6/45 chỉ có số chính (1-45), KHÔNG có số đặc biệt.
 *
 * ┌──────────────┬────────────────────┬──────────────────────┐
 * │ Play Type    │ Selection          │ Lines                │
 * ├──────────────┼────────────────────┼──────────────────────┤
 * │ standard     │ 6 số               │ 1                    │
 * │ bao5         │ 5 số (HT bổ sung)  │ 40 (45-5=40)         │
 * │ bao7         │ 7 số               │ C(7,6) = 7           │
 * │ bao8         │ 8 số               │ C(8,6) = 28          │
 * │ bao9         │ 9 số               │ C(9,6) = 84          │
 * │ bao10        │ 10 số              │ C(10,6) = 210        │
 * │ bao11        │ 11 số              │ C(11,6) = 462        │
 * │ bao12        │ 12 số              │ C(12,6) = 924        │
 * │ bao13        │ 13 số              │ C(13,6) = 1,716      │
 * │ bao14        │ 14 số              │ C(14,6) = 3,003      │
 * │ bao15        │ 15 số              │ C(15,6) = 5,005      │
 * │ bao18        │ 18 số              │ C(18,6) = 18,564     │
 * └──────────────┴────────────────────┴──────────────────────┘
 */

import { PlayType } from "../entities/enums";
import { VALID_NUMBER_SET, type BoardSelection } from "../entities/types";

// ─────────────────────────────────────────────
// Combination helper
// ─────────────────────────────────────────────

export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ─────────────────────────────────────────────
// Play Type Config
// ─────────────────────────────────────────────

export interface PlayTypeConfig {
  label: string;
  /** Số lượng số cần chọn. */
  numberCount: number;
  /** Số line sinh ra (0 = tính từ selection). */
  fixedLineCount: number;
}

/**
 * Cấu hình cho mỗi loại bao.
 * Bao 5 đặc biệt: chọn 5 số, HT ghép 40 số còn lại → 40 lines.
 */
export const PLAY_TYPE_CONFIGS: Record<PlayType, PlayTypeConfig> = {
  [PlayType.Standard]: { label: "Vé thường", numberCount: 6, fixedLineCount: 1 },
  [PlayType.Bao5]: { label: "Bao 5", numberCount: 5, fixedLineCount: 40 },
  [PlayType.Bao7]: { label: "Bao 7", numberCount: 7, fixedLineCount: 7 },
  [PlayType.Bao8]: { label: "Bao 8", numberCount: 8, fixedLineCount: 28 },
  [PlayType.Bao9]: { label: "Bao 9", numberCount: 9, fixedLineCount: 84 },
  [PlayType.Bao10]: { label: "Bao 10", numberCount: 10, fixedLineCount: 210 },
  [PlayType.Bao11]: { label: "Bao 11", numberCount: 11, fixedLineCount: 462 },
  [PlayType.Bao12]: { label: "Bao 12", numberCount: 12, fixedLineCount: 924 },
  [PlayType.Bao13]: { label: "Bao 13", numberCount: 13, fixedLineCount: 1716 },
  [PlayType.Bao14]: { label: "Bao 14", numberCount: 14, fixedLineCount: 3003 },
  [PlayType.Bao15]: { label: "Bao 15", numberCount: 15, fixedLineCount: 5005 },
  [PlayType.Bao18]: { label: "Bao 18", numberCount: 18, fixedLineCount: 18564 },
};

// ─────────────────────────────────────────────
// Line Count
// ─────────────────────────────────────────────

/**
 * Tính số line sinh ra từ 1 board.
 */
export function calculateLineCount(playType: PlayType): number {
  return PLAY_TYPE_CONFIGS[playType].fixedLineCount;
}

export function getRequiredNumberCount(playType: PlayType): number {
  return PLAY_TYPE_CONFIGS[playType].numberCount;
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSelection(playType: PlayType, selection: BoardSelection): ValidationResult {
  const errors: string[] = [];
  const { numbers } = selection;

  for (const n of numbers) {
    if (!VALID_NUMBER_SET.has(n)) {
      errors.push(`Số "${n}" không hợp lệ (phải từ "01" đến "45")`);
    }
  }

  if (new Set(numbers).size !== numbers.length) {
    errors.push("Số không được trùng nhau");
  }

  const config = PLAY_TYPE_CONFIGS[playType];
  if (numbers.length !== config.numberCount) {
    errors.push(
      `${config.label}: cần chọn đúng ${config.numberCount} số, nhận được ${numbers.length}`,
    );
  }

  return { valid: errors.length === 0, errors };
}
