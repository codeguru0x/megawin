/**
 * Test cho `tryLoad` — primitive dùng ở endpoint aggregate nhiều nguồn.
 *
 * Trọng tâm: PHÂN LOẠI lỗi. "Vắng mặt nghiệp vụ" (NOT_FOUND / null) phải im lặng, mọi lỗi
 * khác PHẢI được log — nuốt im lặng lỗi hạ tầng là bug đã từng xảy ra thật ở dashboard.
 */

import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_ERROR_CODES, AppException } from "../src/errors";
import { tryLoad } from "../src/utils/async";

const OPTS = { scope: "TestScope", source: "test-source" };

describe("tryLoad", () => {
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    // Chặn output thật để test không làm nhiễu log, đồng thời đếm được số lần log.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trả về data khi load thành công", async () => {
    const result = await tryLoad(async () => ({ amount: 100 }), OPTS);

    expect(result).toEqual({ amount: 100 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("trả undefined và KHÔNG log khi load trả null (nguồn vắng mặt)", async () => {
    const result = await tryLoad(async () => null, OPTS);

    expect(result).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("trả undefined và KHÔNG log khi throw NOT_FOUND (trạng thái nghiệp vụ)", async () => {
    const result = await tryLoad(async () => {
      throw AppException.notFound("Không tìm thấy jackpot hiện tại.");
    }, OPTS);

    expect(result).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("LOG error kèm scope/source khi lỗi bất thường (DB down, bug)", async () => {
    const result = await tryLoad(async () => {
      throw new Error("connection timed out");
    }, OPTS);

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // Log phải trace được scope + nguồn nào lỗi, nếu không thì aggregate nhiều nguồn vô dụng khi debug.
    const call = errorSpy.mock.calls[0];
    expect(call).toBeDefined();
    const [label, message, ctx] = call as unknown[];
    expect(label).toContain("TestScope");
    expect(message).toContain("connection timed out");
    expect(ctx).toMatchObject({ source: "test-source" });
  });

  it("LOG error khi AppException có code KHÁC absentCodes", async () => {
    const result = await tryLoad(async () => {
      throw new AppException(APP_ERROR_CODES.INTERNAL, "config lỗi");
    }, OPTS);

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("absentCodes: [] coi MỌI lỗi là bất thường — NOT_FOUND cũng bị log", async () => {
    const result = await tryLoad(
      async () => {
        throw AppException.notFound("thiếu bắt buộc");
      },
      { ...OPTS, absentCodes: [] },
    );

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("absentCodes tuỳ biến: code được liệt kê thì im lặng", async () => {
    const result = await tryLoad(
      async () => {
        throw new AppException(APP_ERROR_CODES.FORBIDDEN, "không có quyền");
      },
      { ...OPTS, absentCodes: [APP_ERROR_CODES.FORBIDDEN] },
    );

    expect(result).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("bắt cả throw ĐỒNG BỘ trong load (không làm reject Promise.all)", async () => {
    const result = await tryLoad(() => {
      throw new Error("sync boom");
    }, OPTS);

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("không bao giờ reject — 1 nguồn lỗi không làm hỏng Promise.all", async () => {
    const results = await Promise.all([
      tryLoad(async () => "ok", OPTS),
      tryLoad(async () => {
        throw new Error("boom");
      }, OPTS),
      tryLoad(async () => null, OPTS),
    ]);

    expect(results).toEqual(["ok", undefined, undefined]);
    expect(results.filter((r) => r !== undefined)).toEqual(["ok"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
