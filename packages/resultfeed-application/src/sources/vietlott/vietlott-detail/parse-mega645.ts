/**
 * ResultFeed – vietlott-detail: Mega 6/45 Parser
 *
 * `09-power-mega-max3d-family.plan.md`. Đọc 6 số (giữ đúng thứ tự nguồn — sort là việc
 * của `canonicalizeNumbers`). KHÔNG có bonus/số đặc biệt, KHÔNG có checksum công bố trên
 * trang (`claimedChecksums` luôn rỗng).
 *
 * Cấu trúc DOM giống Lotto535/Power655 — dùng chung {@link readHeadingPeriodAndDate} +
 * {@link readBongTronNumbers} (xem `dom-helpers.ts`).
 *
 * Selector xác nhận trên fixture thật (`test/html/mega645.html`, kỳ #01557):
 * - Ngày + kỳ: `<H5>Kỳ quay thưởng <b>#01557</b> ngày <b>02/09/2026</b></H5>` (thẻ `<H5>`
 *   viết hoa trên fixture thật — cheerio/CSS selector không phân biệt hoa/thường nên
 *   `readHeadingPeriodAndDate` vẫn khớp bình thường).
 * - Số: `.day_so_ket_qua_v2 span.bong_tron` — 6 span liên tiếp, KHÔNG có `<i>|</i>` ngăn
 *   cách (khác Lotto535/Power655 vì không có số đặc biệt/bonus).
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readBongTronNumbers, readHeadingPeriodAndDate } from "./dom-helpers";

const MEGA645_NUMBER_COUNT = 6;

/** Đọc 6 số từ trang chi tiết Mega 6/45 `vietlott.vn` đã cheerio-parse. */
export function parseMega645($: cheerio.CheerioAPI): ParsedObservation {
  const heading = readHeadingPeriodAndDate($);
  if (!heading) {
    assertNotUnavailable($, ResultFeedSourceId.VietlottDetail, ResultFeedGameKey.Mega645);
    throw new ParseError(
      "Không tìm thấy '<h5>Kỳ quay thưởng #... ngày .../.../...' — HTML đã đổi cấu trúc.",
      ResultFeedSourceId.VietlottDetail,
      ResultFeedGameKey.Mega645,
    );
  }

  const numbersDisplay = readBongTronNumbers(
    $,
    MEGA645_NUMBER_COUNT,
    ResultFeedSourceId.VietlottDetail,
    ResultFeedGameKey.Mega645,
  );

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    // Mega 6/45 không công bố checksum trên trang chi tiết.
    claimedChecksums: {},
  };
}
