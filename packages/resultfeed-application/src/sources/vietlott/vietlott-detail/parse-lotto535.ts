/**
 * ResultFeed – vietlott-detail: Lotto 5/35 Parser
 *
 * `05-lotto535-and-schedule.plan.md §3`. Đọc 5 số chính (giữ đúng thứ tự nguồn, KHÔNG sort
 * — sort riêng main/đặc biệt là việc của `canonicalizeNumbers`) + 1 số đặc biệt. KHÔNG có
 * checksum công bố trên trang (`claimedChecksums` luôn rỗng).
 *
 * Cấu trúc DOM KHÁC HẲN Keno/Bingo18 — không nằm trong `<tr>`, không dùng
 * `findResultRow`/`readDateAndPeriod` của `dom-helpers.ts`. Dùng chung
 * {@link readHeadingPeriodAndDate} (đọc kỳ+ngày từ `<h5>Kỳ quay thưởng...`) và
 * {@link readBongTronNumbers} (đọc số từ `.day_so_ket_qua_v2`) với Power655/Mega645 — cùng
 * `assertNotUnavailable` cho case "chưa có kết quả" vì cùng site.
 *
 * Selector xác nhận trên fixture thật (`test/html/lotto535.html`, kỳ #00860):
 * - Ngày + kỳ: `<h5>Kỳ quay thưởng <b>#00860</b> ngày <b>01/09/2026</b></h5>`.
 * - Số: `.day_so_ket_qua_v2 span.bong_tron` — 6 span liên tiếp (5 main + 1 đặc biệt, ngăn
 *   cách bởi `<i>|</i>` không mang dữ liệu). 5 phần tử ĐẦU = main (giữ thứ tự nguồn), phần
 *   tử thứ 6 = số đặc biệt.
 *
 * ⚠️ QUY ƯỚC: `numbersDisplay = [...5 main, special]` — số đặc biệt LUÔN ở vị trí CUỐI
 * cùng (index 5). Quy ước này ảnh hưởng trực tiếp `canonicalizeNumbers`/`checkIntrinsic`
 * (`@megawin/resultfeed/rules`) — đổi thứ tự ở đây PHẢI đồng bộ cả 2 nơi đó.
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readBongTronNumbers, readHeadingPeriodAndDate } from "./dom-helpers";

const LOTTO535_NUMBER_COUNT = 6;

/** Đọc 5 số chính + 1 số đặc biệt từ trang chi tiết Lotto 5/35 `vietlott.vn` đã cheerio-parse. */
export function parseLotto535($: cheerio.CheerioAPI): ParsedObservation {
  const heading = readHeadingPeriodAndDate($);
  if (!heading) {
    // Không đọc được kỳ/ngày — trước khi kết luận HTML đổi cấu trúc, kiểm tra xem có phải
    // trang "chưa có kết quả" hay không (site vẫn giữ khung hợp lệ, chỉ thiếu nội dung).
    assertNotUnavailable($, ResultFeedSourceId.VietlottDetail, ResultFeedGameKey.Lotto535);
    throw new ParseError(
      "Không tìm thấy '<h5>Kỳ quay thưởng #... ngày .../.../...' — HTML đã đổi cấu trúc.",
      ResultFeedSourceId.VietlottDetail,
      ResultFeedGameKey.Lotto535,
    );
  }

  const numbersDisplay = readBongTronNumbers(
    $,
    LOTTO535_NUMBER_COUNT,
    ResultFeedSourceId.VietlottDetail,
    ResultFeedGameKey.Lotto535,
  );

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    // Lotto 5/35 không công bố checksum (chẵn/lẻ/lớn/nhỏ) trên trang chi tiết.
    claimedChecksums: {},
  };
}
