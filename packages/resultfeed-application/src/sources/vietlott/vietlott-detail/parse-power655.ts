/**
 * ResultFeed – vietlott-detail: Power 6/55 Parser
 *
 * `09-power-mega-max3d-family.plan.md`. Đọc 6 số chính (giữ đúng thứ tự nguồn) + 1 số
 * bonus. KHÔNG có checksum công bố trên trang (`claimedChecksums` luôn rỗng).
 *
 * Cấu trúc DOM giống Lotto535 — dùng chung {@link readHeadingPeriodAndDate} +
 * {@link readBongTronNumbers} (xem `dom-helpers.ts`).
 *
 * Selector xác nhận trên fixture thật (`test/html/power655.html`, kỳ #01392):
 * - Ngày + kỳ: `<h5>Kỳ quay thưởng <b>#01392</b> ngày <b>01/09/2026</b></h5>`.
 * - Số: `.day_so_ket_qua_v2 span.bong_tron` — 7 span (6 main + 1 bonus, ngăn cách bởi
 *   `<i>|</i>` không mang dữ liệu). 6 phần tử ĐẦU = main (giữ thứ tự nguồn), phần tử thứ 7
 *   (có thêm class `active`) = bonus.
 *
 * ⚠️ QUY ƯỚC: `numbersDisplay = [...6 main, bonus]` — bonus LUÔN ở vị trí CUỐI cùng
 * (index 6). Quy ước này ảnh hưởng trực tiếp `canonicalizeNumbers`/`checkIntrinsic`
 * (`@megawin/resultfeed/rules`) — đổi thứ tự ở đây PHẢI đồng bộ cả 2 nơi đó.
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readBongTronNumbers, readHeadingPeriodAndDate } from "./dom-helpers";

const POWER655_NUMBER_COUNT = 7;

/** Đọc 6 số chính + 1 bonus từ trang chi tiết Power 6/55 `vietlott.vn` đã cheerio-parse. */
export function parsePower655($: cheerio.CheerioAPI): ParsedObservation {
  const heading = readHeadingPeriodAndDate($);
  if (!heading) {
    assertNotUnavailable($, ResultFeedSourceId.VietlottDetail, ResultFeedGameKey.Power655);
    throw new ParseError(
      "Không tìm thấy '<h5>Kỳ quay thưởng #... ngày .../.../...' — HTML đã đổi cấu trúc.",
      ResultFeedSourceId.VietlottDetail,
      ResultFeedGameKey.Power655,
    );
  }

  const numbersDisplay = readBongTronNumbers(
    $,
    POWER655_NUMBER_COUNT,
    ResultFeedSourceId.VietlottDetail,
    ResultFeedGameKey.Power655,
  );

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    // Power 6/55 không công bố checksum trên trang chi tiết.
    claimedChecksums: {},
  };
}
