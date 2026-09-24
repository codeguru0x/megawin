/**
 * p0-02 B1 #7–#10 — đọc header `mw-idempotency-key`. PURE, không DB.
 *
 * Header bắt buộc. Sai format hoặc thiếu → 400, không sinh key server-side.
 */

import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_HEADER } from "../../src/constants/http-headers";
import { extractIdempotencyKeyFromApiGatewayV2 } from "../../src/utils/api-gateway-v2";

function readKey(headers: Record<string, string | undefined> | null | undefined): string {
  return extractIdempotencyKeyFromApiGatewayV2({ headers });
}

describe("extractIdempotencyKeyFromApiGatewayV2", () => {
  // #7
  it("key hợp lệ (8–128, charset chữ số _ -) → trả đúng key, không throw", () => {
    expect(readKey({ [IDEMPOTENCY_KEY_HEADER]: "abcd1234" })).toBe("abcd1234");
    expect(readKey({ [IDEMPOTENCY_KEY_HEADER]: "550e8400-e29b-41d4-a716-446655440000" })).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  // #8 — message là UI tiếng Việt, không lộ tên class / tên field code.
  it("quá ngắn, quá dài, rỗng, ký tự cấm → 400, message tiếng Việt", () => {
    const cases = ["abc", "a".repeat(129), "bad key!", "có-dấu", "key/slash"];

    for (const value of cases) {
      expect(() => readKey({ [IDEMPOTENCY_KEY_HEADER]: value })).toThrow(AppException);
      try {
        readKey({ [IDEMPOTENCY_KEY_HEADER]: value });
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        const appError = error as AppException;
        expect(appError.code).toBe(APP_ERROR_CODES.BAD_REQUEST);
        expect(appError.message).toMatch(/không hợp lệ|Thiếu/);
        expect(appError.message).not.toMatch(/AppException|idempotencyKey|extractIdempotency/);
      }
    }
  });

  // #9 — thiếu header không được fallback sinh tx.
  it("thiếu hẳn header → 400 và không có key để derive tx", () => {
    const deriveTx = vi.fn();

    const missing: Array<Record<string, string | undefined> | null | undefined> = [
      undefined,
      null,
      {},
      { [IDEMPOTENCY_KEY_HEADER]: "" },
      { [IDEMPOTENCY_KEY_HEADER]: "   " },
      { "idempotency-key": "abcd1234" },
    ];

    for (const headers of missing) {
      expect(() => {
        const key = readKey(headers);
        deriveTx(key);
      }).toThrow(AppException);
    }

    expect(deriveTx).not.toHaveBeenCalled();
  });

  // #10 — API Gateway không đảm bảo hoa/thường của tên header.
  it("mw-idempotency-key, Mw-Idempotency-Key, MW-IDEMPOTENCY-KEY → cùng một key", () => {
    const value = "retry-key-01";
    const fromLower = readKey({ "mw-idempotency-key": value });
    const fromMixed = readKey({ "Mw-Idempotency-Key": value });
    const fromUpper = readKey({ "MW-IDEMPOTENCY-KEY": value });

    expect(fromLower).toBe(value);
    expect(fromMixed).toBe(value);
    expect(fromUpper).toBe(value);
  });
});
