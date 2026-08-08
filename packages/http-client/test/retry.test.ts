/**
 * PURE — không DB.
 *
 * Smoke test kích hoạt suite cho @megawin/http-client.
 * Kiểm tra `resolveRetryConfig` — logic thuần quyết định retry policy từ
 * per-request override + client default (ưu tiên per-request > default > null).
 */

import { describe, expect, it } from "vitest";

import { resolveRetryConfig } from "../src/retry";

describe("resolveRetryConfig", () => {
  it("trả null khi per-request = false (tắt retry rõ ràng)", () => {
    expect(resolveRetryConfig(false, 3)).toBeNull();
  });

  it("trả null khi per-request = 0", () => {
    expect(resolveRetryConfig(0, { maxRetries: 5 })).toBeNull();
  });

  it("per-request number > 0 thắng client default", () => {
    expect(resolveRetryConfig(2, 5)).toEqual({ maxRetries: 2 });
  });

  it("fallback về client default khi per-request undefined", () => {
    expect(resolveRetryConfig(undefined, 4)).toEqual({ maxRetries: 4 });
  });

  it("trả null khi cả hai đều null/undefined", () => {
    expect(resolveRetryConfig(undefined, undefined)).toBeNull();
  });
});
