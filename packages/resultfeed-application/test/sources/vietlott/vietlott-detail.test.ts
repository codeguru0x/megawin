/**
 * ResultFeed – vietlott-detail Adapter Tests (Keno + Bingo18 + Lotto535 + Power655 +
 * Mega645 + Max3d + Max3dpro)
 *
 * `02-fetch-parse.plan.md §2.2` + `05-lotto535-and-schedule.plan.md §3` +
 * `09-power-mega-max3d-family.plan.md`. Dùng fixture HTML THẬT lấy qua Oxylabs (không phải
 * HTML tự viết tay) — `test/html/keno.html` (kỳ #0294026), `test/html/bingo18.html` (kỳ
 * #0184325), `test/html/lotto535.html` (kỳ #00860), `test/html/power655.html` (kỳ #01392),
 * `test/html/mega645.html` (kỳ #01557), `test/html/max3d.html` (kỳ #01127),
 * `test/html/max3d-pro.html` (kỳ #00773). Assert số + checksum khớp đúng dữ liệu hiển thị
 * trên trang thật (đối chiếu bằng ảnh chụp màn hình lúc viết parser).
 *
 * `parse()` PHẢI pure — test không mock Date.now(), không I/O ngoài đọc fixture 1 lần ở
 * `beforeAll`.
 */

import { ResultFeedGameKey, ResultFeedSourceId } from "@megawin/resultfeed/entities";
import { checkIntrinsic } from "@megawin/resultfeed/rules";
import { beforeAll, describe, expect, it } from "vitest";

import { ParseError, ResultUnavailableError } from "../../../src/sources/types";
import { vietlottDetailAdapter } from "../../../src/sources/vietlott/vietlott-detail";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_DIR = join(__dirname, "..", "..", "html");

describe("vietlottDetailAdapter — metadata", () => {
  it("khai báo đúng sourceId + gameKeys", () => {
    expect(vietlottDetailAdapter.sourceId).toBe(ResultFeedSourceId.VietlottDetail);
    expect(vietlottDetailAdapter.gameKeys).toEqual([
      ResultFeedGameKey.Keno,
      ResultFeedGameKey.Bingo18,
      ResultFeedGameKey.Lotto535,
      ResultFeedGameKey.Power655,
      ResultFeedGameKey.Mega645,
      ResultFeedGameKey.Max3d,
      ResultFeedGameKey.Max3dpro,
    ]);
    expect(vietlottDetailAdapter.parserVersion).toBeTruthy();
  });
});

describe("vietlottDetailAdapter.parse — Keno (fixture kỳ #0294026)", () => {
  let keno: Buffer;

  beforeAll(() => {
    keno = readFileSync(join(HTML_DIR, "keno.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("0294026");
    expect(result.drawDateSource).toBe("2026-08-31");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 20 số ĐÚNG THỨ TỰ hiển thị trên trang (không sort)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });

    expect(result.numbersDisplay).toEqual([
      "02",
      "04",
      "06",
      "13",
      "16",
      "21",
      "28",
      "30",
      "39",
      "42",
      "48",
      "52",
      "53",
      "54",
      "56",
      "58",
      "60",
      "67",
      "70",
      "73",
    ]);
  });

  it("đọc đúng 4 checksum CHẴN/LẺ/LỚN/NHỎ hiển thị trên trang", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({
      even: 14,
      odd: 6,
      big: 11,
      small: 9,
    });
  });

  it("checkIntrinsic pass với dữ liệu parse từ fixture thật (số + checksum tự khớp nhau)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Keno, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Keno,
      body: keno,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Bingo18 (fixture kỳ #0184325)", () => {
  let bingo18: Buffer;

  beforeAll(() => {
    bingo18 = readFileSync(join(HTML_DIR, "bingo18.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("0184325");
    expect(result.drawDateSource).toBe("2026-09-01");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 3 số GIỮ THỨ TỰ + GIỮ TRÙNG LẶP — [1,5,1] không bị dedupe thành [1,5]", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });

    expect(result.numbersDisplay).toEqual(["1", "5", "1"]);
  });

  it("đọc đúng checksum Cửa tổng (sum) + Lớn/Hòa/Nhỏ (bigSmallDraw)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({ sum: 7, bigSmallDraw: "small" });
  });

  it("checkIntrinsic pass với dữ liệu parse từ fixture thật (tổng 1+5+1=7, biên nhỏ ≤9 khớp 'small')", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Bingo18, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Bingo18,
      body: bingo18,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Lotto535 (fixture kỳ #00860)", () => {
  let lotto535: Buffer;

  beforeAll(() => {
    lotto535 = readFileSync(join(HTML_DIR, "lotto535.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("00860");
    expect(result.drawDateSource).toBe("2026-09-01");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 5 số main + 1 số đặc biệt ở CUỐI, giữ thứ tự nguồn (không sort)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });

    // 5 phần tử đầu = main, phần tử thứ 6 = số đặc biệt (quy ước, xem parse-lotto535.ts).
    expect(result.numbersDisplay).toEqual(["03", "04", "06", "15", "22", "09"]);
  });

  it("KHÔNG công bố checksum nào — claimedChecksums luôn rỗng", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({});
  });

  it("checkIntrinsic trả Passed — không có checksum để so, nhưng đúng hình thức/miền theo luật chơi", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Lotto535, result.numbersDisplay, result.claimedChecksums);

    // Lotto535 không có checksum tự công bố ⇒ đúng hình thức/miền chính là điều kiện
    // Passed duy nhất (không còn NotAvailable — xem intrinsic-check.ts JSDoc đầu file).
    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Lotto535,
      body: lotto535,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Power655 (fixture kỳ #01392)", () => {
  let power655: Buffer;

  beforeAll(() => {
    power655 = readFileSync(join(HTML_DIR, "power655.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("01392");
    expect(result.drawDateSource).toBe("2026-09-01");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 6 số main + 1 bonus ở CUỐI, giữ thứ tự nguồn (không sort)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });

    // 6 phần tử đầu = main, phần tử thứ 7 = bonus (quy ước, xem parse-power655.ts).
    expect(result.numbersDisplay).toEqual(["01", "17", "41", "44", "49", "55", "45"]);
  });

  it("KHÔNG công bố checksum nào — claimedChecksums luôn rỗng", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({});
  });

  it("checkIntrinsic trả Passed — đúng hình thức/miền theo luật chơi", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Power655, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Power655,
      body: power655,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Mega645 (fixture kỳ #01557)", () => {
  let mega645: Buffer;

  beforeAll(() => {
    mega645 = readFileSync(join(HTML_DIR, "mega645.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật (thẻ <H5> viết hoa)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("01557");
    expect(result.drawDateSource).toBe("2026-09-02");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 6 số giữ thứ tự nguồn (không sort), KHÔNG có bonus", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });

    expect(result.numbersDisplay).toEqual(["06", "09", "27", "29", "35", "44"]);
  });

  it("KHÔNG công bố checksum nào — claimedChecksums luôn rỗng", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({});
  });

  it("checkIntrinsic trả Passed — đúng hình thức/miền theo luật chơi", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Mega645, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Mega645,
      body: mega645,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Max3d (fixture kỳ #01127)", () => {
  let max3d: Buffer;

  beforeAll(() => {
    max3d = readFileSync(join(HTML_DIR, "max3d.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("01127");
    expect(result.drawDateSource).toBe("2026-09-02");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 20 triplet theo thứ tự hạng giải Đặc biệt(2)→Nhất(4)→Nhì(6)→Ba(8)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });

    expect(result.numbersDisplay).toEqual([
      // Đặc biệt (2)
      "367",
      "018",
      // Nhất (4)
      "903",
      "279",
      "237",
      "787",
      // Nhì (6)
      "617",
      "126",
      "026",
      "780",
      "748",
      "371",
      // Ba (8)
      "768",
      "752",
      "220",
      "278",
      "067",
      "584",
      "606",
      "701",
    ]);
  });

  it("KHÔNG công bố checksum nào — claimedChecksums luôn rỗng", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({});
  });

  it("checkIntrinsic trả Passed — đúng hình thức/miền (20 triplet 000-999)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Max3d, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3d,
      body: max3d,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — Max3dpro (fixture kỳ #00773)", () => {
  let max3dpro: Buffer;

  beforeAll(() => {
    max3dpro = readFileSync(join(HTML_DIR, "max3d-pro.html"));
  });

  it("đọc đúng drawPeriod + drawDateSource từ fixture thật", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });

    expect(result.drawPeriod).toBe("00773");
    expect(result.drawDateSource).toBe("2026-09-01");
    expect(result.drawTimeSource).toBeNull();
  });

  it("đọc đúng 20 triplet theo thứ tự hạng giải Đặc biệt(2)→Nhất(4)→Nhì(6)→Ba(8)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });

    expect(result.numbersDisplay).toEqual([
      // Đặc biệt (2)
      "909",
      "970",
      // Nhất (4)
      "180",
      "152",
      "727",
      "471",
      // Nhì (6)
      "205",
      "287",
      "643",
      "014",
      "491",
      "605",
      // Ba (8)
      "780",
      "967",
      "895",
      "208",
      "081",
      "772",
      "860",
      "600",
    ]);
  });

  it("KHÔNG công bố checksum nào — claimedChecksums luôn rỗng", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });

    expect(result.claimedChecksums).toEqual({});
  });

  it("checkIntrinsic trả Passed — đúng hình thức/miền (20 triplet 000-999)", () => {
    const result = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });
    const check = checkIntrinsic(ResultFeedGameKey.Max3dpro, result.numbersDisplay, result.claimedChecksums);

    expect(check.state).toBe("passed");
    expect(check.mismatch).toBeNull();
  });

  it("parse là pure — gọi lại nhiều lần cho cùng input trả cùng output", () => {
    const first = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });
    const second = vietlottDetailAdapter.parse({
      gameKey: ResultFeedGameKey.Max3dpro,
      body: max3dpro,
      contentType: "text/html",
    });

    expect(second).toEqual(first);
  });
});

describe("vietlottDetailAdapter.parse — lỗi HTML không hợp lệ", () => {
  it("throw ParseError khi body không chứa '.day_so_ket_qua_v2'", () => {
    const body = Buffer.from("<html><body><p>Trang lỗi, không có kết quả</p></body></html>");

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Keno,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ParseError);
  });
});

describe("vietlottDetailAdapter.parse — kỳ chưa có kết quả (fixture thật, HTTP 200 không phải 404)", () => {
  // Fixture lấy qua Oxylabs bằng cách chọn kỳ quay vào NGÀY TƯƠNG LAI (chưa có kết quả) —
  // xác nhận Vietlott KHÔNG trả 404 cho trường hợp này, mà vẫn giữ khung ASP.NET WebForms
  // hợp lệ + text thuần "Không tìm thấy kết quả [<kỳ>]" (xem JSDoc `dom-helpers.ts`).
  it("throw ResultUnavailableError (không phải ParseError) cho fixture Keno thật", () => {
    const body = readFileSync(join(HTML_DIR, "keno-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Keno,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Bingo18 thật", () => {
    const body = readFileSync(join(HTML_DIR, "bingo-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Bingo18,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Lotto535 thật (kỳ #00863)", () => {
    const body = readFileSync(join(HTML_DIR, "lotto535-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Lotto535,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Power655 thật (kỳ #01396)", () => {
    const body = readFileSync(join(HTML_DIR, "power655-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Power655,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Mega645 thật (kỳ #01887)", () => {
    const body = readFileSync(join(HTML_DIR, "mega645-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Mega645,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Max3d thật", () => {
    const body = readFileSync(join(HTML_DIR, "max3d-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Max3d,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("throw ResultUnavailableError (không phải ParseError) cho fixture Max3dpro thật", () => {
    const body = readFileSync(join(HTML_DIR, "max3d-pro-detail-error.html"));

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Max3dpro,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ResultUnavailableError);
  });

  it("VẪN throw ParseError (fallback an toàn) khi trang lỗi KHÔNG mang khung WebForms hợp lệ", () => {
    // Best-effort marker (§JSDoc dom-helpers.ts) yêu cầu CẢ 2 điều kiện: có text
    // "không tìm thấy kết quả" VÀ có khung form#ctl00 + #__VIEWSTATE. Trang giả lập lỗi
    // hạ tầng khác (maintenance page bất kỳ) KHÔNG có khung này ⇒ vẫn phải rơi về ParseError,
    // không được nhận nhầm thành "chưa có kết quả".
    const body = Buffer.from("<html><body><p>Không tìm thấy kết quả</p></body></html>");

    expect(() =>
      vietlottDetailAdapter.parse({
        gameKey: ResultFeedGameKey.Keno,
        body,
        contentType: "text/html",
      }),
    ).toThrow(ParseError);
  });
});

describe("vietlottDetailAdapter.planNextFetch", () => {
  it("planNextFetch dựng URL Keno với expectedPeriod = lastConfirmedPeriod + 1", () => {
    const plan = vietlottDetailAdapter.planNextFetch({
      gameKey: ResultFeedGameKey.Keno,
      cursor: {
        id: "x",
        sourceId: ResultFeedSourceId.VietlottDetail,
        gameKey: ResultFeedGameKey.Keno,
        lastConfirmedPeriod: "0294025",
        nextExpectedPeriod: "0294026",
        nextFetchAt: new Date(),
        consecutiveFailures: 0,
        needsBackfill: false,
        consecutiveIntrinsicFailures: 0,
        isPaused: false,
        updatedAt: new Date(),
      },
    });

    expect(plan.expectedPeriod).toBe("0294026");
    expect(plan.render).toBe(false);
    expect(plan.url).toContain("view-detail-keno-result");
    expect(plan.url).toContain("id=0294026");
    // Keno: nocatche PHẢI là timestamp biến thiên — verify thật qua Oxylabs (xem urls.ts JSDoc)
    // xác nhận `nocatche=1` cố định KHÔNG áp dụng cho Keno (khác Bingo18 bên dưới).
    expect(plan.url).toMatch(/nocatche=\d{10,}/);
  });

  it("planNextFetch dựng URL Bingo18 với thứ tự query param nocatche trước id, giá trị CỐ ĐỊNH = 1", () => {
    const plan = vietlottDetailAdapter.planNextFetch({
      gameKey: ResultFeedGameKey.Bingo18,
      cursor: {
        id: "x",
        sourceId: ResultFeedSourceId.VietlottDetail,
        gameKey: ResultFeedGameKey.Bingo18,
        lastConfirmedPeriod: "0184324",
        nextExpectedPeriod: "0184325",
        nextFetchAt: new Date(),
        consecutiveFailures: 0,
        needsBackfill: false,
        consecutiveIntrinsicFailures: 0,
        isPaused: false,
        updatedAt: new Date(),
      },
    });

    expect(plan.expectedPeriod).toBe("0184325");
    expect(plan.url).toContain("view-detail-bingo18-result");
    expect(plan.url).toContain("id=0184325");
    // Bingo18: nocatche PHẢI là hằng số "1" — verify thật qua Oxylabs (xem urls.ts JSDoc):
    // dùng timestamp biến thiên trả về HTML thiếu '.day_so_ket_qua_v2' (parse fail thật sự
    // đã xảy ra với kỳ #0184369), chỉ `nocatche=1` mới trả đúng cấu trúc.
    expect(plan.url).toContain("nocatche=1&id=0184325");
  });

  it("planNextFetch KHÔNG hardcode zero-pad 7 chữ số — giữ đúng độ dài cursor đang lưu (VD 5 chữ số)", () => {
    // Bằng chứng cho fix: nếu còn hardcode zeroPad7, kỳ 5 chữ số "00099" sẽ bị pad SAI
    // thành 7 chữ số ("0000100") — test này FAIL nếu regression tái diễn.
    const plan = vietlottDetailAdapter.planNextFetch({
      gameKey: ResultFeedGameKey.Keno,
      cursor: {
        id: "x",
        sourceId: ResultFeedSourceId.VietlottDetail,
        gameKey: ResultFeedGameKey.Keno,
        lastConfirmedPeriod: "00099",
        nextExpectedPeriod: "00100",
        nextFetchAt: new Date(),
        consecutiveFailures: 0,
        needsBackfill: false,
        consecutiveIntrinsicFailures: 0,
        isPaused: false,
        updatedAt: new Date(),
      },
    });

    expect(plan.expectedPeriod).toBe("00100");
    expect(plan.url).toContain("id=00100");
  });

  it("planNextFetch throw khi cursor chưa có lastConfirmedPeriod (cold start, chưa từng seed)", () => {
    expect(() =>
      vietlottDetailAdapter.planNextFetch({
        gameKey: ResultFeedGameKey.Keno,
        cursor: {
          id: "x",
          sourceId: ResultFeedSourceId.VietlottDetail,
          gameKey: ResultFeedGameKey.Keno,
          lastConfirmedPeriod: null,
          nextExpectedPeriod: null,
          nextFetchAt: new Date(),
          consecutiveFailures: 0,
          needsBackfill: false,
          consecutiveIntrinsicFailures: 0,
          isPaused: false,
          updatedAt: new Date(),
        },
      }),
    ).toThrow();
  });
});
