/**
 * Mega 6/45 – Expand Boards to Lines
 *
 * Chuyển đổi boards thành danh sách lines (bộ 6 số).
 * Đây là bước tiền xử lý trước khi match với kết quả quay.
 *
 * Công thức số lines theo từng loại bao:
 *   - standard  : 1 line (6 số đã chọn)
 *   - bao5      : 45 - 5 = 40 lines (hệ thống ghép 40 số còn lại)
 *   - bao N (7-18): C(N, 6) lines (mọi tổ hợp 6 số từ N số đã chọn)
 */

import { PlayType } from "../entities/enums";
import {
  ALL_NUMBERS,
  MEGA645_NUMBER_COUNT,
  type BoardSelection,
  type LineValue,
} from "../entities/types";
import type { EntryBoardSnapshot } from "../entities/entry";

// ─────────────────────────────────────────────
// Core: generate combinations
// ─────────────────────────────────────────────

/**
 * Generator sinh tất cả tổ hợp k phần tử từ mảng arr (không lặp, giữ thứ tự).
 * Thuật toán đệ quy: chọn phần tử đầu → đệ quy phần tử còn lại với k-1.
 * Độ phức tạp: O(C(n,k)) — chỉ sinh đúng số kết quả cần thiết, không dư.
 *
 * @param arr - Mảng nguồn đã sorted (đảm bảo output canonical).
 * @param k   - Số phần tử cần chọn.
 */
function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i]!, ...rest];
    }
  }
}

/** Standard: 6 số = 1 line. */
function expandStandard(sel: BoardSelection): LineValue[] {
  return [{ numbers: [...sel.numbers].sort() }];
}

/**
 * Bao 5: chọn 5 số, hệ thống ghép lần lượt 40 số còn lại → 40 lines.
 * Công thức: lines = 45 - 5 = 40 (tất cả số trong tập 01-45 chưa được chọn).
 * Mỗi line = 5 số đã chọn + 1 số bổ sung (sorted canonical).
 */
function expandBao5(sel: BoardSelection): LineValue[] {
  const chosen = new Set(sel.numbers);
  const lines: LineValue[] = [];

  for (const n of ALL_NUMBERS) {
    if (chosen.has(n)) continue;
    // Ghép số bổ sung n vào 5 số đã chọn → 1 line 6 số.
    const nums = [...sel.numbers, n];
    lines.push({ numbers: nums.sort() });
  }

  return lines;
}

/**
 * Bao 7-18: chọn N số, expand thành C(N, 6) lines.
 * Công thức: C(N, 6) = N! / (6! × (N-6)!)
 *
 * Ví dụ: Bao 7 → C(7,6) = 7 lines; Bao 10 → C(10,6) = 210 lines.
 * Mỗi line là 1 tổ hợp 6 số từ N số đã chọn (duyệt qua generator combinations).
 */
function expandBaoN(sel: BoardSelection): LineValue[] {
  const sorted = [...sel.numbers].sort();
  const lines: LineValue[] = [];

  for (const combo of combinations(sorted, MEGA645_NUMBER_COUNT)) {
    lines.push({ numbers: combo });
  }

  return lines;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Expand 1 board thành danh sách lines theo play type.
 * Exhaustive switch — TypeScript đảm bảo không bỏ sót play type nào.
 */
export function expandBoardToLines(playType: PlayType, selection: BoardSelection): LineValue[] {
  switch (playType) {
    case PlayType.Standard:
      return expandStandard(selection);

    case PlayType.Bao5:
      return expandBao5(selection);

    case PlayType.Bao7:
    case PlayType.Bao8:
    case PlayType.Bao9:
    case PlayType.Bao10:
    case PlayType.Bao11:
    case PlayType.Bao12:
    case PlayType.Bao13:
    case PlayType.Bao14:
    case PlayType.Bao15:
    case PlayType.Bao18:
      return expandBaoN(selection);

    default: {
      const _exhaustive: never = playType;
      throw new Error(`Unknown play type: ${_exhaustive}`);
    }
  }
}

/**
 * Expand tất cả boards của 1 vé thành danh sách lines đầy đủ.
 * lineIndex là chỉ số toàn cục (xuyên suốt tất cả boards, bắt đầu từ 0).
 *
 * Nhận structural type tối giản — tương thích cả `Board` (ticket) lẫn
 * `EntryBoardSnapshot` (entry snapshot) mà không cần convert.
 *
 * @returns Mảng lines kèm boardNo và lineIndex — dùng để lưu TicketLineDoc.
 */
export function expandAllBoards(
  boards: EntryBoardSnapshot[],
): Array<LineValue & { boardNo: string; lineIndex: number }> {
  const result: Array<LineValue & { boardNo: string; lineIndex: number }> = [];
  let globalIndex = 0;

  for (const board of boards) {
    const lines = expandBoardToLines(board.playType, { numbers: board.numbers });
    for (const line of lines) {
      result.push({
        ...line,
        boardNo: board.boardNo,
        lineIndex: globalIndex++,
      });
    }
  }

  return result;
}
