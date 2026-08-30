/**
 * Shared – Time-of-day "HH:mm" + date "YYYY-MM-DD" helpers
 *
 * PURE — không DB, không mock, không phụ thuộc timezone hệ thống.
 *
 * Khoá 3 hành vi mà UI config/operations game dựa vào:
 * - `parseHHMMToMinutes` trả `null` (KHÔNG phải `NaN`) cho input xấu — form đang gõ dở
 *   không được hiện số rác.
 * - `dayOfWeek` tính đúng thứ trong tuần THUẦN theo lịch, không lệ thuộc timezone máy.
 * - `parseYMDToLocalDate` trả `undefined` (KHÔNG phải `Invalid Date`) cho ngày sai —
 *   calendar picker hiện "chưa chọn" thay vì crash khi format.
 */

import { describe, expect, it } from "vitest";

import { dayOfWeek, HHMM_PATTERN, parseHHMMToMinutes, parseYMDToLocalDate, YMD_PATTERN } from "../src/utils/date";

describe("HHMM_PATTERN", () => {
  it("Đúng nghiệp vụ — chấp nhận 00:00 đến 23:59 zero-padded", () => {
    for (const t of ["00:00", "09:05", "12:30", "23:59"]) {
      expect(HHMM_PATTERN.test(t), t).toBe(true);
    }
  });

  it("Logic ngược — từ chối giờ/phút ngoài miền và thiếu zero-padding", () => {
    for (const t of ["24:00", "23:60", "6:05", "18:5", "", "18:00:00", "1800", "aa:bb"]) {
      expect(HHMM_PATTERN.test(t), t).toBe(false);
    }
  });

  it("Đúng nghiệp vụ — không có flag /g nên .test() gọi nhiều lần vẫn nhất quán", () => {
    // Regex /g mang state lastIndex → lần gọi thứ 2 trả false dù input hợp lệ.
    expect(HHMM_PATTERN.global).toBe(false);
    expect(HHMM_PATTERN.test("18:00")).toBe(true);
    expect(HHMM_PATTERN.test("18:00")).toBe(true);
  });
});

describe("parseHHMMToMinutes", () => {
  it("Đúng số học — số phút kể từ 00:00", () => {
    expect(parseHHMMToMinutes("00:00")).toBe(0);
    expect(parseHHMMToMinutes("00:01")).toBe(1);
    expect(parseHHMMToMinutes("06:00")).toBe(360);
    expect(parseHHMMToMinutes("18:30")).toBe(1110);
    expect(parseHHMMToMinutes("23:59")).toBe(1439);
  });

  it("Logic ngược — input sai format trả null, KHÔNG trả NaN", () => {
    for (const t of ["24:00", "6:05", "", "abc"]) {
      expect(parseHHMMToMinutes(t), t).toBeNull();
    }
  });
});

describe("YMD_PATTERN", () => {
  it("Đúng nghiệp vụ — chấp nhận YYYY-MM-DD zero-padded", () => {
    for (const d of ["2026-03-07", "2026-12-31", "1999-01-01"]) {
      expect(YMD_PATTERN.test(d), d).toBe(true);
    }
  });

  it("Logic ngược — từ chối thiếu zero-padding, sai separator, chuỗi rác", () => {
    for (const d of ["2026-3-7", "2026/03/07", "20260307", "", "2026-03-07T00:00:00"]) {
      expect(YMD_PATTERN.test(d), d).toBe(false);
    }
  });

  it("Đúng nghiệp vụ — không có flag /g nên .test() gọi nhiều lần vẫn nhất quán", () => {
    expect(YMD_PATTERN.global).toBe(false);
    expect(YMD_PATTERN.test("2026-03-07")).toBe(true);
    expect(YMD_PATTERN.test("2026-03-07")).toBe(true);
  });
});

describe("parseYMDToLocalDate", () => {
  it("Đúng nghiệp vụ — trả Date 00:00 giờ máy, đúng y/m/d (month 0-based đã trừ)", () => {
    const d = parseYMDToLocalDate("2026-03-07");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2026);
    // Tháng 3 → index 2. Nếu quên trừ 1 sẽ ra 3 (tháng 4) → lệch cả kỳ quay.
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(7);
    expect(d?.getHours()).toBe(0);
    expect(d?.getMinutes()).toBe(0);
  });

  it("Logic ngược — sai format trả undefined, KHÔNG trả Invalid Date", () => {
    for (const s of ["2026-3-7", "2026/03/07", "", "abc", "20260307"]) {
      expect(parseYMDToLocalDate(s), s).toBeUndefined();
    }
  });

  it("Đúng nghiệp vụ — ngày quá miền bị JS rollover, KHÔNG trả undefined", () => {
    // new Date(2026, 1, 31) → 03/03 (JS tự tràn). Regex chỉ chốt FORMAT, không chốt
    // ngày tồn tại thật. Caller cần chặn ngày vô nghĩa thì phải validate riêng.
    const d = parseYMDToLocalDate("2026-02-31");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getMonth()).toBe(2);
  });
});

describe("dayOfWeek", () => {
  it("Đúng nghiệp vụ — trả đúng thứ trong tuần, 0=Chủ Nhật … 6=Thứ Bảy", () => {
    // 2026-03-07 là Thứ Bảy (verify chéo với dataset Vietlott ở game-core).
    expect(dayOfWeek("2026-03-07")).toBe(6);
    // 2026-08-30 là Chủ Nhật.
    expect(dayOfWeek("2026-08-30")).toBe(0);
    // 2026-08-24 là Thứ Hai.
    expect(dayOfWeek("2026-08-24")).toBe(1);
  });

  it("Đúng nghiệp vụ — tính THUẦN theo lịch (Date.UTC), không lệ thuộc timezone hệ thống chạy test", () => {
    // Cùng 1 ngày phải luôn ra cùng 1 thứ dù server chạy ở timezone nào — dùng Date.UTC
    // nội bộ nên không bị lệch dù TZ env khác VN.
    expect(dayOfWeek("2026-01-01")).toBe(4); // Thứ Năm.
  });
});
