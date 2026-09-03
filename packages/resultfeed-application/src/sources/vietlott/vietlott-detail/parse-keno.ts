/**
 * ResultFeed – vietlott-detail: Keno Parser
 *
 * `02-fetch-parse.plan.md §2.2`. Đọc 20 số (giữ nguyên thứ tự nguồn, KHÔNG sort — sort là
 * việc của `canonicalizeNumbers`) + 4 checksum nguồn tự công bố (CHẴN/LẺ/LỚN/NHỎ).
 *
 * Selector xác nhận trên fixture thật (`test/html/keno.html`, kỳ #0294026):
 * - Số: `.day_so_ket_qua_v2 span.bong_tron` (20 span, text zero-padded `"02"`..`"80"`).
 * - Checksum: mỗi ô nhãn (`CHẴN`/`LẺ`/`LỚN`/`NHỎ`) đứng NGAY TRƯỚC ô giá trị trong cùng
 *   `<tr>` — đọc bằng text nhãn thay vì dựa style inline (style là thứ dễ đổi nhất).
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { KENO_CHECKSUM_LABELS } from "../shared";
import { findResultRow, readDateAndPeriod } from "./dom-helpers";

/** Đọc 20 số + 4 checksum từ trang chi tiết Keno `vietlott.vn` đã cheerio-parse. */
export function parseKeno($: cheerio.CheerioAPI): ParsedObservation {
  const row = findResultRow($, ResultFeedSourceId.VietlottDetail, ResultFeedGameKey.Keno);
  const { drawDateSource, drawPeriod } = readDateAndPeriod(
    $,
    row,
    ResultFeedSourceId.VietlottDetail,
    ResultFeedGameKey.Keno,
  );

  // Đọc ĐÚNG thứ tự DOM — không sort. `bong_tron` (không kèm `_bingo`) chỉ xuất hiện ở
  // trang Keno, không đụng selector `bong_tron_bingo` của Bingo18.
  const numbersDisplay = row
    .find(".day_so_ket_qua_v2 span.bong_tron")
    .map((_, el) => $(el).text().trim())
    .toArray();

  // Mỗi ô nhãn (CHẴN/LẺ/LỚN/NHỎ) đứng NGAY TRƯỚC ô giá trị trong cùng <tr> — quét toàn bộ
  // <td> của trang, chỉ giữ lại những ô có text khớp nhãn đã biết.
  const claimedChecksums: Record<string, string | number> = {};
  $("td").each((_, el) => {
    const label = $(el).text().trim();
    const key = KENO_CHECKSUM_LABELS[label];
    if (!key) {
      return;
    }
    const valueText = $(el).next("td").text().trim();
    const value = Number(valueText);
    if (!Number.isNaN(value)) {
      claimedChecksums[key] = value;
    }
  });

  return {
    drawPeriod,
    drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    claimedChecksums,
  };
}
