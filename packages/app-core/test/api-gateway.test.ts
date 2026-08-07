/**
 * PURE — không DB.
 *
 * Smoke test kích hoạt suite cho @megawin/app-core.
 * Kiểm tra `toApiGatewayResponse` — map AppResult → ApiGatewayResponse (format
 * thống nhất với Next.js: success/error envelope + status code).
 */

import { describe, it, expect } from "vitest";
import { toApiGatewayResponse } from "../src/use-cases/api-gateway";
import { APP_ERROR_CODES } from "@megawin/shared/errors";

describe("toApiGatewayResponse", () => {
  it("success → 200 + { success: true, data }", () => {
    const res = toApiGatewayResponse({ success: true, data: { id: "abc" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ success: true, data: { id: "abc" } });
  });

  it("success với successStatus custom (201)", () => {
    const res = toApiGatewayResponse({ success: true, data: null }, { successStatus: 201 });
    expect(res.statusCode).toBe(201);
  });

  it("error NOT_FOUND → 404 + { success: false, error }", () => {
    const res = toApiGatewayResponse({
      success: false,
      error: { code: APP_ERROR_CODES.NOT_FOUND, message: "Không tìm thấy" },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      success: false,
      error: { code: APP_ERROR_CODES.NOT_FOUND, message: "Không tìm thấy" },
    });
  });
});
