/**
 * Max 3D – Play Types & Validation
 *
 * Max 3D có 4 boards (A-D), mỗi board chọn 1-2 bộ ba số.
 * - Basic mode: 1 bộ ba số (straight/combo3/combo6/quickPick)
 * - Plus mode: 2 bộ ba số (straight only)
 */

import { PlayMode, PlayType } from "../entities/enums";
import type { BoardSelection, Triplet } from "../entities/types";
import { getPermutationCount } from "./prize-tiers";

export const VALID_BOARD_NOS = ["A", "B", "C", "D"] as const;

/**
 * Tính số line (lần tham gia dự thưởng) cho 1 board.
 *
 * - Basic straight/quickPick: 1 line
 * - Basic combo3: 3 lines (hoặc 1 nếu 3 chữ số giống)
 * - Basic combo6: 6 lines (hoặc 3 nếu 2 chữ số giống)
 * - Plus (bất kỳ type): 1 line (2 bộ ba số = 1 lần dự thưởng)
 */
export function calculateLineCount(
  playMode: PlayMode,
  playType: PlayType,
  selection: BoardSelection
): number {
  if (playMode === PlayMode.Plus) {
    return 1;
  }

  if (playType === PlayType.Straight || playType === PlayType.QuickPick) {
    return 1;
  }

  if (playType === PlayType.Combo3 || playType === PlayType.Combo6) {
    const triplet = selection.triplets[0];
    if (!triplet) return 1;
    return getPermutationCount(triplet);
  }

  return 1;
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

  if (!selection.triplets || !Array.isArray(selection.triplets)) {
    errors.push("Thiếu danh sách bộ ba số");
    return { valid: false, errors };
  }

  if (playMode === PlayMode.Basic) {
    if (selection.triplets.length !== 1) {
      errors.push("Max 3D Cơ Bản cần chọn đúng 1 bộ ba số");
    }

    if (selection.triplets[0] && !isValidTriplet(selection.triplets[0])) {
      errors.push(
        `Bộ ba số không hợp lệ: ${selection.triplets[0]} (cần 3 chữ số 000-999)`
      );
    }

    if (playType === PlayType.Combo3) {
      const triplet = selection.triplets[0];
      if (triplet) {
        const permCount = getPermutationCount(triplet);
        if (permCount > 3) {
          errors.push(
            "Tổ hợp 3 yêu cầu có ít nhất 2 chữ số giống nhau (ví dụ: 112, 333)"
          );
        }
      }
    }

    if (playType === PlayType.Combo6) {
      const triplet = selection.triplets[0];
      if (triplet) {
        const permCount = getPermutationCount(triplet);
        if (permCount !== 6) {
          errors.push("Tổ hợp 6 yêu cầu 3 chữ số khác nhau (ví dụ: 123, 456)");
        }
      }
    }
  }

  if (playMode === PlayMode.Plus) {
    if (selection.triplets.length !== 2) {
      errors.push("Max 3D+ cần chọn đúng 2 bộ ba số");
    }

    for (let i = 0; i < selection.triplets.length; i++) {
      const t = selection.triplets[i]!;
      if (!isValidTriplet(t)) {
        errors.push(
          `Bộ ba số ${i + 1} không hợp lệ: ${t} (cần 3 chữ số 000-999)`
        );
      }
    }

    if (playType !== PlayType.Straight && playType !== PlayType.QuickPick) {
      errors.push("Max 3D+ chỉ hỗ trợ kiểu chơi Straight hoặc QuickPick");
    }
  }

  return { valid: errors.length === 0, errors };
}
