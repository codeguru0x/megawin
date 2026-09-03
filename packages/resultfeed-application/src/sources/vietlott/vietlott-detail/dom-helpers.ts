/**
 * ResultFeed – vietlott-detail: Shared DOM Helpers (Keno + Bingo18 + Lotto535/Power655/
 * Mega645/Max3d/Max3dpro)
 *
 * Cả hai trang detail Vietlott (Keno, Bingo18) dùng CHUNG khung bảng
 * `.table-result-info` với hàng chứa `Ngày quay | Kỳ quay | Kết quả` — chỉ khác cấu trúc
 * bên trong ô "Kết quả" (`.day_so_ket_qua_v2`). Gom phần chung ở đây để 2 parser không
 * lặp lại logic đọc ngày/kỳ. 5 game còn lại (Lotto535, Power655, Mega645, Max3d, Max3dpro)
 * có cấu trúc DOM khác hẳn (không có `<tr>`, đọc kỳ+ngày từ text `<h5>Kỳ quay thưởng...`) nên
 * KHÔNG dùng `findResultRow`/`readDateAndPeriod` — thay vào đó dùng {@link readHeadingPeriodAndDate}
 * (dùng chung cho cả 5 game vì cùng pattern heading) + {@link readBongTronNumbers} (Lotto535/
 * Power655/Mega645 — vùng số DẠNG PHẲNG 1 `.day_so_ket_qua_v2` duy nhất; Max3d/Max3dpro tự đọc
 * riêng vì có NHIỀU `.day_so_ket_qua_v2` chia theo hạng giải, xem `parse-max3d-family.ts`). Cả 7
 * game đều tái dùng {@link assertNotUnavailable} (phần nhận diện "chưa có kết quả" giống nhau
 * 100% vì cùng site).
 *
 * ⚠️ Các hàm ở đây đọc DOM RIÊNG của trang `vietlott-detail` (selector `.day_so_ket_qua_v2`
 * là cấu trúc HTML của CHÍNH trang này) — KHÔNG chuyển lên `vietlott/shared/` vì site khác
 * (VD `minhchinh.com`) chắc chắn có HTML khác, dù cùng hiển thị kết quả Vietlott.
 */

import type { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type { CheerioAPI } from "cheerio";

import { ParseError, ResultUnavailableError } from "../../types";

/**
 * Nhận diện best-effort "kỳ chưa có kết quả" — quan sát thực nghiệm 2 fixture
 * `test/html/keno-detail-error.html` + `test/html/bingo-detail-error.html` (chọn kỳ quay
 * vào ngày tương lai, chưa có kết quả): trang trả về HTTP 200, GIỮ NGUYÊN khung ASP.NET
 * WebForms hợp lệ (`id="ctl00"`, `__VIEWSTATE`) — chỉ thiếu `.day_so_ket_qua_v2`, thay
 * bằng dòng text thuần "Không tìm thấy kết quả [<kỳ>]" đúng NGAY chỗ webpart kết quả lẽ ra
 * render ra. KHÔNG phải HTTP 404 như giả định cũ (`oxylabs-provider.test.ts` dùng mock, chưa
 * verify lại với case cụ thể này) — xác nhận bằng bằng chứng thật, không phải đoán.
 *
 * ⚠️ CHỈ dùng để QUYẾT ĐỊNH SEVERITY/LỊCH CHẠY (xem `fetch-and-parse.ts`), KHÔNG BAO GIỜ là
 * điều kiện duy nhất bắt buộc phải đúng — site đổi chữ bất kỳ lúc nào mà không báo trước.
 * Không khớp ⇒ `findResultRow` rơi về `ParseError` như cũ (Critical alert + backoff), an
 * toàn tuyệt đối, chỉ mất lợi ích dừng sớm vòng lặp tick.
 */
const UNAVAILABLE_MARKERS: readonly RegExp[] = [/không\s*tìm\s*thấy\s*kết\s*quả/i, /chưa\s*có\s*kết\s*quả/i];

/**
 * `true` nếu trang vẫn còn khung ASP.NET WebForms hợp lệ của vietlott-detail (không phải
 * trang lỗi hạ tầng/redirect/maintenance khác hẳn) — điều kiện cần để tin vào
 * {@link UNAVAILABLE_MARKERS}, tránh nhận nhầm 1 trang lỗi bất kỳ khác thành "chưa có kết quả".
 */
function looksLikeVietlottDetailShell($: CheerioAPI): boolean {
  return $("form#ctl00").length > 0 && $("#__VIEWSTATE").length > 0;
}

/**
 * Throw {@link ResultUnavailableError} khi trang vẫn còn khung WebForms hợp lệ + có text
 * "chưa có kết quả" (best-effort, xem {@link UNAVAILABLE_MARKERS}) — dùng chung cho MỌI
 * parser trang detail (Keno/Bingo18 qua `findResultRow`, Lotto535 qua `parse-lotto535.ts`
 * — cấu trúc DOM phần kết quả khác hẳn nhau nên không dùng chung `findResultRow`, nhưng
 * phần nhận diện "chưa có kết quả" giống nhau 100% vì đều là cùng 1 site). KHÔNG throw gì
 * nếu không khớp — caller tự throw {@link ParseError} phù hợp với ngữ cảnh của mình.
 */
export function assertNotUnavailable($: CheerioAPI, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey): void {
  if (looksLikeVietlottDetailShell($) && UNAVAILABLE_MARKERS.some((re) => re.test($("body").text()))) {
    throw new ResultUnavailableError(
      "Trang vietlott-detail báo 'Không tìm thấy kết quả' — kỳ chưa có kết quả (bình thường, không phải lỗi).",
      sourceId,
      gameKey,
    );
  }
}

/** `"31/08/2026"` → `"2026-08-31"`. Throw {@link ParseError} nếu không đúng format DD/MM/YYYY. */
export function convertVnDateToIso(vnDate: string, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vnDate);
  if (!match) {
    throw new ParseError(`Ngày quay "${vnDate}" không đúng format DD/MM/YYYY.`, sourceId, gameKey);
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/** `"#0294026"` → `"0294026"`. Throw {@link ParseError} nếu không phải 7 chữ số sau khi bỏ `#`. */
export function extractPeriod(periodText: string, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey): string {
  const digits = periodText.replace(/[^0-9]/g, "");
  if (!/^\d{7}$/.test(digits)) {
    throw new ParseError(`Kỳ quay "${periodText}" không phải 7 chữ số.`, sourceId, gameKey);
  }
  return digits;
}

/**
 * Tìm hàng `<tr>` chứa ô "Kết quả" (`.day_so_ket_qua_v2`) — hàng này LUÔN có cấu trúc
 * `[Ngày quay, Kỳ quay, Kết quả]` cho cả Keno và Bingo18.
 *
 * Throw {@link ResultUnavailableError} (best-effort, xem {@link UNAVAILABLE_MARKERS}) khi
 * trang vẫn còn khung WebForms hợp lệ + có text "chưa có kết quả" — kỳ CHƯA quay, KHÔNG
 * phải lỗi. Throw {@link ParseError} cho MỌI trường hợp còn lại (HTML đổi cấu trúc, trang
 * lỗi khác, hoặc marker không khớp) — giữ nguyên hành vi cũ, an toàn khi site đổi chữ.
 */
export function findResultRow($: CheerioAPI, sourceId: ResultFeedSourceId, gameKey: ResultFeedGameKey) {
  const resultCell = $(".day_so_ket_qua_v2").first();
  if (resultCell.length === 0) {
    assertNotUnavailable($, sourceId, gameKey);
    throw new ParseError(
      "Không tìm thấy '.day_so_ket_qua_v2' — trang không phải trang chi tiết kết quả hoặc HTML đã đổi cấu trúc.",
      sourceId,
      gameKey,
    );
  }
  const row = resultCell.closest("tr");
  if (row.length === 0) {
    throw new ParseError(
      "'.day_so_ket_qua_v2' không nằm trong hàng <tr> nào — HTML đã đổi cấu trúc.",
      sourceId,
      gameKey,
    );
  }
  return row;
}

/** Đọc "Ngày quay" + "Kỳ quay" từ hàng kết quả — 2 ô đầu, chung cho Keno và Bingo18. */
export function readDateAndPeriod(
  $: CheerioAPI,
  row: ReturnType<typeof findResultRow>,
  sourceId: ResultFeedSourceId,
  gameKey: ResultFeedGameKey,
): { drawDateSource: string; drawPeriod: string } {
  const cells = row.find("td");
  const dateText = $(cells.get(0)).text().trim();
  const periodText = $(cells.get(1)).text().trim();
  return {
    drawDateSource: convertVnDateToIso(dateText, sourceId, gameKey),
    drawPeriod: extractPeriod(periodText, sourceId, gameKey),
  };
}

/**
 * `"Kỳ quay thưởng #01392 ngày 01/09/2026"` → kỳ 5 chữ số + ngày ISO. Dùng chung cho
 * Lotto535/Power655/Mega645/Max3d/Max3dpro — 5 game này KHÔNG nằm trong `<tr><td>` như
 * Keno/Bingo18, mà đọc từ text 1 thẻ `<h5>` (xem `findResultRow`/`readDateAndPeriod` ở trên
 * cho Keno/Bingo18, khác hẳn).
 *
 * Cố ý chọn selector text-based ("Kỳ quay thưởng" + regex `#NNNNN ngày DD/MM/YYYY") thay vì
 * đường dẫn CSS/DOM cụ thể (VD `nth-child`) — text hiển thị cho người dùng ít khả năng đổi
 * hơn cấu trúc HTML/class nội bộ khi site redesign, và filter theo text "Kỳ quay thưởng" tự
 * bỏ qua các `<h5>` khác trên trang (Max3d/Max3dpro có thêm `<h5>Giải Đặc biệt</h5>` v.v.).
 */
const HEADING_PERIOD_DATE_PATTERN = /#(\d{5})\s*ng[àa]y\s*(\d{2})\/(\d{2})\/(\d{4})/i;

/**
 * Trả `null` (KHÔNG throw) khi không khớp — caller tự quyết định gọi {@link assertNotUnavailable}
 * trước khi throw `ParseError` phù hợp ngữ cảnh của mình, vì trang "chưa có kết quả" cũng
 * không có `<h5>Kỳ quay thưởng...</h5>` này (giống lý do `findResultRow` gọi
 * `assertNotUnavailable` trước khi throw).
 */
export function readHeadingPeriodAndDate($: CheerioAPI): { drawPeriod: string; drawDateSource: string } | null {
  const heading = $("h5")
    .filter((_, el) => /Kỳ quay thưởng/i.test($(el).text()))
    .first();
  const headingText = heading.text().replace(/\s+/g, " ").trim();
  const match = HEADING_PERIOD_DATE_PATTERN.exec(headingText);
  if (!match) {
    return null;
  }
  const [, drawPeriod, dd, mm, yyyy] = match;
  if (drawPeriod === undefined || dd === undefined || mm === undefined || yyyy === undefined) {
    return null;
  }
  return { drawPeriod, drawDateSource: `${yyyy}-${mm}-${dd}` };
}

/**
 * Đọc số từ vùng kết quả DẠNG PHẲNG (1 `.day_so_ket_qua_v2` DUY NHẤT chứa TẤT CẢ số) —
 * dùng cho Lotto535 (5 main + 1 đặc biệt), Power655 (6 main + 1 bonus), Mega645 (6 số).
 * KHÔNG dùng cho Max3d/Max3dpro — 2 game đó có NHIỀU `.day_so_ket_qua_v2` (1 mỗi bộ ba)
 * chia theo 4 hạng giải, cần giữ ranh giới hạng (xem `parse-max3d-family.ts`).
 *
 * Cố ý chọn selector `span.bong_tron` (class GỐC, không kèm modifier kích thước
 * `.small`/`.tiny`) — 3 game trên đều dùng modifier `.small`/không class phụ khác nhau
 * (Lotto535/Power655: `bong_tron small`, Mega645: `bong_tron` trần), nhưng `bong_tron`
 * là class NGỮ NGHĨA "1 quả cầu số" xuất hiện xuyên suốt mọi trang kết quả Vietlott —
 * ít khả năng đổi hơn modifier kích thước (vốn chỉ phục vụ CSS responsive).
 *
 * Trả nguyên `numbersDisplay` theo THỨ TỰ nguồn (main trước, đặc biệt/bonus cuối nếu có)
 * — KHÔNG sort, việc sort main là của `canonicalizeNumbers` (rule layer).
 */
export function readBongTronNumbers(
  $: CheerioAPI,
  expectedCount: number,
  sourceId: ResultFeedSourceId,
  gameKey: ResultFeedGameKey,
): string[] {
  const numbers = $(".day_so_ket_qua_v2 span.bong_tron")
    .map((_, el) => $(el).text().trim())
    .toArray();
  if (numbers.length !== expectedCount) {
    throw new ParseError(
      `'.day_so_ket_qua_v2' phải có đúng ${expectedCount} số, đọc được ${numbers.length} — HTML đã đổi cấu trúc.`,
      sourceId,
      gameKey,
    );
  }
  return numbers;
}

/**
 * Nhiễu ASP.NET WebForms/Vietlott ĐỔI GIÁ TRỊ Ở MỌI LẦN RENDER — không liên quan gì tới dữ
 * liệu kết quả xổ số. Bằng chứng thật (đối chiếu 4 fixture `test/html/keno.html`,
 * `test/html/keno-detail-error.html`, `test/html/bingo18.html`,
 * `test/html/bingo-detail-error.html`): `__VIEWSTATE` khác nhau ở CẢ 4 file — framework mã
 * hoá lại state mỗi lần render, không phải cache-buster theo dữ liệu hiển thị. Riêng
 * `keno.html` còn có debug div "Content load/save ... catche at DD/MM/YYYY HH:mm:ss" — thời
 * điểm SERVER RENDER trang, không phải dữ liệu kỳ quay.
 *
 * `[A-Z]*` sau `__VIEWSTATE` bắt CẢ `__VIEWSTATE` và `__VIEWSTATEGENERATOR` bằng 1 pattern
 * (input hiện tại luôn theo cặp, xem fixture).
 */
const VOLATILE_WEBFORMS_PATTERNS: readonly RegExp[] = [
  /<input[^>]*\bname="__VIEWSTATE[A-Z]*"[^>]*\/?>/gi,
  /<input[^>]*\bname="__EVENTVALIDATION"[^>]*\/?>/gi,
  /catche at \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/gi,
];

/**
 * Chuẩn hoá bytes CHỈ ĐỂ TÍNH `contentHash` (`fetch-and-parse.ts` bước 4, qua
 * `SourceAdapter.normalizeForHash`) — KHÔNG áp dụng cho bytes LƯU (`SubmissionDoc.bodyGz`
 * vẫn nguyên văn, xem quy tắc "không normalize trước khi lưu" ở `submission.ts`).
 *
 * VÌ SAO CẦN: Keno bắt buộc `nocatche` biến thiên (xem `urls.ts`) để bypass cache Vietlott
 * và lấy dữ liệu real-time — nghĩa là site RE-RENDER trang mỗi lần fetch, sinh
 * `__VIEWSTATE`/`__EVENTVALIDATION` MỚI dù kỳ quay/số kết quả không đổi. Hash trên bytes
 * nguyên văn khiến `contentHash` KHÔNG BAO GIỜ trùng giữa 2 lần fetch của Keno — dù cùng 1
 * kỳ, cùng 1 kết quả — vô hiệu hoá dedup `{sourceId, contentHash}` VÀ tín hiệu "site trả
 * cùng 1 trang lỗi liên tục" (`seenCount`, xem `submission.ts`). 6 game còn lại dùng
 * `nocatche=1`, được Vietlott trả từ cache (bytes cache giữ nguyên `__VIEWSTATE` cũ) nên
 * dedup vẫn hoạt động bình thường mà không cần hàm này — áp dụng chung cho cả 7 game ở đây
 * chỉ để phòng hờ lúc cache miss/hết hạn, không đổi hành vi đang đúng của 6 game đó.
 */
export function normalizeVietlottDetailForHash(body: Buffer): Buffer {
  let html = body.toString("utf-8");
  for (const pattern of VOLATILE_WEBFORMS_PATTERNS) {
    html = html.replace(pattern, "");
  }
  return Buffer.from(html, "utf-8");
}
