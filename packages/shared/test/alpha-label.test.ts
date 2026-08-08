import { describe, it, expect } from "vitest";
import { numberToAlphaLabel, alphaLabelToNumber, alphaLabelSequence } from "../src/utils/alpha-label";

describe("alpha-label", () => {
  describe("numberToAlphaLabel (base-1)", () => {
    it("maps 1-26 to A-Z", () => {
      expect(numberToAlphaLabel(1)).toBe("A");
      expect(numberToAlphaLabel(2)).toBe("B");
      expect(numberToAlphaLabel(26)).toBe("Z");
    });

    it("maps 27+ to double letters", () => {
      expect(numberToAlphaLabel(27)).toBe("AA");
      expect(numberToAlphaLabel(28)).toBe("AB");
      expect(numberToAlphaLabel(52)).toBe("AZ");
      expect(numberToAlphaLabel(53)).toBe("BA");
      expect(numberToAlphaLabel(702)).toBe("ZZ");
      expect(numberToAlphaLabel(703)).toBe("AAA");
    });

    it("throws for ordinal < 1 or non-integer", () => {
      expect(() => numberToAlphaLabel(0)).toThrow(RangeError);
      expect(() => numberToAlphaLabel(-1)).toThrow(RangeError);
      expect(() => numberToAlphaLabel(1.5)).toThrow(RangeError);
    });
  });

  describe("alphaLabelToNumber (inverse, base-1)", () => {
    it("maps A-Z to 1-26", () => {
      expect(alphaLabelToNumber("A")).toBe(1);
      expect(alphaLabelToNumber("Z")).toBe(26);
    });

    it("maps double letters back", () => {
      expect(alphaLabelToNumber("AA")).toBe(27);
      expect(alphaLabelToNumber("ZZ")).toBe(702);
      expect(alphaLabelToNumber("AAA")).toBe(703);
    });

    it("throws for invalid label", () => {
      expect(() => alphaLabelToNumber("")).toThrow(RangeError);
      expect(() => alphaLabelToNumber("a")).toThrow(RangeError);
      expect(() => alphaLabelToNumber("A1")).toThrow(RangeError);
    });
  });

  describe("round-trip", () => {
    it("numberToAlphaLabel <-> alphaLabelToNumber for 1..1000", () => {
      for (let n = 1; n <= 1000; n++) {
        expect(alphaLabelToNumber(numberToAlphaLabel(n))).toBe(n);
      }
    });
  });

  describe("alphaLabelSequence", () => {
    it("returns empty array for 0", () => {
      expect(alphaLabelSequence(0)).toEqual([]);
    });

    it("returns continuous sequence from A", () => {
      expect(alphaLabelSequence(3)).toEqual(["A", "B", "C"]);
      expect(alphaLabelSequence(28)).toEqual([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), "AA", "AB"]);
    });
  });
});
