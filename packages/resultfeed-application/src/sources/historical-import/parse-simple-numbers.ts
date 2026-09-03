/**
 * ResultFeed – Historical Import: Simple Numbers Parser
 *
 * `06-historical-import.plan.md §2.1`. Dùng CHUNG cho Bingo18/Keno/Lotto535/Mega645/
 * Power655 — mọi game này encode `result: number[]` phẳng trong JSONL lịch sử, chỉ khác
 * độ rộng zero-pad và có/không có số đặc biệt/bonus ở cuối mảng.
 *
 * ⚠️ File JSONL lịch sử KHÔNG cùng nguồn với `vietlott.vn` sống (site khác, format nhãn
 * checksum khác hẳn — VD Keno lịch sử ghi `"Lẻ (11)"` kèm số lượng trong ngoặc, khác hẳn
 * ô `<td>CHẴN</td>` rời của trang chi tiết) — do đó KHÔNG tái dùng
 * `vietlott/shared/checksum-labels.ts` cho Keno (label set khác, xem `KENO_LABEL_KIND` dưới),
 * chỉ tái dùng được cho Bingo18 (`BIG_SMALL_DRAW_LABELS` — cùng 3 nhãn "Nhỏ/Hòa/Lớn" y
 * nguyên, không lệch).
 */

import { ResultFeedGameKey as GameKey } from "@megawin/resultfeed/entities";

import type { ParsedObservation } from "../types";
import { BIG_SMALL_DRAW_LABELS } from "../vietlott/shared";
import { idToDrawPeriod } from "./id-to-period";

/** Độ rộng zero-pad số hiển thị theo game — Bingo18 tối đa 1 chữ số (xúc xắc 1-6). */
const PAD_WIDTH: Record<
  | (typeof GameKey)["Bingo18"]
  | (typeof GameKey)["Keno"]
  | (typeof GameKey)["Lotto535"]
  | (typeof GameKey)["Mega645"]
  | (typeof GameKey)["Power655"],
  number
> = {
  [GameKey.Bingo18]: 1,
  [GameKey.Keno]: 2,
  [GameKey.Lotto535]: 2,
  [GameKey.Mega645]: 2,
  [GameKey.Power655]: 2,
};

/** Shape thô của 1 dòng JSONL — field optional khác nhau theo game (xem `checksum-labels.ts`). */
export interface SimpleNumbersRawRow {
  date: string;
  id: string;
  result: number[];
  /** Chỉ Bingo18. */
  total?: number;
  /** Chỉ Bingo18 — "Nhỏ"/"Hòa"/"Lớn". */
  large_small?: string;
  /** Chỉ Keno — dạng `"Lẻ (11)"` hoặc `"Chẵn (12)"` (nhãn chẵn/lẻ HOẶC lớn/nhỏ, xem dưới). */
  big_small?: string;
  /** Chỉ Keno — dạng `"Nhỏ (11)"` hoặc `"Lớn (13)"` (nhãn còn lại của cặp trên). */
  odd_even?: string;
}

// ─────────────────────────────────────────────
// Keno — parse nhãn `big_small`/`odd_even` thành claimedChecksums
// ─────────────────────────────────────────────

/**
 * ⚠️ PHÁT HIỆN THỰC TẾ (đối chiếu toàn bộ 82.560 dòng `keno.jsonl`, 0 sai lệch): field
 * `big_small` và `odd_even` trong JSONL lịch sử **KHÔNG cố định** — field `big_small` có
 * lúc chứa nhãn chẵn/lẻ (`"Lẻ (11)"`), có lúc chứa nhãn lớn/nhỏ (`"Chẵn (12)"` — tên field
 * BỊ ĐẢO NGƯỢC ~80% số dòng). KHÔNG được tin tên field — phải đọc CHÍNH NỘI DUNG nhãn
 * (`Chẵn/Lẻ/Even/Odd` hay `Lớn/Nhỏ/Great/Small/Big`) để biết field đó đại diện cặp nào.
 *
 * `Hòa`/`Draw` (kết quả 10-10) không tự phân biệt được cặp — suy ra cặp CÒN LẠI dựa vào
 * field kia (đúng 2 field ⇒ đúng 2 cặp chẵn/lẻ + lớn/nhỏ). Nếu CẢ HAI field đều `Hòa`/`Draw`
 * (double-tie hiếm), cả 4 giá trị đều = 10 nên gán cặp nào cũng ra giá trị đúng.
 */
const KENO_LABEL_KIND: Record<string, "even" | "odd" | "big" | "small" | "tie"> = {
  Chẵn: "even",
  Even: "even",
  Lẻ: "odd",
  Odd: "odd",
  Lớn: "big",
  Great: "big",
  Big: "big",
  Nhỏ: "small",
  Small: "small",
  Hòa: "tie",
  Draw: "tie",
};

const KENO_LABEL_PATTERN = /^([^\d(]+)\s*\((\d+)\)\s*$/;

/** Parse `claimedChecksums` Keno (even/odd/big/small) từ 2 field nhãn — xem JSDoc trên. */
function extractKenoChecksums(fields: Array<string | undefined>): Record<string, number> {
  const nonTie: Array<{ kind: "even" | "odd" | "big" | "small"; count: number }> = [];
  const ties: number[] = [];

  for (const raw of fields) {
    if (!raw) {
      continue;
    }
    const match = KENO_LABEL_PATTERN.exec(raw.trim());
    if (!match) {
      continue;
    }
    const [, word, countText] = match;
    const kind = KENO_LABEL_KIND[(word ?? "").trim()];
    const count = Number(countText);
    if (!kind || Number.isNaN(count)) {
      continue;
    }
    if (kind === "tie") {
      ties.push(count);
    } else {
      nonTie.push({ kind, count });
    }
  }

  const result: Record<string, number> = {};
  // Theo dõi cặp nào đã được điền bởi `nonTie` — quyết định ties (Hòa/Draw) đi vào cặp
  // CÒN LẠI. Không dùng `result.even === undefined` để suy luận: `result` chỉ khai `number`
  // (không optional), kiểm tra `undefined` trên đó là sai kiểu dù đúng runtime.
  let evenOddFilled = false;
  let bigSmallFilled = false;

  for (const { kind, count } of nonTie) {
    if (kind === "even") {
      result.even = count;
      result.odd = 20 - count;
      evenOddFilled = true;
    } else if (kind === "odd") {
      result.odd = count;
      result.even = 20 - count;
      evenOddFilled = true;
    } else if (kind === "big") {
      result.big = count;
      result.small = 20 - count;
      bigSmallFilled = true;
    } else {
      result.small = count;
      result.big = 20 - count;
      bigSmallFilled = true;
    }
  }
  for (const count of ties) {
    if (!evenOddFilled) {
      result.even = count;
      result.odd = count;
      evenOddFilled = true;
    } else if (!bigSmallFilled) {
      result.big = count;
      result.small = count;
      bigSmallFilled = true;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Parser chính — dùng chung 5 game
// ─────────────────────────────────────────────

/**
 * Map 1 dòng JSONL lịch sử (Bingo18/Keno/Lotto535/Mega645/Power655) sang `ParsedObservation`.
 *
 * Lotto535/Power655: số cuối mảng `result` là đặc biệt/bonus (quy ước "số cuối là số đặc
 * biệt" — xem `06-historical-import.plan.md §2.1`), giữ nguyên ở cuối `numbersDisplay`
 * (KHÔNG sort — sort riêng main/đặc biệt là việc của `canonicalizeNumbers`).
 */
export function parseSimpleNumbersRow(
  gameKey:
    | (typeof GameKey)["Bingo18"]
    | (typeof GameKey)["Keno"]
    | (typeof GameKey)["Lotto535"]
    | (typeof GameKey)["Mega645"]
    | (typeof GameKey)["Power655"],
  raw: SimpleNumbersRawRow,
): ParsedObservation {
  const width = PAD_WIDTH[gameKey];
  const numbersDisplay = raw.result.map((n) => String(n).padStart(width, "0"));

  const claimedChecksums: Record<string, string | number> = {};
  if (gameKey === GameKey.Bingo18) {
    if (raw.total !== undefined) {
      claimedChecksums.sum = raw.total;
    }
    if (raw.large_small !== undefined) {
      const key = BIG_SMALL_DRAW_LABELS[raw.large_small];
      if (key) {
        claimedChecksums.bigSmallDraw = key;
      }
    }
  } else if (gameKey === GameKey.Keno) {
    Object.assign(claimedChecksums, extractKenoChecksums([raw.big_small, raw.odd_even]));
  }
  // Lotto535/Mega645/Power655 không có checksum tự công bố trong JSONL lịch sử —
  // claimedChecksums giữ rỗng, `checkIntrinsic` tự chạy nhánh format-only.

  return {
    drawPeriod: idToDrawPeriod(raw.id),
    drawDateSource: raw.date,
    drawTimeSource: null,
    numbersDisplay,
    claimedChecksums,
  };
}
