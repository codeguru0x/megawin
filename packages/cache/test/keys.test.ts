import { describe, expect, it } from "vitest";

import { cacheKey, hashKeyPart } from "../src/keys";

describe("cacheKey", () => {
  it("ghép parts bằng dấu :", () => {
    expect(cacheKey("keno", "global-config", "v1")).toBe("keno:global-config:v1");
  });

  it("bỏ qua part rỗng", () => {
    expect(cacheKey("keno", "", "v1")).toBe("keno:v1");
  });

  it("throw khi part chứa :", () => {
    expect(() => cacheKey("keno", "a:b")).toThrow(/không được chứa/);
  });
});

describe("hashKeyPart", () => {
  it("trả 16 hex chars, deterministic", () => {
    const h1 = hashKeyPart("secret-api-key");
    const h2 = hashKeyPart("secret-api-key");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("input khác → hash khác", () => {
    expect(hashKeyPart("a")).not.toBe(hashKeyPart("b"));
  });
});
