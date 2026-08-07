/**
 * PURE — không DB.
 *
 * Unit test cho audit cursor codec: encode/decode roundtrip + fail-safe.
 * Codec chỉ base64url + validate shape, không chạm DB.
 */

import { describe, it, expect } from "vitest";
import { encodeAuditCursor, decodeAuditCursor } from "../src/use-cases/audit-cursor-codec";

const VALID_ID = "507f1f77bcf86cd799439011"; // ObjectId hex 24 ký tự
const TS = "2026-01-01T00:00:00.000Z";

describe("audit cursor codec", () => {
  it("encode → decode roundtrip: ts thành Date, id giữ nguyên", () => {
    const token = encodeAuditCursor({ ts: TS, id: VALID_ID });
    expect(token).toBeTypeOf("string");

    const decoded = decodeAuditCursor(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(VALID_ID);
    expect(decoded!.ts).toBeInstanceOf(Date);
    expect(decoded!.ts.toISOString()).toBe(TS);
  });

  it("encode null → null", () => {
    expect(encodeAuditCursor(null)).toBeNull();
  });

  it("decode token rác/thiếu → null (fail-safe, về trang đầu)", () => {
    expect(decodeAuditCursor(undefined)).toBeNull();
    expect(decodeAuditCursor(null)).toBeNull();
    expect(decodeAuditCursor("not-a-valid-token")).toBeNull();
  });

  it("decode token có id KHÔNG phải ObjectId hex → null", () => {
    const bad = encodeAuditCursor({ ts: TS, id: "bad-id" });
    expect(decodeAuditCursor(bad)).toBeNull();
  });
});
