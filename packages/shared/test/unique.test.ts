import { describe, it, expect } from "vitest";
import { generateULID } from "../src/utils/unique";

describe("unique", () => {
  describe("generateULID", () => {
    it("returns a non-empty string", () => {
      const id = generateULID();
      expect(id).toBeTypeOf("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns a valid ULID length (26 characters)", () => {
      const id = generateULID();
      expect(id).toHaveLength(26);
    });

    it("returns a valid ULID length (26 characters) lowercase", () => {
      const id = generateULID().toLowerCase();
      console.log(id);
      expect(id).toHaveLength(26);
    });

    it("returns only Crockford base32 characters (0-9, A-Z excluding I, L, O, U)", () => {
      const crockfordBase32 = /^[0-9A-HJKMNP-TV-Z]{26}$/;
      const id = generateULID();
      expect(id).toMatch(crockfordBase32);
    });

    it("returns different values on each call", () => {
      const a = generateULID();
      const b = generateULID();
      expect(a).not.toBe(b);
    });
  });
});
