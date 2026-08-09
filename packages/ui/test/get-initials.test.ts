/**
 * PURE — không DB (jsdom env).
 *
 * Smoke test kích hoạt suite cho @megawin/ui.
 * Kiểm tra `getInitials` — logic thuần lấy chữ cái đầu mỗi từ, viết hoa.
 */

import { describe, expect, it } from "vitest";

import { getInitials } from "../src/lib/get-initials";

describe("getInitials", () => {
  it("lấy chữ cái đầu mỗi từ và viết hoa", () => {
    expect(getInitials("nguyen van a")).toBe("NVA");
  });

  it("gộp nhiều khoảng trắng", () => {
    expect(getInitials("  Trần   Bình  ")).toBe("TB");
  });

  it("chuỗi rỗng hoặc chỉ khoảng trắng → '?'", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});
