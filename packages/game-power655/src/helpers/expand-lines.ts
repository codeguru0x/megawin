/**
 * Power 6/55 – Board Expansion (expand boards → lines)
 *
 * Chuyển đổi mỗi board (selection player chọn) thành các line (bộ 6 số) để match với kết quả quay.
 * - Standard/QuickPick: 1 board → 1 line (chọn đúng 6 số)
 * - Bao N (N = 7..18): 1 board (N số) → C(N,6) lines (mọi tổ hợp chập 6 từ N số)
 *
 * Expansion xảy ra tại bước settle (không lúc place-bet) để giữ storage nhỏ:
 * ticket lưu board selection, chỉ expand ra lines khi cần match.
 *
 * Bảng tra C(N,6) cho Power 6/55:
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
 *
 * Lưu ý: Power 6/55 KHÔNG có Bao 5 (khác Mega 6/45).
 */

import { PlayType } from "../entities/enums";
import type { MainTuple, LineValue, BoardSelection } from "../entities/types";
import { POWER655_MAIN_COUNT } from "../entities/types";
import type { Board } from "../entities/ticket";
import type { EntryBoardSnapshot } from "../entities/entry";

/**
 * Sinh tất cả tổ hợp chập k từ mảng numbers (backtracking).
 *
 * Thuật toán: duyệt đệ quy, chọn phần tử tại vị trí start, recurse với start+1.
 * Kết quả: C(numbers.length, k) = n! / (k! × (n-k)!) tổ hợp.
 *
 * Đảm bảo thứ tự tăng dần trong mỗi tổ hợp (vì duyệt từ trái sang phải).
 * Dùng cho Bao N: numbers = N số player chọn (đã sort), k = 6 (POWER655_MAIN_COUNT).
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
 * Expand 1 board thành danh sách lines theo play type.
 *
 * - Standard/QuickPick: lấy 6 số đầu tiên (đã sort) → 1 line duy nhất.
 *   Player chọn đúng 6 số → mainNumbers.length = 6 → slice(0,6) = toàn bộ.
 *
 * - Bao N (bao7..bao18): sinh C(N, 6) tổ hợp chập 6 từ N số player chọn.
 *   Mỗi tổ hợp = 1 line. Ví dụ: Bao 8 chọn [01,05,12,23,34,45,50,55]
 *   → C(8,6) = 28 lines, mỗi line là 6 trong 8 số đó.
 *
 * Sort trước khi expand để đảm bảo deterministic (dedup + hash nhất quán).
 *
 * @param playType  - Kiểu chơi (Standard, QuickPick, Bao7-18)
 * @param selection - Board selection chứa mainNumbers (mảng N số "01"-"55")
 * @returns Mảng LineValue, mỗi phần tử chứa main: MainTuple (6 số)
 */
export function expandBoardToLines(
  playType: PlayType,
  selection: BoardSelection
): LineValue[] {
  const sorted = [...selection.mainNumbers].sort();

  if (playType === PlayType.Standard || playType === PlayType.QuickPick) {
    return [{ main: sorted.slice(0, POWER655_MAIN_COUNT) as unknown as MainTuple }];
  }

  // Bao N: generate all C(N, 6) combinations từ N số player chọn
  const combos = generateCombinations(sorted, POWER655_MAIN_COUNT);
  return combos.map((combo) => ({
    main: combo as unknown as MainTuple,
  }));
}

/**
 * Expand tất cả boards của 1 ticket thành flat list of lines.
 *
 * Dùng trong settle pipeline: ticket có tối đa 5 boards (A-E), mỗi board
 * expand riêng theo play type, sau đó gộp thành mảng phẳng kèm metadata:
 * - boardNo: ký hiệu board (A-E) — để map kết quả về đúng board trên UI.
 * - lineIndex: index toàn cục (0-based, liên tục qua các boards) — primary key cho TicketLineDoc.
 *
 * Boards đã void (bị huỷ một phần) được skip hoàn toàn.
 *
 * @param boards - Mảng `Board[]` (từ TicketDoc, có `isVoid`) hoặc `EntryBoardSnapshot[]` (từ EntryDoc, không có `isVoid` → không bao giờ skip)
 * @returns Flat array of lines, mỗi phần tử gồm LineValue + boardNo + lineIndex
 */
export function expandAllBoards(
  boards: Board[] | EntryBoardSnapshot[]
): Array<LineValue & { boardNo: string; lineIndex: number }> {
  const result: Array<LineValue & { boardNo: string; lineIndex: number }> = [];
  let globalIndex = 0;

  for (const board of boards) {
    // Board[] có isVoid; EntryBoardSnapshot không có → không bao giờ skip
    if ("isVoid" in board && board.isVoid) continue;
    const selection: BoardSelection = { mainNumbers: board.playType === PlayType.Standard || board.playType === PlayType.QuickPick
      ? (board as Board).selection?.mainNumbers ?? (board as EntryBoardSnapshot).mainNumbers
      : (board as Board).selection?.mainNumbers ?? (board as EntryBoardSnapshot).mainNumbers
    };
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
