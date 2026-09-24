/**
 * PURE — không Redis, không Docker.
 *
 * Key shape + hash subjectId (p0-01 B1 #7–#11).
 */

import { hashKeyPart } from "@megawin/cache";
import { describe, expect, it } from "vitest";

import { buildRateLimitKey, GUARD_KEYS } from "../../src/keys";
import { GuardSubjectType } from "../../src/types";

describe("buildRateLimitKey", () => {
  it("key khớp guard:rl:v1:<route>:<type>_<hash>", () => {
    const key = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, "203.0.113.10");
    expect(key).toMatch(/^guard:rl:v1:[^:]+:(account|tenant|ip)_[0-9a-f]{16}$/);
    expect(key.startsWith(`${GUARD_KEYS.rateLimit}:`)).toBe(true);
  });

  it("phần động không chứa ':'", () => {
    const key = buildRateLimitKey("keno.place-bet", GuardSubjectType.Account, "acc-001");
    // Bỏ prefix tĩnh `guard:rl:v1` — phần còn lại là route + dynamic.
    const afterPrefix = key.slice(GUARD_KEYS.rateLimit.length + 1); // bỏ trailing ':'
    const colonIdx = afterPrefix.indexOf(":");
    expect(colonIdx).toBeGreaterThan(-1);
    const dynamic = afterPrefix.slice(colonIdx + 1);
    expect(dynamic).not.toContain(":");
  });

  it("subjectId đã qua hashKeyPart() — key không chứa IP/accountId nguyên bản", () => {
    const rawIp = "203.0.113.10";
    const rawAccount = "account-raw-xyz";
    const ipKey = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, rawIp);
    const accKey = buildRateLimitKey("keno.place-bet", GuardSubjectType.Account, rawAccount);

    expect(ipKey).not.toContain(rawIp);
    expect(accKey).not.toContain(rawAccount);
    expect(ipKey).toContain(hashKeyPart(rawIp));
    expect(accKey).toContain(hashKeyPart(rawAccount));
  });

  it("2 subjectId khác → 2 key khác; cùng subjectId → cùng key", () => {
    const a = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, "1.1.1.1");
    const b = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, "2.2.2.2");
    const a2 = buildRateLimitKey("keno.place-bet", GuardSubjectType.Ip, "1.1.1.1");

    expect(a).not.toBe(b);
    expect(a).toBe(a2);
  });

  it("route giữ nguyên văn (không hash)", () => {
    const key = buildRateLimitKey("keno.place-bet", GuardSubjectType.Tenant, "t1");
    expect(key).toContain("keno.place-bet");
  });
});
