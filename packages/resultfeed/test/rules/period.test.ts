/**
 * ResultFeed – Unit test: period utilities
 *
 * PURE — không DB. Đây là fix cho feedback thật: `incrementPeriod` TUYỆT ĐỐI không được
 * hardcode zero-pad width (VD `7` như Keno/Bingo18) — độ dài PHẢI lấy từ chính giá trị
 * input, vì nguồn tương lai (VD Power 6/55 nội bộ, hoặc site khác) có thể dùng độ dài khác
 * (VD 5 chữ số).
 */

import { describe, expect, it } from "vitest";

import { incrementPeriod } from "../../src/rules/period";

describe("incrementPeriod", () => {
  it("Đúng logic — giữ nguyên độ dài 7 chữ số (Vietlott Keno/Bingo18)", () => {
    expect(incrementPeriod("0294026")).toBe("0294027");
  });

  it("Đúng logic — giữ nguyên độ dài 5 chữ số (nguồn giả định khác Vietlott)", () => {
    expect(incrementPeriod("00042")).toBe("00043");
  });

  it("Đúng logic — không hardcode 7: độ dài 3 chữ số vẫn giữ nguyên, không bị pad lên 7", () => {
    expect(incrementPeriod("042")).toBe("043");
  });

  it("Biên — carry qua chữ số mới vẫn giữ pad width tối thiểu bằng input (không mất số 0 đầu)", () => {
    expect(incrementPeriod("0999999")).toBe("1000000");
  });

  it("Biên — carry làm số dài HƠN độ dài input (999 → 1000) thì trả nguyên số mới, không cắt", () => {
    expect(incrementPeriod("999")).toBe("1000");
  });
});
