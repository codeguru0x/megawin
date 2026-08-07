/**
 * PURE — không DB.
 *
 * Unit test cho LockTakenOverError — signal nội bộ phân biệt mất-lock vs item-lỗi.
 */

import { describe, it, expect } from "vitest";
import { LockTakenOverError } from "../src/use-cases/lock/lock-taken-over-error";

describe("LockTakenOverError", () => {
  it("là Error với name đúng và message chứa lockKey", () => {
    const err = new LockTakenOverError("keno:tick");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LockTakenOverError");
    expect(err.message).toContain("keno:tick");
  });

  it("nhận diện được qua instanceof (để re-throw thay vì nuốt như item lỗi)", () => {
    const err: unknown = new LockTakenOverError("x");
    expect(err instanceof LockTakenOverError).toBe(true);
    expect(new Error("plain") instanceof LockTakenOverError).toBe(false);
  });
});
