/**
 * PURE — không DB.
 *
 * Smoke test kích hoạt suite cho @megawin/next.
 * Kiểm tra `formatErrorToast` — logic thuần map ApiClientError → { title, description }.
 */

import { ApiClientError } from "@megawin/shared/api-types";
import { describe, expect, it } from "vitest";

import { formatErrorToast } from "../src/client/format-error-toast";

describe("formatErrorToast", () => {
  it("lỗi không phải ApiClientError → trả fallback", () => {
    expect(formatErrorToast(new Error("boom"), "Thất bại")).toEqual({ title: "Thất bại" });
  });

  it("ApiClientError không có details.errors → title = message", () => {
    const err = new ApiClientError(400, { code: "BAD_REQUEST", message: "Sai dữ liệu" });
    expect(formatErrorToast(err, "Thất bại")).toEqual({ title: "Sai dữ liệu" });
  });

  it("một lỗi field → description = 'field: message'", () => {
    const err = new ApiClientError(400, {
      code: "VALIDATION",
      message: "Dữ liệu không hợp lệ",
      details: { errors: [{ field: "email", message: "bắt buộc" }] },
    });
    expect(formatErrorToast(err, "Thất bại")).toEqual({
      title: "Dữ liệu không hợp lệ",
      description: "email: bắt buộc",
    });
  });

  it("nhiều lỗi → description gộp thành bullet list", () => {
    const err = new ApiClientError(400, {
      code: "VALIDATION",
      message: "Dữ liệu không hợp lệ",
      details: {
        errors: [
          { field: "email", message: "bắt buộc" },
          { field: "name", message: "quá ngắn" },
        ],
      },
    });
    expect(formatErrorToast(err, "Thất bại")).toEqual({
      title: "Dữ liệu không hợp lệ",
      description: "• email: bắt buộc\n• name: quá ngắn",
    });
  });
});
