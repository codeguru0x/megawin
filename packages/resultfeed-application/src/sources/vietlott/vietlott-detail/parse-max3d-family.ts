/**
 * ResultFeed – vietlott-detail: Max3d / Max3dpro Parser
 *
 * `09-power-mega-max3d-family.plan.md`. Max3d và Max3dpro dùng chung 1 parser vì HTML
 * cấu trúc GIỐNG NHAU 100% trên cả 2 fixture đã verify (`test/html/max3d.html`,
 * `test/html/max3d-pro.html`) — chỉ khác nội dung số/kỳ, không khác class/tag nào.
 *
 * ⚠️ QUY ƯỚC ENCODE: `numbersDisplay` = 20 chuỗi "triplet" (mỗi chuỗi 3 chữ số
 * `"000"`-`"999"`, ghép từ 3 `<span class="bong_tron tiny">` liên tiếp trong CÙNG 1
 * `.day_so_ket_qua_v2`) — KHÔNG phải 60 số lẻ. Thứ tự CỐ ĐỊNH theo hạng giải trên trang:
 * Đặc biệt (2 triplet) → Nhất (4 triplet) → Nhì (6 triplet) → Ba (8 triplet) = 20 triplet.
 * Số lượng triplet mỗi hạng khai báo DUY NHẤT ở `MAX3D_TIER_COUNTS`
 * (`@megawin/resultfeed/rules` → `canonicalize.ts`) — `checkMax3dFormat`
 * (`intrinsic-check.ts`) và `canonicalizeNumbers` đều dựa vào đúng quy ước 20-triplet này.
 * Đổi encode ở đây (VD tách thành số lẻ) PHẢI đồng bộ cả 2 rule đó, KHÔNG tự sửa 1 nơi.
 *
 * Selector xác nhận trên fixture thật:
 * - Ngày + kỳ: `<h5>Kỳ quay thưởng <b>#01127</b> ngày <b>02/09/2026</b></h5>` — dùng chung
 *   {@link readHeadingPeriodAndDate}. Filter theo text "Kỳ quay thưởng" tự bỏ qua các
 *   `<h5>Giải Đặc biệt/Nhất/Nhì/Ba</h5>` khác trên trang (không match do KHÔNG chứa cụm
 *   "Kỳ quay thưởng").
 * - Số: mỗi `.day_so_ket_qua_v2` chứa ĐÚNG 3 `span.bong_tron` (1 triplet) — lấy TẤT CẢ
 *   `.day_so_ket_qua_v2` trên trang theo thứ tự DOM (đúng thứ tự hạng giải vì trang render
 *   tuần tự Đặc biệt→Nhất→Nhì→Ba), ghép text 3 span trong mỗi div thành 1 chuỗi triplet.
 *   Cố ý dùng `span.bong_tron` (class gốc, không kèm modifier `.tiny`) — lý do xem
 *   `readBongTronNumbers` JSDoc ở `dom-helpers.ts`.
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readHeadingPeriodAndDate } from "./dom-helpers";

const MAX3D_TRIPLET_COUNT = 20;
const MAX3D_SPANS_PER_TRIPLET = 3;

/** Đọc 20 triplet (Max3d/Max3dpro) từ trang chi tiết `vietlott.vn` đã cheerio-parse. */
function parseMax3dFamily(
  $: cheerio.CheerioAPI,
  gameKey: typeof ResultFeedGameKey.Max3d | typeof ResultFeedGameKey.Max3dpro,
): ParsedObservation {
  const heading = readHeadingPeriodAndDate($);
  if (!heading) {
    assertNotUnavailable($, ResultFeedSourceId.VietlottDetail, gameKey);
    throw new ParseError(
      "Không tìm thấy '<h5>Kỳ quay thưởng #... ngày .../.../...' — HTML đã đổi cấu trúc.",
      ResultFeedSourceId.VietlottDetail,
      gameKey,
    );
  }

  const tripletDivs = $(".day_so_ket_qua_v2").toArray();
  if (tripletDivs.length !== MAX3D_TRIPLET_COUNT) {
    throw new ParseError(
      `Phải có đúng ${MAX3D_TRIPLET_COUNT} '.day_so_ket_qua_v2' (1 mỗi triplet), đọc được ${tripletDivs.length} — HTML đã đổi cấu trúc.`,
      ResultFeedSourceId.VietlottDetail,
      gameKey,
    );
  }

  const numbersDisplay = tripletDivs.map((div, index) => {
    const digits = $(div)
      .find("span.bong_tron")
      .map((_, el) => $(el).text().trim())
      .toArray();
    if (digits.length !== MAX3D_SPANS_PER_TRIPLET) {
      throw new ParseError(
        `Triplet thứ ${index + 1} phải có đúng ${MAX3D_SPANS_PER_TRIPLET} chữ số, đọc được ${digits.length} — HTML đã đổi cấu trúc.`,
        ResultFeedSourceId.VietlottDetail,
        gameKey,
      );
    }
    return digits.join("");
  });

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    // Max3d/Max3dpro không công bố checksum trên trang chi tiết.
    claimedChecksums: {},
  };
}

/** Đọc 20 triplet từ trang chi tiết Max3D `vietlott.vn` đã cheerio-parse. */
export function parseMax3d($: cheerio.CheerioAPI): ParsedObservation {
  return parseMax3dFamily($, ResultFeedGameKey.Max3d);
}

/** Đọc 20 triplet từ trang chi tiết Max3D Pro `vietlott.vn` đã cheerio-parse. */
export function parseMax3dpro($: cheerio.CheerioAPI): ParsedObservation {
  return parseMax3dFamily($, ResultFeedGameKey.Max3dpro);
}
