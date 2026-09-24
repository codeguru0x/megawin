/**
 * PURE — không Redis, không Docker.
 *
 * Vector cố định + biên cho `computeGcraParams` (p0-01 B1 #1–#6).
 */

import { describe, expect, it } from "vitest";

import { computeGcraParams } from "../../src/rate-limit/gcra-math";

describe("computeGcraParams", () => {
  it("{limit: 30, windowSec: 60} → emissionIntervalMs = 2000", () => {
    const params = computeGcraParams({ limit: 30, windowSec: 60 });
    expect(params.emissionIntervalMs).toBe(2000);
  });

  it("{limit: 30, windowSec: 60, burst: 5} → delayToleranceMs = 10000", () => {
    const params = computeGcraParams({ limit: 30, windowSec: 60, burst: 5 });
    expect(params.delayToleranceMs).toBe(10_000);
    // burst × emissionInterval
    expect(params.delayToleranceMs).toBe(5 * params.emissionIntervalMs);
  });

  it("burst: 0 → delayToleranceMs = 0", () => {
    const params = computeGcraParams({ limit: 30, windowSec: 60, burst: 0 });
    expect(params.delayToleranceMs).toBe(0);
  });

  it("limit: 1, windowSec: 1 → emissionIntervalMs = 1000", () => {
    const params = computeGcraParams({ limit: 1, windowSec: 1 });
    expect(params.emissionIntervalMs).toBe(1000);
  });

  it("limit: 0 hoặc windowSec: 0 → throw", () => {
    expect(() => computeGcraParams({ limit: 0, windowSec: 60 })).toThrow();
    expect(() => computeGcraParams({ limit: 30, windowSec: 0 })).toThrow();
  });

  it("kết quả luôn là số nguyên ms", () => {
    const cases = [
      { limit: 30, windowSec: 60 },
      { limit: 7, windowSec: 10 },
      { limit: 3, windowSec: 1, burst: 2 },
      { limit: 100, windowSec: 1 },
    ];

    for (const rule of cases) {
      const params = computeGcraParams(rule);
      expect(Number.isInteger(params.emissionIntervalMs)).toBe(true);
      expect(Number.isInteger(params.delayToleranceMs)).toBe(true);
    }
  });

  // ── p0-01b R1–R5: clamp emissionIntervalMs ≥ 1 ────────────────────────────

  it("R1: {limit: 2000, windowSec: 1} → emissionIntervalMs === 1 (không 0)", () => {
    const params = computeGcraParams({ limit: 2000, windowSec: 1 });
    expect(params.emissionIntervalMs).toBe(1);
  });

  it("R2: {limit: 1000, windowSec: 0.5} → emissionIntervalMs === 1 (windowSec fractional)", () => {
    const params = computeGcraParams({ limit: 1000, windowSec: 0.5 });
    expect(params.emissionIntervalMs).toBe(1);
  });

  it("R3: emissionIntervalMs >= 1 với mọi case trong bảng vector", () => {
    const cases = [
      { limit: 30, windowSec: 60 },
      { limit: 7, windowSec: 10 },
      { limit: 3, windowSec: 1, burst: 2 },
      { limit: 100, windowSec: 1 },
      { limit: 2000, windowSec: 1 },
      { limit: 1000, windowSec: 0.5 },
      { limit: 1, windowSec: 1 },
    ];

    for (const rule of cases) {
      const params = computeGcraParams(rule);
      expect(params.emissionIntervalMs).toBeGreaterThanOrEqual(1);
    }
  });

  it("R4: {limit: 30, windowSec: 60} vẫn === 2000 — clamp không đổi đường thường", () => {
    const params = computeGcraParams({ limit: 30, windowSec: 60 });
    expect(params.emissionIntervalMs).toBe(2000);
  });

  it("R5: {limit: 2000, windowSec: 1, burst: 3} → delayToleranceMs === 3 (dt theo ei đã clamp)", () => {
    const params = computeGcraParams({ limit: 2000, windowSec: 1, burst: 3 });
    expect(params.delayToleranceMs).toBe(3);
    expect(params.delayToleranceMs).toBe(3 * params.emissionIntervalMs);
  });
});
