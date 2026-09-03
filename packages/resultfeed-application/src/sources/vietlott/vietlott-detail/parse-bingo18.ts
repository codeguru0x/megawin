/**
 * ResultFeed – vietlott-detail: Bingo18 Parser
 *
 * `02-fetch-parse.plan.md §2.2`. Đọc 3 số **giữ đúng thứ tự nguồn** (KHÔNG sort, KHÔNG
 * dedupe — trùng số là hợp lệ, 3 xúc xắc độc lập) + 2 checksum nguồn tự công bố
 * (Cửa tổng = `sum`, Lớn/Hòa/Nhỏ = `bigSmallDraw`).
 *
 * Selector xác nhận trên fixture thật (`test/html/bingo18.html`, kỳ #0184325):
 * - Số: `.CssDivBingo span.bong_tron_bingo` (3 span, ĐÚNG thứ tự DOM — VD `["1","5","1"]`).
 * - "Cửa tổng" và "Lớn/Hòa/Nhỏ" là 2 hàng `<tr>` RIÊNG, nằm NGAY SAU hàng kết quả — ô đầu
 *   là nhãn (có `colspan=2`), ô cuối là giá trị.
 *
 * ⚠️ Nếu selector dùng `Set` hoặc bất kỳ bước dedupe nào, `["5","2","5"]` sẽ mất số 5 lặp
 * — sai âm thầm. `.map().toArray()` của cheerio giữ nguyên thứ tự + trùng lặp, đúng yêu cầu.
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { BIG_SMALL_DRAW_LABELS } from "../shared";
import { findResultRow, readDateAndPeriod } from "./dom-helpers";

/** Đọc 3 số + 2 checksum từ trang chi tiết Bingo18 `vietlott.vn` đã cheerio-parse. */
export function parseBingo18($: cheerio.CheerioAPI): ParsedObservation {
  const row = findResultRow($, ResultFeedSourceId.VietlottDetail, ResultFeedGameKey.Bingo18);
  const { drawDateSource, drawPeriod } = readDateAndPeriod(
    $,
    row,
    ResultFeedSourceId.VietlottDetail,
    ResultFeedGameKey.Bingo18,
  );

  // ĐÚNG thứ tự DOM, giữ nguyên trùng lặp — .toArray() không dedupe.
  const numbersDisplay = row
    .find(".CssDivBingo span.bong_tron_bingo")
    .map((_, el) => $(el).text().trim())
    .toArray();

  const claimedChecksums: Record<string, string | number> = {};

  // "Cửa tổng" và "Lớn/Hòa/Nhỏ" là 2 <tr> riêng ngay sau hàng kết quả — ô đầu là nhãn
  // (colspan=2), ô cuối là giá trị. Đọc bằng text nhãn, không dựa vị trí cố định.
  let cursor = row.next("tr");
  for (let i = 0; i < 2 && cursor.length > 0; i++) {
    const cells = cursor.find("td");
    const label = $(cells.get(0)).text().trim();
    const valueText = $(cells.get(cells.length - 1))
      .text()
      .trim();

    if (label === "Cửa tổng") {
      const sum = Number(valueText);
      if (!Number.isNaN(sum)) {
        claimedChecksums.sum = sum;
      }
    } else if (label === "Lớn/Hòa/Nhỏ") {
      const key = BIG_SMALL_DRAW_LABELS[valueText];
      if (key) {
        claimedChecksums.bigSmallDraw = key;
      }
    }

    cursor = cursor.next("tr");
  }

  return {
    drawPeriod,
    drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    claimedChecksums,
  };
}
