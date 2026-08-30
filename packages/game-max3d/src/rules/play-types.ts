/**
 * Max 3D – Play Types & Validation
 *
 * Max 3D có 4 boards (A-D), mỗi board chọn 1-2 bộ ba số.
 * - Basic mode: 1 bộ ba số (straight/combo3/combo6)
 * - Plus mode: 2 bộ ba số (straight only)
 */

import { AppException } from "@megawin/shared/errors";

import { PlayMode, PlayType } from "../entities/enums";
import type { BoardSelection } from "../entities/types";
import { getPermutationCount } from "./prize-tiers";

/**
 * Tính số line (lần tham gia dự thưởng) cho 1 board.
 *
 * - Basic straight: 1 line
 * - Basic combo3: 3 lines (hoặc 1 nếu 3 chữ số giống)
 * - Basic combo6: 6 lines (hoặc 3 nếu 2 chữ số giống)
 * - Plus (bất kỳ type): 1 line (2 bộ ba số = 1 lần dự thưởng)
 */
export function calculateLineCount(playMode: PlayMode, playType: PlayType, selection: BoardSelection): number {
  if (playMode === PlayMode.Plus) {
    return 1;
  }

  if (playType === PlayType.Straight) {
    return 1;
  }

  if (playType === PlayType.Combo3 || playType === PlayType.Combo6) {
    const triplet = selection.triplets[0];

    if (!triplet) {
      return 1;
    }

    return getPermutationCount(triplet);
  }

  throw AppException.badRequest(`Không hỗ trợ playMode=${playMode}, playType=${playType}.`);
}

/**
 * Validate selection cho 1 board. Throw `Error` ngay khi gặp vi phạm.
 *
 * Chỉ kiểm tra combo constraint (combo3/combo6 yêu cầu cấu trúc chữ số cụ thể).
 * Các rule về playMode/playType/triplet count đã được Zod validate ở handler trước khi vào đây.
 */
/**
 * Validate combo constraint cho Basic mode.
 *
 * Zod đã kiểm tra triplet format, playMode/playType, và số lượng triplets.
 * Hàm này chỉ kiểm tra thêm cấu trúc chữ số bắt buộc theo từng combo type:
 * - combo3: bộ ba phải có ít nhất 2 chữ số giống (≤ 3 hoán vị)
 * - combo6: bộ ba phải có 3 chữ số khác nhau (= 6 hoán vị)
 */
export function validateSelection(playType: PlayType, selection: BoardSelection): void {
  const triplet = selection.triplets[0];

  if (!triplet) {
    return;
  }

  if (playType === PlayType.Combo3 && getPermutationCount(triplet) > 3) {
    throw new Error("Tổ hợp 3 yêu cầu có ít nhất 2 chữ số giống nhau (ví dụ: 112, 333)");
  }

  if (playType === PlayType.Combo6 && getPermutationCount(triplet) !== 6) {
    throw new Error("Tổ hợp 6 yêu cầu 3 chữ số khác nhau (ví dụ: 123, 456)");
  }
}
