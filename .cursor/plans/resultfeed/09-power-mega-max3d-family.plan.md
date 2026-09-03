---
name: ""
overview: ""
todos: []
isProject: false
---

# ResultFeed — Thêm Power 6/55, Mega 6/45, Max3D, Max3D Pro (fetch sống)

## Bối cảnh & phạm vi

4 game này đã có trong `ResultFeedGameKey` (Mega645, Power655, Max3d, Max3dpro) và đã chạy được
qua `historical-import` (JSONL) — `canonicalizeNumbers`, `checkIntrinsic` (format-only), và
`parseMax3dRow`/`parseSimpleNumbersRow` đã tồn tại và đã test. Phần **CHƯA làm** là fetch SỐNG
qua `vietlott-detail` (site `vietlott.vn`) — hiện `buildDetailUrl`/`adapter.parse()` throw lỗi
tường minh cho 4 gameKey này ("chỉ nạp qua historical-import").

User đã cung cấp fixture HTML thật (lấy qua Oxylabs) cho cả 2 nhánh (có kết quả / chưa có kết quả)
của cả 4 game:

| Game | Có kết quả | Chưa có kết quả | URL pattern |
|---|---|---|---|
| Power 6/55 | `test/html/power655.html` (#01392) | `test/html/power655-detail-error.html` (#01396) | `.../655?id={period}&nocatche=1` |
| Mega 6/45 | `test/html/mega645.html` (#01557) | `test/html/mega645-detail-error.html` (#01887) | `.../645?id={period}&nocatche=1` |
| Max3D | `test/html/max3d.html` (#01127) | `test/html/max3d-detail-error.html` | `.../max-3D?id={period}&nocatche=1` |
| Max3D Pro | `test/html/max3d-pro.html` (#00773) | `test/html/max3d-pro-detail-error.html` | `.../max-3DPro?id={period}&nocatche=1` |

Plan này làm **fetch sống end-to-end** cho cả 4 game, theo đúng khuôn đã dựng cho Lotto535
(`05-lotto535-and-schedule.plan.md`) — KHÔNG lặp lại backfill lịch sử (đã có qua
`import-historical-results.ts` + `seed-cursors-from-latest.ts`, chạy trước khi enable fetch sống).

## Việc KHÔNG làm (out of scope)

- Backfill lịch sử — đã xong ở `06-historical-import.plan.md`.
- Đổi `canonicalizeNumbers`/`checkIntrinsic`/`MAX3D_TIER_COUNTS` — đã đúng, chỉ tái dùng.
- Đổi `parseMax3dRow`/`parseSimpleNumbersRow` (historical-import parsers) — đây là parser JSONL
  riêng, KHÔNG dùng cho fetch sống (fetch sống parse HTML, tự viết parser HTML riêng theo mục 3).

## 1. Bằng chứng thật đã xác nhận từ fixture (đọc trực tiếp HTML, không suy đoán)

### 1.1. Heading ngày + kỳ — GIỐNG NHAU cho cả 4 game, GIỐNG Lotto535

Cả 4 fixture (`power655.html`, `mega645.html`, `max3d.html`, `max3d-pro.html`) đều có:

```html
<h5>Kỳ quay thưởng <b>#01392</b> ngày <b>01/09/2026</b></h5>
```

Cùng pattern `#(\d{5})\s*ngày\s*(\d{2})/(\d{2})/(\d{4})` đã dùng cho Lotto535
(`parse-lotto535.ts` → `HEADING_PATTERN`) — kỳ 5 chữ số, KHÔNG phải 7 chữ số như Keno/Bingo18.
Với Max3D/Max3D Pro, trang có THÊM nhiều `<h5>` khác ("Giải Đặc biệt", "Giải Nhất"...) — phải
filter theo text chứa "Kỳ quay thưởng" trước khi regex (đúng cách `parse-lotto535.ts` đang làm,
tái dùng được nguyên vẹn).

**Quyết định thiết kế**: tách logic đọc heading này ra `dom-helpers.ts` thành 1 helper dùng
CHUNG cho 5 game (Lotto535 + 4 game mới) — xem mục 3.1. Tránh lặp lại y nguyên 1 block regex ở
5 file parser khác nhau (vi phạm DRY, `code-quality-standards.mdc §5`).

### 1.2. Vùng số kết quả — 3 shape khác nhau

**Power 6/55** — giống Lotto535 100% (chỉ đổi 5→6 main):

```html
<div class="day_so_ket_qua_v2">
  <span class="bong_tron small">01</span><span class="bong_tron small">17</span>
  <span class="bong_tron small">41</span><span class="bong_tron small">44</span>
  <span class="bong_tron small">49</span><span class="bong_tron small">55</span>
  <i>|</i><span class="bong_tron small no-margin-right active">45</span>
</div>
```

7 span `.bong_tron` liên tiếp: 6 main (giữ thứ tự nguồn) + 1 bonus (element cuối, có thêm class
`active`) — `<i>|</i>` không mang dữ liệu, tự động bị bỏ qua vì không phải `span`.

**Mega 6/45** — 6 số phẳng, KHÔNG có bonus, KHÔNG có class `small`:

```html
<div class="day_so_ket_qua_v2">
  <span class="bong_tron">06</span><span class="bong_tron">09</span>
  <span class="bong_tron">27</span><span class="bong_tron">29</span>
  <span class="bong_tron">35</span><span class="bong_tron no-margin-right">44</span>
</div>
```

⚠️ Vì Mega645 KHÔNG có class `small`, selector PHẢI dùng base class `span.bong_tron` (KHÔNG
`span.bong_tron.small` như Lotto535/Power655) — nếu bắt buộc `.small` sẽ đọc được 0 phần tử
cho Mega645. Dùng `.day_so_ket_qua_v2 span.bong_tron` (base class) là selector TỔNG QUÁT đúng
cho cả Lotto535/Power655/Mega645 (class `small` chỉ là modifier thêm, không ảnh hưởng CSS class
selector — `span.bong_tron` khớp bất kể có thêm class nào khác).

**Max3D / Max3D Pro** — cấu trúc KHÁC HẲN, 20 triplet chia 4 hạng giải, ĐÚNG
`MAX3D_TIER_COUNTS = [2, 4, 6, 8]` đã định nghĩa sẵn ở `@megawin/resultfeed/rules`:

```html
<div class="tong_day_so_ket_qua text-center">
  <div class="row">
    <h5>Giải Đặc biệt</h5>
    <div class="col-xs-6 padding_2"><div class="day_so_ket_qua_v2">
      <span class="bong_tron tiny">3</span><span class="bong_tron tiny">6</span><span class="bong_tron tiny">7</span>
    </div></div>
    <div class="col-xs-6 padding_2"><div class="day_so_ket_qua_v2">
      <span class="bong_tron tiny">0</span><span class="bong_tron tiny">1</span><span class="bong_tron tiny no-margin-right">8</span>
    </div></div>
    <!-- ... "Giải Nhất" × 4 div, "Giải Nhì" × 6 div, "Giải Ba" × 8 div, mỗi div 3 span ... -->
  </div>
</div>
```

Xác nhận bằng `rg -oP` trên cả 2 fixture (`max3d.html`, `max3d-pro.html`): tổng cộng đúng
2+4+6+8 = 20 div `.day_so_ket_qua_v2` (một số có `class="day_so_ket_qua_v2 "` — dư space cuối,
cheerio parse class attribute không quan tâm whitespace, selector vẫn khớp bình thường), mỗi
div đúng 3 span `.bong_tron.tiny` (chữ số đơn, PHẢI join lại thành chuỗi 3 ký tự, KHÔNG parse
thành number — số có leading zero như "0","1","8" → "018" sẽ mất zero nếu convert qua Number).
Thứ tự DOM đúng khớp `MAX3D_TIER_COUNTS`/`MAX3D_TIER_KEYS` (Đặc biệt → Nhất → Nhì → Ba) — CÙNG
quy ước `historical-import/parse-max3d.ts` đang dùng cho JSONL, không lệch offset.

Trang Max3D/Max3D Pro KHÔNG có panel `.day_so_ket_qua_v2` nào khác ngoài `.tong_day_so_ket_qua`
— scope selector `.tong_day_so_ket_qua .day_so_ket_qua_v2` để tường minh, tránh vô tình khớp
phần tử khác nếu site thêm section mới sau này.

### 1.3. Trang "chưa có kết quả" — 2 marker khác nhau, CẢ HAI đã khớp `UNAVAILABLE_MARKERS` hiện có

- Power655 (`power655-detail-error.html`, #01396) và Mega645 (`mega645-detail-error.html`,
  #01887): text thuần `"Không tìm thấy kết quả [01396]"` / `"...[01887]"` — khớp regex
  `/không\s*tìm\s*thấy\s*kết\s*quả/i` đã có trong `dom-helpers.ts` (giống Keno/Bingo18/Lotto535).
- Max3D (`max3d-detail-error.html`) và Max3D Pro (`max3d-pro-detail-error.html`): text
  `"MAX3D CHƯA CÓ KẾT QUẢ KỲ QUAY NÀO. VUI LÒNG QUAY LẠI SAU"` /
  `"MAX 3D PRO CHƯA CÓ KẾT QUẢ KỲ QUAY NÀO..."` — khớp regex `/chưa\s*có\s*kết\s*quả/i` (branch
  thứ 2 của `UNAVAILABLE_MARKERS`, đã tồn tại từ trước dù chưa có game nào dùng tới branch này).

Cả 4 fixture lỗi đều giữ khung `form#ctl00` + `#__VIEWSTATE` hợp lệ (xác nhận qua cùng cấu trúc
ASP.NET WebForms như mọi trang `vietlott-detail` khác) ⇒ `assertNotUnavailable` tái dùng được
NGUYÊN VẸN, không cần sửa `dom-helpers.ts` phần này.

### 1.4. Lịch quay cố định theo ngày trong tuần — đọc từ footer fixture + ảnh chụp UI

| Game | Giờ quay | Ngày quay | `drawDaysOfWeek` (`0`=CN...`6`=T7) |
|---|---|---|---|
| Power 6/55 | 18h00–18h30 | Thứ 3 - Thứ 5 - Thứ 7 | `[2, 4, 6]` |
| Mega 6/45 | 18h00–18h30 | Thứ 4 - Thứ 6 - Chủ nhật | `[3, 5, 0]` |
| Max3D | 18h00–18h30 | Thứ 2 - Thứ 4 - Thứ 6 | `[1, 3, 5]` |
| Max3D Pro | 18h00–18h30 | Thứ 3 - Thứ 5 - Thứ 7 | `[2, 4, 6]` |

Xác nhận Max3D Pro qua `rg` trên fixture (footer text `"Thứ 3 - Thứ 5 - Thứ 7"`) — không suy
đoán từ Power655 dù trùng ngày. `drawTimesVn: ["18:00"]` cho cả 4 game (đúng tiền lệ đã ghi ở
`05-lotto535-and-schedule.plan.md §2` khi thiết kế `GameFetchSchedule.drawDaysOfWeek` — file đó
đã tính trước tham số cho Power655/Mega645, giờ áp dụng đúng như dự tính, thêm Max3D/Max3D Pro
theo cùng khuôn).

## 2. URL builder — `urls.ts`

`buildDetailUrl`: thay 4 nhánh throw hiện tại bằng URL thật, theo path xác nhận ở mục 1 (đối
chiếu link user cung cấp — `655?id=`, `645?id=`, `max-3D?id=`, `max-3DPro?id=` — và cùng
`nocatche=1` cố định như Bingo18/Lotto535, KHÔNG theo timestamp như Keno):

```typescript
case ResultFeedGameKey.Power655: {
  return `${BASE_URL}/655?id=${period}&nocatche=1`;
}
case ResultFeedGameKey.Mega645: {
  return `${BASE_URL}/645?id=${period}&nocatche=1`;
}
case ResultFeedGameKey.Max3d: {
  return `${BASE_URL}/max-3D?id=${period}&nocatche=1`;
}
case ResultFeedGameKey.Max3dpro: {
  return `${BASE_URL}/max-3DPro?id=${period}&nocatche=1`;
}
```

⚠️ Giữ đúng casing từ link user cung cấp (`max-3D`, `max-3DPro` — chữ D hoa, Pro có P hoa) — site
ASP.NET route có thể case-sensitive tuỳ config server, không tự "chuẩn hoá" thành lowercase.

Xoá đoạn comment "Chỉ nạp qua historical-import..." ở JSDoc đầu file (mục "now chỉ áp dụng cho
Keno") — cập nhật để phản ánh đúng: giờ cả 7 game đều có URL fetch sống, chỉ Keno dùng
`nocatche=<timestamp>`, 6 game còn lại (Bingo18, Lotto535, Power655, Mega645, Max3d, Max3dpro)
dùng `nocatche=1` cố định.

## 3. Dom helpers — tách heading reader dùng chung (Lotto535 + 4 game mới)

### 3.1. Thêm `readHeadingPeriodAndDate` vào `dom-helpers.ts`

5 game (Lotto535, Power655, Mega645, Max3d, Max3dpro) đều đọc kỳ + ngày từ CÙNG pattern
`<h5>Kỳ quay thưởng <b>#NNNNN</b> ngày <b>DD/MM/YYYY</b></h5>` — hiện logic này đang nằm INLINE
trong `parse-lotto535.ts` (`HEADING_PATTERN` + filter `<h5>` + regex exec). Lặp lại y nguyên ở
4 file parser mới là vi phạm DRY (`code-quality-standards.mdc §5`) — tách ra helper chung:

```typescript
const HEADING_PATTERN = /#(\d{5})\s*ng[àa]y\s*(\d{2})\/(\d{2})\/(\d{4})/i;

/**
 * Đọc kỳ (5 chữ số) + ngày quay từ `<h5>Kỳ quay thưởng #NNNNN ngày DD/MM/YYYY</h5>` — dùng
 * chung cho Lotto535/Power655/Mega645/Max3d/Max3dpro (Keno/Bingo18 đọc từ `<tr><td>`, khác
 * hẳn, xem `findResultRow`/`readDateAndPeriod`).
 *
 * Trả `null` (KHÔNG throw) khi không khớp — caller tự quyết định gọi `assertNotUnavailable`
 * trước khi throw `ParseError`, vì "chưa có kết quả" cũng không có `<h5>` này.
 */
export function readHeadingPeriodAndDate($: CheerioAPI): { drawPeriod: string; drawDateSource: string } | null {
  const heading = $("h5")
    .filter((_, el) => /Kỳ quay thưởng/i.test($(el).text()))
    .first();
  const headingText = heading.text().replace(/\s+/g, " ").trim();
  const match = HEADING_PATTERN.exec(headingText);
  if (!match) {
    return null;
  }
  const [, drawPeriod, dd, mm, yyyy] = match;
  if (drawPeriod === undefined || dd === undefined || mm === undefined || yyyy === undefined) {
    return null;
  }
  return { drawPeriod, drawDateSource: `${yyyy}-${mm}-${dd}` };
}
```

### 3.2. Refactor `parse-lotto535.ts` dùng lại helper mới

Thay đoạn đọc heading inline bằng gọi `readHeadingPeriodAndDate($)`, giữ nguyên phần đọc số
(`.day_so_ket_qua_v2 span.bong_tron.small`) và toàn bộ logic lỗi. Cập nhật JSDoc đầu file
(mục "Selector xác nhận trên fixture thật") để mention helper mới thay vì mô tả regex inline.

⚠️ Đây là thay đổi REFACTOR duy nhất trên code Lotto535 đã có — không đổi hành vi, chỉ đổi nơi
đặt logic đọc heading. Chạy lại test `vietlott-detail.test.ts` phần Lotto535 sau khi refactor để
xác nhận không phá hành vi cũ (test hiện có đã cover case thành công + `ResultUnavailableError`).

## 4. Parser mới — 3 file cho 4 game

Cùng thư mục `packages/resultfeed-application/src/sources/vietlott/vietlott-detail/`.

### 4.1. `parse-power655.ts`

Giống `parse-lotto535.ts` gần như 100%, chỉ đổi 5→6 main:

```typescript
import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readHeadingPeriodAndDate } from "./dom-helpers";

/** Đọc 6 số chính + 1 số bonus từ trang chi tiết Power 6/55 `vietlott.vn` đã cheerio-parse. */
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

  const numbersDisplay = $(".day_so_ket_qua_v2 span.bong_tron")
    .map((_, el) => $(el).text().trim())
    .toArray();
  if (numbersDisplay.length !== 7) {
    throw new ParseError(
      `'.day_so_ket_qua_v2' phải có đúng 7 số (6 main + 1 bonus), đọc được ${numbersDisplay.length} — HTML đã đổi cấu trúc.`,
      ResultFeedSourceId.VietlottDetail,
      ResultFeedGameKey.Power655,
    );
  }

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    // Power 6/55 không công bố checksum trên trang chi tiết.
    claimedChecksums: {},
  };
}
```

⚠️ QUY ƯỚC: bonus LUÔN ở index cuối (index 6) — khớp `canonicalizeNumbers` (Power655 case đã có
sẵn ở `rules/canonicalize.ts`, `main = slice(0,6)`, `bonus = slice(6)`).

### 4.2. `parse-mega645.ts`

```typescript
import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readHeadingPeriodAndDate } from "./dom-helpers";

/** Đọc 6 số chính từ trang chi tiết Mega 6/45 `vietlott.vn` đã cheerio-parse. */
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

  // Mega645 KHÔNG có class "small" (khác Lotto535/Power655) — chỉ dùng base class "bong_tron".
  const numbersDisplay = $(".day_so_ket_qua_v2 span.bong_tron")
    .map((_, el) => $(el).text().trim())
    .toArray();
  if (numbersDisplay.length !== 6) {
    throw new ParseError(
      `'.day_so_ket_qua_v2' phải có đúng 6 số, đọc được ${numbersDisplay.length} — HTML đã đổi cấu trúc.`,
      ResultFeedSourceId.VietlottDetail,
      ResultFeedGameKey.Mega645,
    );
  }

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay,
    claimedChecksums: {},
  };
}
```

### 4.3. `parse-max3d-family.ts` (dùng chung Max3d + Max3dpro)

Tên file có suffix `-family` để phân biệt với `sources/historical-import/parse-max3d.ts` (parser
JSONL, khác hẳn input/output shape — tránh nhầm lẫn khi tìm file).

```typescript
import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { MAX3D_TIER_COUNTS } from "@megawin/resultfeed/rules";
import type * as cheerio from "cheerio";

import type { ParsedObservation } from "../../types";
import { ParseError } from "../../types";
import { assertNotUnavailable, readHeadingPeriodAndDate } from "./dom-helpers";

const MAX3D_TOTAL_TRIPLET_COUNT = MAX3D_TIER_COUNTS.reduce((sum, n) => sum + n, 0);

/**
 * Đọc 20 triplet (Đặc biệt×2, Nhất×4, Nhì×6, Ba×8 — đúng {@link MAX3D_TIER_COUNTS}) từ trang
 * chi tiết Max3D/Max3D Pro `vietlott.vn` đã cheerio-parse. DÙNG CHUNG cho 2 game vì cấu trúc
 * DOM giống nhau 100%, chỉ khác nội dung số — `gameKey` chỉ dùng để gắn đúng context lỗi.
 */
export function parseMax3dFamily(
  gameKey: typeof ResultFeedGameKey.Max3d | typeof ResultFeedGameKey.Max3dpro,
  $: cheerio.CheerioAPI,
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

  const triplets = $(".tong_day_so_ket_qua .day_so_ket_qua_v2")
    .map((_, el) => {
      const digits = $(el)
        .find("span.bong_tron")
        .map((__, span) => $(span).text().trim())
        .toArray();
      return digits.join("");
    })
    .toArray();

  if (triplets.length !== MAX3D_TOTAL_TRIPLET_COUNT) {
    throw new ParseError(
      `'.tong_day_so_ket_qua' phải có đúng ${MAX3D_TOTAL_TRIPLET_COUNT} triplet, đọc được ${triplets.length} — HTML đã đổi cấu trúc.`,
      ResultFeedSourceId.VietlottDetail,
      gameKey,
    );
  }

  return {
    drawPeriod: heading.drawPeriod,
    drawDateSource: heading.drawDateSource,
    drawTimeSource: null,
    numbersDisplay: triplets,
    // Max3D/Max3D Pro không công bố checksum trên trang chi tiết.
    claimedChecksums: {},
  };
}
```

⚠️ KHÔNG check độ dài từng triplet (`=== 3`) ở đây — `checkMax3dFormat` (`intrinsic-check.ts`,
đã có sẵn) đã validate format/miền số MỖI triplet SAU khi parser trả `numbersDisplay`. Parser chỉ
cần đảm bảo đúng TỔNG SỐ triplet (invariant cấu trúc DOM), không lặp lại validate nội dung số
(khớp nguyên tắc "không duplicate validation" — `code-quality-standards.mdc §8`, áp dụng tương tự
giữa parser và intrinsic-check).

## 5. Adapter — `adapter.ts`

- `gameKeys`: đổi từ `[Keno, Bingo18, Lotto535]` thành đủ 7 game — thêm `Mega645`, `Power655`,
  `Max3d`, `Max3dpro`.
- `parse()`: thay 2 nhánh throw hiện tại (`case Mega645/Power655/Max3d/Max3dpro`) bằng gọi parser
  thật:

```typescript
case ResultFeedGameKey.Power655: {
  return parsePower655($);
}
case ResultFeedGameKey.Mega645: {
  return parseMega645($);
}
case ResultFeedGameKey.Max3d:
case ResultFeedGameKey.Max3dpro: {
  return parseMax3dFamily(gameKey, $);
}
```

Xoá đoạn comment "4 game này CHỈ nạp qua historical-import..." (không còn đúng). Import thêm
`parsePower655`, `parseMega645`, `parseMax3dFamily` ở đầu file.

Cập nhật header JSDoc file để mention đủ 7 game (hiện đang ghi "Keno + Bingo18 + Lotto535").

## 6. Worker — 4 Lambda handler mới + `fetch.yml`

Theo đúng khuôn `vietlott-lotto535.ts`, chỉ đổi `gameKey` + `schedule.drawDaysOfWeek`:

### `apps/worker-resultfeed/src/handlers/fetch/vietlott-power655.ts`

```typescript
import { ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { vietlottDetailAdapter } from "@megawin/resultfeed-application/sources";
import { FetchAndParseUseCase } from "@megawin/resultfeed-application/use-cases/fetch";

const useCase = new FetchAndParseUseCase({
  sourceId: vietlottDetailAdapter.sourceId,
  gameKey: ResultFeedGameKey.Power655,
  adapter: vietlottDetailAdapter,
  schedule: { type: "fixed", drawTimesVn: ["18:00"], drawDaysOfWeek: [2, 4, 6] },
  ttlSeconds: 120,
});

export async function handler() {
  return useCase.run();
}
```

### `apps/worker-resultfeed/src/handlers/fetch/vietlott-mega645.ts`

Giống trên, `gameKey: ResultFeedGameKey.Mega645`, `drawDaysOfWeek: [3, 5, 0]`.

### `apps/worker-resultfeed/src/handlers/fetch/vietlott-max3d.ts`

Giống trên, `gameKey: ResultFeedGameKey.Max3d`, `drawDaysOfWeek: [1, 3, 5]`.

### `apps/worker-resultfeed/src/handlers/fetch/vietlott-max3dpro.ts`

Giống trên, `gameKey: ResultFeedGameKey.Max3dpro`, `drawDaysOfWeek: [2, 4, 6]`.

Mỗi file JSDoc đầu file mirror `vietlott-lotto535.ts`, chỉnh đúng tên game + giờ/ngày quay.

### `apps/worker-resultfeed/src/functions/fetch.yml`

Thêm 4 entry mới, cùng khuôn `fetch-vietlott-lotto535` (cron 1 phút, timeout 120 — cron KHÔNG
phải nhịp quay thật, `nextFetchAt` schedule-aware mới quyết định tick nào thực sự fetch):

```yaml
fetch-vietlott-power655:
  handler: src/handlers/fetch/vietlott-power655.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true

fetch-vietlott-mega645:
  handler: src/handlers/fetch/vietlott-mega645.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true

fetch-vietlott-max3d:
  handler: src/handlers/fetch/vietlott-max3d.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true

fetch-vietlott-max3dpro:
  handler: src/handlers/fetch/vietlott-max3dpro.handler
  timeout: 120
  events:
    - schedule:
        rate: cron(* * * * ? *)
        enabled: true
```

## 7. Test — `vietlott-detail.test.ts`

Thêm 4 block `describe` mới, theo khuôn block Lotto535 hiện có (dòng ~199-267):

- **Power655** (fixture `power655.html`, kỳ #01392): assert `drawPeriod: "01392"`,
  `drawDateSource: "2026-09-01"`, `numbersDisplay: ["01","17","41","44","49","55","45"]` (7 phần
  tử, bonus `"45"` cuối), `claimedChecksums: {}`, `checkIntrinsic(...)` → `NotAvailable`.
- **Mega645** (fixture `mega645.html`, kỳ #01557): assert `drawPeriod: "01557"`,
  `drawDateSource: "2026-09-02"`, `numbersDisplay: ["06","09","27","29","35","44"]` (6 phần tử).
- **Max3d** (fixture `max3d.html`, kỳ #01127): assert `drawPeriod: "01127"`,
  `drawDateSource: "2026-09-02"`, `numbersDisplay` 20 phần tử đúng thứ tự — đọc chính xác từ
  fixture bằng tool đọc file trước khi viết assertion (KHÔNG đoán).
- **Max3dpro** (fixture `max3d-pro.html`, kỳ #00773): tương tự Max3d, đọc số thật từ fixture.

Mỗi block thêm 1 test case lỗi tương ứng (`ResultUnavailableError`, dùng fixture
`*-detail-error.html` của đúng game đó — Power655/Mega645 dùng marker "Không tìm thấy kết quả",
Max3d/Max3dpro dùng marker "CHƯA CÓ KẾT QUẢ").

Cập nhật:
- `describe("vietlottDetailAdapter — metadata")` (dòng ~27-37): `gameKeys` expect đủ 7 giá trị.
- Header JSDoc file (dòng 2): đổi "Keno + Bingo18 + Lotto535" → mention đủ 7 game.

⚠️ Trước khi viết assertion cho Max3d/Max3dpro, PHẢI đọc lại fixture bằng tool đọc file (không
chỉ dựa vào đoạn `rg` rút gọn ở mục 1.2 — đoạn đó chỉ xác nhận CẤU TRÚC, không phải cam kết đủ
20 giá trị chính xác) để tránh test sai theo số liệu tưởng tượng.

## 8. Checklist thực thi (theo thứ tự, mỗi bước verify trước khi qua bước sau)

1. [ ] `dom-helpers.ts`: thêm `readHeadingPeriodAndDate`, export.
2. [ ] `parse-lotto535.ts`: refactor dùng `readHeadingPeriodAndDate`, chạy lại test Lotto535 xác
   nhận không đổi hành vi.
3. [ ] `urls.ts`: thêm 4 case URL thật, xoá case throw cũ, cập nhật JSDoc đầu file.
4. [ ] Viết `parse-power655.ts`, `parse-mega645.ts`, `parse-max3d-family.ts`.
5. [ ] `adapter.ts`: thêm 4 gameKey vào `gameKeys`, gọi parser thật trong `parse()`, xoá throw cũ.
6. [ ] Test `vietlott-detail.test.ts`: đọc kỹ 8 fixture (4 thành công + 4 lỗi) lấy số liệu chính
   xác, viết đủ 8 test case mới (4 thành công + 4 lỗi) + sửa `gameKeys` expectation.
7. [ ] Chạy `pnpm --filter @megawin/resultfeed-application` test (targeted, build workspace deps
   trước nếu cần — xem cách đã làm ở Lotto535).
8. [ ] 4 Lambda handler mới (`vietlott-power655.ts`, `vietlott-mega645.ts`, `vietlott-max3d.ts`,
   `vietlott-max3dpro.ts`) + 4 entry `fetch.yml`.
9. [ ] Lint toàn bộ file đã sửa/tạo (`biome check --write <paths>`).
10. [ ] Cập nhật `02-fetch-parse.plan.md` (bảng workers §4, ghi chú `NotAvailable` intrinsic) và
    `01-data-model.plan.md` nếu có đoạn còn nhắc "4 game X/Y/Z/W chưa fetch sống được".

## 9. Vận hành sau khi merge (ghi chú, không phải code)

- Doc `sources` cho `vietlott-detail` cần `gameKeys` đủ 7 game (sửa qua backoffice hoặc script).
- Chạy lại `pnpm seed:cursors` (đã tạo ở `06-historical-import.plan.md §4.1`) — script tự động
  seed cursor cho MỌI adapter × gameKey đang cold-start, dựa trên `consensus` đã có từ historical
  import. Không cần thao tác thủ công riêng cho 4 game mới, miễn đã import JSONL trước.
- Theo dõi CloudWatch logs 4 Lambda mới sau lần cron đầu tiên đúng giờ quay (18:00 VN, đúng ngày
  trong tuần theo bảng mục 1.4) để xác nhận fetch sống hoạt động đúng trên site thật (khác fixture
  tĩnh — site thật có thể trả HTML lệch nhẹ, DOM có thể thay đổi theo thời gian).
