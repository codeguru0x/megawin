/**
 * Lotto 5/35 – Draw Result comparison rules.
 *
 * Dùng trong `PublishResultUseCase` để phân biệt sửa metadata vs sửa kết quả.
 */

import type { DrawResult } from "../entities/draw";

/**
 * So sánh 2 `DrawResult` Lotto 5/35 theo thứ tự `winningMain[]` + `winningSpecial`.
 *
 * @returns `true` nếu kết quả giống hệt; ngược lại `false`.
 */
export function isSameLotto535Result(a: DrawResult, b: DrawResult): boolean {
  if (a.winningSpecial !== b.winningSpecial) {
    return false;
  }

  const aMain = a.winningMain;
  const bMain = b.winningMain;

  if (aMain.length !== bMain.length) {
    return false;
  }

  return aMain.every((v, i) => v === bMain[i]);
}
