/**
 * Power 6/55 – Board Expansion (expand boards → lines)
 *
 * Chuyển đổi mỗi board (selection player chọn) thành các line (bộ 6 số) để match với kết quả quay.
 * - Standard/QuickPick: 1 board → 1 line (chọn đúng 6 số)
 * - Bao 5: 1 board (5 số) → 50 lines (5 số đã chọn + từng số trong 50 số còn lại)
 * - Bao N (N = 7..18): 1 board (N số) → C(N,6) lines (mọi tổ hợp chập 6 từ N số)
 *
 * Expansion xảy ra tại bước settle (không lúc place-bet) để giữ storage nhỏ:
 * ticket lưu board selection, chỉ expand ra lines khi cần match.
 *
 * Bảng tra số lines theo loại bao:
 * | Bao 5  | 55 - 5  =      50 lines | Ghép từng số trong 50 số còn lại |
 * | Bao 7  | C(7,6)  =       7 lines |
 * | Bao 8  | C(8,6)  =      28 lines |
 * | Bao 9  | C(9,6)  =      84 lines |
 * | Bao 10 | C(10,6) =     210 lines |
 * | Bao 11 | C(11,6) =     462 lines |
 * | Bao 12 | C(12,6) =     924 lines |
 * | Bao 13 | C(13,6) =   1.716 lines |
 * | Bao 14 | C(14,6) =   3.003 lines |
 * | Bao 15 | C(15,6) =   5.005 lines |
 * | Bao 18 | C(18,6) =  18.564 lines |
 */

import { PlayType } from "../entities/enums";
import {
  ALL_MAIN_NUMBERS,
  type LineValue,
  type BoardSelection,
  POWER655_MAIN_COUNT,
} from "../entities/types";
import type { EntryBoardSnapshot } from "../entities/entry";

/**
 * Sinh tất cả tổ hợp chập k từ mảng numbers (backtracking).
 *
 * Thuật toán: duyệt đệ quy, chọn phần tử tại vị trí start, recurse với start+1.
 * Kết quả: C(numbers.length, k) = n! / (k! × (n-k)!) tổ hợp.
 *
 * Đảm bảo thứ tự tăng dần trong mỗi tổ hợp (vì duyệt từ trái sang phải).
 * Dùng cho Bao N (7-18): numbers = N số player chọn (đã sort), k = 6 (POWER655_MAIN_COUNT).
 *
 * @param numbers - Mảng số đầu vào (đã sort tăng dần)
 * @param k       - Kích thước mỗi tổ hợp (6 cho Power 6/55)
 * @returns Mảng các tổ hợp, mỗi tổ hợp là mảng k phần tử
 */
function generateCombinations(numbers: string[], k: number): string[][] {
  const result: string[][] = [];
  const combo: string[] = [];

  function backtrack(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < numbers.length; i++) {
      combo.push(numbers[i]!);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

/**
 * Bao 5: chọn 5 số, hệ thống ghép lần lượt 50 số còn lại (55 - 5 = 50) → 50 lines.
 *
 * Cơ chế: với mỗi số `n` trong ALL_MAIN_NUMBERS mà player CHƯA chọn,
 * tạo 1 line gồm 5 số đã chọn + số `n` → 6 số (sorted canonical).
 *
 * Đây là loại bao ĐẶC BIỆT (khác Bao 7-18): không dùng C(N,6) mà ghép bổ sung từng số.
 * Tương tự Mega 6/45 Bao 5 nhưng pool lớn hơn: 55 - 5 = 50 lines (Mega: 45 - 5 = 40).
 *
 * @param selection - Board selection với 5 số player chọn ("01"-"55")
 * @returns 50 LineValue, mỗi line gồm 5 số đã chọn + 1 số bổ sung (sorted)
 */
function expandBao5(selection: BoardSelection): LineValue[] {
  const chosen = new Set(selection.mainNumbers);
  const lines: LineValue[] = [];

  for (const n of ALL_MAIN_NUMBERS) {
    if (chosen.has(n)) continue;
    // Ghép số bổ sung n vào 5 số đã chọn → 1 line 6 số (sorted canonical).
    const mainNums = [...selection.mainNumbers, n];
    lines.push({ main: mainNums.sort() });
  }

  // Đảm bảo đúng 50 lines: 55 tổng - 5 đã chọn = 50.
  return lines;
}

/**
 * Expand 1 board thành danh sách lines theo play type.
 *
 * - Standard/QuickPick: lấy 6 số đầu tiên (đã sort) → 1 line duy nhất.
 *
 * - Bao 5: ghép từng số trong 50 số còn lại vào 5 số đã chọn → 50 lines.
 *   Ví dụ: player chọn [01,05,12,23,34] → 50 lines, mỗi line = 5 số đó + 1 trong 50 số còn lại.
 *
 * - Bao N (bao7..bao18): sinh C(N, 6) tổ hợp chập 6 từ N số player chọn.
 *   Mỗi tổ hợp = 1 line. Ví dụ: Bao 8 chọn [01,05,12,23,34,45,50,55]
 *   → C(8,6) = 28 lines, mỗi line là 6 trong 8 số đó.
 *
 * Sort trước khi expand để đảm bảo deterministic (dedup + hash nhất quán).
 *
 * @param playType  - Kiểu chơi (Standard, QuickPick, Bao5, Bao7-18)
 * @param selection - Board selection chứa mainNumbers
 * @returns Mảng LineValue, mỗi phần tử chứa main: string[] (6 số, sorted tăng dần)
 */
export function expandBoardToLines(playType: PlayType, selection: BoardSelection): LineValue[] {
  const sorted = [...selection.mainNumbers].sort();

  if (playType === PlayType.Standard || playType === PlayType.QuickPick) {
    return [{ main: sorted.slice(0, POWER655_MAIN_COUNT) }];
  }

  if (playType === PlayType.Bao5) {
    // Bao 5 dùng thuật toán ghép số bổ sung (khác Bao 7-18 dùng C(N,6)).
    return expandBao5({ mainNumbers: sorted });
  }

  // Bao N (7-18): generate all C(N, 6) combinations từ N số player chọn.
  const combos = generateCombinations(sorted, POWER655_MAIN_COUNT);
  return combos.map((combo) => ({ main: combo }));
}

/**
 * Expand tất cả boards của 1 ticket thành flat list of lines.
 *
 * Dùng trong settle pipeline: ticket có tối đa 5 boards (A-E), mỗi board
 * expand riêng theo play type, sau đó gộp thành mảng phẳng kèm metadata:
 * - boardNo: ký hiệu board (A-E) — để map kết quả về đúng board trên UI.
 * - lineIndex: index toàn cục (0-based, liên tục qua các boards) — primary key cho TicketLineDoc.
 *
 * Số lines theo loại:
 * - Standard/QuickPick: 1 line/board
 * - Bao 5: 50 lines/board (55 - 5 = 50)
 * - Bao N (7-18): C(N,6) lines/board
 *
 * @param boards - Mảng `EntryBoardSnapshot[]` từ TicketEntryDoc.
 * @returns Flat array of lines, mỗi phần tử gồm LineValue + boardNo + lineIndex
 */
export function expandAllBoards(
  boards: EntryBoardSnapshot[],
): Array<LineValue & { boardNo: string; lineIndex: number }> {
  const result: Array<LineValue & { boardNo: string; lineIndex: number }> = [];
  let globalIndex = 0;

  for (const board of boards) {
    const selection: BoardSelection = { mainNumbers: board.mainNumbers };
    const lines = expandBoardToLines(board.playType, selection);
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
