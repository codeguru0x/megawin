/**
 * PURE — không Redis, không Docker.
 *
 * Khoá quyết định thiết kế Lua GCRA (p0-01 B1 #12–#13 + p0-01b R6–R8b).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GCRA_LUA_SCRIPT } from "../../src/rate-limit/gcra.lua";

const LUA_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../src/rate-limit/gcra.lua.ts");

describe("GCRA_LUA_SCRIPT", () => {
  it("script là string không rỗng, không chứa TIME", () => {
    expect(typeof GCRA_LUA_SCRIPT).toBe("string");
    expect(GCRA_LUA_SCRIPT.length).toBeGreaterThan(0);
    // now_ms phải từ ARGV — không dùng TIME của Redis (non-deterministic).
    expect(GCRA_LUA_SCRIPT).not.toMatch(/\bTIME\b/);
  });

  it("số ARGV[n] script đọc khớp số arg RateLimiter truyền (3)", () => {
    // RateLimiter luôn truyền [emissionIntervalMs, delayToleranceMs, nowMs].
    const rateLimiterArgCount = 3;

    const argvRefs = new Set<number>();
    for (const match of GCRA_LUA_SCRIPT.matchAll(/ARGV\[(\d+)\]/g)) {
      argvRefs.add(Number(match[1]));
    }

    expect(argvRefs.size).toBe(rateLimiterArgCount);
    expect([...argvRefs].toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("R6: script clamp ei trước khi dùng, và guard px trước SET", () => {
    expect(GCRA_LUA_SCRIPT).toMatch(/ei\s*<\s*1/);
    expect(GCRA_LUA_SCRIPT).toMatch(/px\s*<\s*1/);
    expect(GCRA_LUA_SCRIPT).toMatch(/'PX',\s*px/);
  });

  it("R7: script không truyền math.ceil(new_tat - now + dt) trực tiếp vào SET", () => {
    expect(GCRA_LUA_SCRIPT).not.toMatch(/SET',\s*KEYS\[1\],\s*new_tat,\s*'PX',\s*math\.ceil/);
  });

  it("R8: JSDoc/comment không chứa {route} (đọc như cluster hash tag)", () => {
    const src = readFileSync(LUA_FILE, "utf8");
    expect(src).not.toMatch(/\{route\}/);
  });

  it("R8b: công thức remainingBurst không bị đổi thành canonical", () => {
    // Q2 = A: giữ lower bound. Đỏ ở đây = ai đó đã "sửa" thành (dt + ei - (new_tat - now)).
    expect(GCRA_LUA_SCRIPT).toMatch(/now\s*-\s*\(new_tat\s*-\s*dt\)/);
  });
});
