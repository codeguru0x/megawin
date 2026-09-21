/**
 * PURE — không DB. withDeadline + DeadlineExceededError + chống rò timer.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { DeadlineExceededError, withDeadline } from "../../src/redis/with-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withDeadline", () => {
  it("task xong trước deadline → trả đúng value", async () => {
    await expect(withDeadline(Promise.resolve(42), 1000, "ok")).resolves.toBe(42);
  });

  it("task chậm hơn deadline → reject DeadlineExceededError, label trong message", async () => {
    vi.useFakeTimers();
    const slow = new Promise<number>(() => {
      // Không bao giờ resolve — chỉ deadline cắt.
    });
    const pending = withDeadline(slow, 100, "RedisClient.connect");
    const assertion = pending.then(
      () => {
        throw new Error("expected reject");
      },
      (err: unknown) => {
        expect(err).toBeInstanceOf(DeadlineExceededError);
        expect((err as DeadlineExceededError).deadlineMs).toBe(100);
        expect((err as DeadlineExceededError).message).toMatch(/RedisClient\.connect/);
      },
    );
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("task reject trước deadline → giữ nguyên lỗi gốc", async () => {
    const original = new Error("lỗi gốc từ task");
    await expect(withDeadline(Promise.reject(original), 1000, "label")).rejects.toBe(original);
  });

  it("timer được clear khi task resolve sớm", async () => {
    vi.useFakeTimers();
    await withDeadline(Promise.resolve("done"), 60_000, "early");
    expect(vi.getTimerCount()).toBe(0);
  });
});
