/**
 * Game Core – Draw Schedule Helpers: `computeDrawsPerDay`
 *
 * PURE — không DB, không cần quy tắc test staging chung.
 */

import { describe, expect, it } from "vitest";

import { computeDrawsPerDay } from "../../src/utils/draw-schedule";

describe("computeDrawsPerDay", () => {
  it("Đúng số học — floor((cuối − đầu) ÷ interval) + 1, kỳ đầu tính là 1 kỳ", () => {
    // Keno mặc định: 06:00 → 21:55, mỗi 5 phút.
    expect(computeDrawsPerDay("06:00", "21:55", 5)).toBe(192);
    // Kỳ đầu = kỳ cuối → đúng 1 kỳ.
    expect(computeDrawsPerDay("18:00", "18:00", 5)).toBe(1);
    // Khoảng lẻ không chia hết → floor, không làm tròn lên.
    expect(computeDrawsPerDay("06:00", "06:12", 5)).toBe(3);
  });

  it("Logic ngược — trả null khi input chưa hợp lệ", () => {
    expect(computeDrawsPerDay("6:00", "21:55", 5), "giờ đầu sai format").toBeNull();
    expect(computeDrawsPerDay("06:00", "24:00", 5), "giờ cuối sai format").toBeNull();
    expect(computeDrawsPerDay("06:00", "21:55", 0), "interval = 0").toBeNull();
    expect(computeDrawsPerDay("06:00", "21:55", -5), "interval âm").toBeNull();
    expect(computeDrawsPerDay("21:55", "06:00", 5), "kỳ cuối sớm hơn kỳ đầu").toBeNull();
  });
});
