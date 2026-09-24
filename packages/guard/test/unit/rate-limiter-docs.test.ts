/**
 * PURE — không Redis, không Docker.
 *
 * Khoá JSDoc trần thời gian (p0-01b R26', Q1 = B). Đọc source, không đoán số.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_REDIS_CONNECT_DEADLINE_MS } from "@megawin/cache";
import { describe, expect, it } from "vitest";

import { DEFAULT_RATE_LIMIT_TIMEOUT_MS } from "../../src/constants";

const RATE_LIMITER_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../src/rate-limit/rate-limiter.ts");

describe("RateLimiter JSDoc trần thời gian (R26')", () => {
  it("JSDoc class nhắc đủ 2 hằng và không khẳng định cả checkRateLimit trần 250ms", () => {
    const src = readFileSync(RATE_LIMITER_FILE, "utf8");

    expect(src).toContain("DEFAULT_REDIS_CONNECT_DEADLINE_MS");
    expect(src).toContain("DEFAULT_RATE_LIMIT_TIMEOUT_MS");
    // Phải nói rõ 250ms là pha command, không phải cả lời gọi (Q1 = B).
    expect(src).toMatch(/không phải của cả lời gọi/);
    expect(src).not.toMatch(/Trần mỗi lần check/);

    // Assert phụ — đổi hằng thì số tổng đổi; không đủ để khoá JSDoc.
    expect(DEFAULT_REDIS_CONNECT_DEADLINE_MS + DEFAULT_RATE_LIMIT_TIMEOUT_MS).toBe(5250);
  });
});
