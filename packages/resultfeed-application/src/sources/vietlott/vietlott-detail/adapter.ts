/**
 * ResultFeed – vietlott-detail Source Adapter
 *
 * `02-fetch-parse.plan.md §2.2` + `09-power-mega-max3d-family.plan.md`. Site đầu tiên:
 * trang chi tiết kết quả Keno + Bingo18 + Lotto 5/35 + Power 6/55 + Mega 6/45 + Max3D +
 * Max3D Pro trên `vietlott.vn`. Site KHÔNG biết site khác — mọi thứ site này cần đều nằm
 * trong `vietlott/vietlott-detail/` (`./urls.ts`, `./dom-helpers.ts`, `./parse-keno.ts`,
 * `./parse-bingo18.ts`, `./parse-lotto535.ts`, `./parse-power655.ts`, `./parse-mega645.ts`,
 * `./parse-max3d-family.ts`), CỘNG với phần dùng chung cho MỌI site hiển thị kết quả
 * Vietlott (VD `minhchinh.com` sau này) ở `vietlott/shared/` (nhãn checksum tiếng Việt
 * chính chủ).
 *
 * ⚠️ Bằng chứng thật đã quan sát (không phải giả định): fixture `test/html/keno.html` được
 * lấy KHÔNG kèm `nocatche` biến thiên và trang trả về mang debug marker
 * `Content load from disk data catche` — tức Vietlott ĐÃ trả trang cache. Fixture
 * `test/html/bingo18.html` lấy CÓ `nocatche=1` và mang marker `NO CATCHE`. Đây là xác nhận
 * thực nghiệm cho quy tắc plan §2.2: `nocatche` phải LUÔN có giá trị biến thiên.
 */

import type { SourceCursorEntity } from "@megawin/resultfeed/entities";
import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { incrementPeriod } from "@megawin/resultfeed/rules";
import * as cheerio from "cheerio";

import type { FetchPlan, ParsedObservation, SourceAdapter } from "../../types";
import { ParseError, parsedObservationSchema } from "../../types";
import { normalizeVietlottDetailForHash } from "./dom-helpers";
import { parseBingo18 } from "./parse-bingo18";
import { parseKeno } from "./parse-keno";
import { parseLotto535 } from "./parse-lotto535";
import { parseMax3d, parseMax3dpro } from "./parse-max3d-family";
import { parseMega645 } from "./parse-mega645";
import { parsePower655 } from "./parse-power655";
import { buildDetailUrl } from "./urls";

/**
 * Bump khi sửa selector trong bất kỳ `parse-*.ts` nào của adapter này. Fixture cũ giữ
 * lại.
 */
const PARSER_VERSION = "1.0.0";

export const vietlottDetailAdapter: SourceAdapter = {
  sourceId: ResultFeedSourceId.VietlottDetail,
  parserVersion: PARSER_VERSION,
  gameKeys: [
    ResultFeedGameKey.Keno,
    ResultFeedGameKey.Bingo18,
    ResultFeedGameKey.Lotto535,
    ResultFeedGameKey.Power655,
    ResultFeedGameKey.Mega645,
    ResultFeedGameKey.Max3d,
    ResultFeedGameKey.Max3dpro,
  ],

  /**
   * Dựng request cho kỳ KẾ TIẾP dựa trên `cursor.lastConfirmedPeriod` — kỳ gần nhất đã
   * xác nhận thành công. Zero-pad width của kỳ mới LUÔN lấy từ chính độ dài chuỗi đang
   * lưu trong cursor (qua `incrementPeriod`, `@megawin/resultfeed/rules`), KHÔNG hardcode
   * số cố định (VD `7` của Keno/Bingo18) — nguồn khác trong tương lai có thể dùng độ dài
   * khác. Throw nếu cursor chưa từng neo (`lastConfirmedPeriod === null`) — trường hợp đó
   * là cold start, outcome `awaiting_seed` (xem `fetch-and-parse.ts`), không đi qua đây.
   */
  planNextFetch(input: { gameKey: ResultFeedGameKey; cursor: SourceCursorEntity }): FetchPlan {
    const { gameKey, cursor } = input;
    if (cursor.lastConfirmedPeriod === null) {
      throw new Error(
        `vietlott-detail.planNextFetch: cursor chưa có lastConfirmedPeriod (gameKey=${gameKey}). Cần seedAnchor trước.`,
      );
    }
    const nextPeriod = incrementPeriod(cursor.lastConfirmedPeriod);
    return {
      url: buildDetailUrl(gameKey, nextPeriod, Date.now()),
      expectedPeriod: nextPeriod,
      render: false,
    };
  },

  /**
   * Đọc `body` (bytes HTML nguyên văn) → {@link ParsedObservation}. Chọn parser theo
   * `gameKey` (mỗi game có cấu trúc DOM riêng — xem các file `parse-*.ts`), sau đó validate
   * HÌNH THỨC output bằng `parsedObservationSchema` (`@megawin/resultfeed-application/sources`
   * → `./types.ts`) trước khi trả về — đây là lớp phòng thủ cuối, bắt được ngay khi parser
   * đọc lệch selector/lệch cột trả ra chuỗi rỗng hoặc rác thay vì throw `ParseError` rõ
   * ràng. Lỗi validate (Zod) được wrap lại thành `ParseError` để tầng orchestration xử lý
   * thống nhất 1 loại lỗi duy nhất.
   */
  parse(input: { gameKey: ResultFeedGameKey; body: Buffer; contentType: string }): ParsedObservation {
    const { gameKey, body } = input;
    const html = body.toString("utf-8");
    const $ = cheerio.load(html);

    const parsed = (() => {
      switch (gameKey) {
        case ResultFeedGameKey.Keno: {
          return parseKeno($);
        }
        case ResultFeedGameKey.Bingo18: {
          return parseBingo18($);
        }
        case ResultFeedGameKey.Lotto535: {
          return parseLotto535($);
        }
        case ResultFeedGameKey.Power655: {
          return parsePower655($);
        }
        case ResultFeedGameKey.Mega645: {
          return parseMega645($);
        }
        case ResultFeedGameKey.Max3d: {
          return parseMax3d($);
        }
        case ResultFeedGameKey.Max3dpro: {
          return parseMax3dpro($);
        }
        default: {
          const _exhaustive: never = gameKey;
          throw new ParseError(
            `vietlott-detail không phục vụ gameKey "${_exhaustive}".`,
            ResultFeedSourceId.VietlottDetail,
            gameKey,
          );
        }
      }
    })();

    const validation = parsedObservationSchema.safeParse(parsed);
    if (!validation.success) {
      throw new ParseError(
        `vietlott-detail: output parse() không hợp lệ — ${validation.error.message}`,
        ResultFeedSourceId.VietlottDetail,
        gameKey,
      );
    }

    return parsed;
  },

  /**
   * Strip nhiễu ASP.NET WebForms (`__VIEWSTATE`/`__EVENTVALIDATION`/debug "catche at ...")
   * TRƯỚC khi tính `contentHash` — xem JSDoc {@link normalizeVietlottDetailForHash} cho lý
   * do đầy đủ. Bytes LƯU (`bodyGz`) không đi qua hàm này, vẫn nguyên văn.
   */
  normalizeForHash: normalizeVietlottDetailForHash,
};
