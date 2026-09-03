/**
 * ResultFeed – Historical Import: Max3d/Max3dpro Parser
 *
 * `06-historical-import.plan.md §2.4`. Max3d/Max3dpro trong JSONL lịch sử là object 4 giải
 * (`"Giải Đặc biệt"`/`"Giải Nhất"`/`"Giải Nhì"`/`"Giải ba"`), KHÁC hẳn 5 game "số phẳng"
 * (`parse-simple-numbers.ts`). `ObservationDoc.numbersDisplay` chỉ là `string[]` phẳng —
 * encode 4 giải thành 1 mảng theo thứ tự CỐ ĐỊNH Đặc biệt(2) + Nhất(4) + Nhì(6) + Ba(8) =
 * 20 triplet, ĐÚNG offset `MAX3D_TIER_COUNTS` (`@megawin/resultfeed/rules`) — quy ước này
 * là NGUỒN CHÂN LÝ DUY NHẤT dùng chung bởi `canonicalizeNumbers` và `checkFormatOnly`
 * (`checkMax3dFormat`), KHÔNG được lệch offset ở đây.
 *
 * Triplet trong JSONL đã sẵn dạng chuỗi 3 chữ số zero-pad (`"015"`, `"517"`) — không cần
 * pad lại, chỉ cần đúng thứ tự + đúng số lượng mỗi giải.
 */

import { MAX3D_TIER_COUNTS } from "@megawin/resultfeed/rules";

import type { ParsedObservation } from "../types";
import { idToDrawPeriod } from "./id-to-period";

/** Thứ tự CỐ ĐỊNH khớp `MAX3D_TIER_COUNTS = [2, 4, 6, 8]` — đổi thứ tự ở đây PHẢI đổi luôn ở đó. */
const MAX3D_TIER_KEYS = ["Giải Đặc biệt", "Giải Nhất", "Giải Nhì", "Giải ba"] as const;

export interface Max3dRawResult {
  "Giải Đặc biệt": string[];
  "Giải Nhất": string[];
  "Giải Nhì": string[];
  "Giải ba": string[];
}

export interface Max3dRawRow {
  date: string;
  id: string;
  result: Max3dRawResult;
}

/**
 * Map 1 dòng JSONL lịch sử Max3d/Max3dpro sang `ParsedObservation` — flatten 4 giải thành
 * 20 triplet phẳng theo thứ tự `MAX3D_TIER_KEYS`/`MAX3D_TIER_COUNTS`.
 *
 * @throws {Error} Khi 1 giải thiếu hoặc sai số lượng triplet — dữ liệu nguồn hỏng, không
 * âm thầm bỏ qua (khác `checkFormatOnly` chỉ chạy SAU khi đã có `numbersDisplay` phẳng).
 */
export function parseMax3dRow(raw: Max3dRawRow): ParsedObservation {
  const numbersDisplay: string[] = [];
  for (let i = 0; i < MAX3D_TIER_KEYS.length; i++) {
    const tierKey = MAX3D_TIER_KEYS[i];
    const expectedCount = MAX3D_TIER_COUNTS[i];
    const tierValues = tierKey ? raw.result[tierKey] : undefined;
    if (!tierValues || tierValues.length !== expectedCount) {
      throw new Error(
        `parseMax3dRow: id "${raw.id}" — giải "${tierKey}" phải có ${expectedCount} triplet, nhận được ${tierValues?.length ?? 0}.`,
      );
    }
    numbersDisplay.push(...tierValues);
  }

  return {
    drawPeriod: idToDrawPeriod(raw.id),
    drawDateSource: raw.date,
    drawTimeSource: null,
    numbersDisplay,
    // Max3d/Max3dpro không có checksum tự công bố — checkFormatOnly (checkMax3dFormat)
    // dùng đúng format/miền số làm điều kiện Passed duy nhất.
    claimedChecksums: {},
  };
}
