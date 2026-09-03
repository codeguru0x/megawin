/**
 * ResultFeed – Unit test: OxylabsUnblockerProvider
 *
 * PURE — không DB, KHÔNG gọi proxy Oxylabs thật. `fetchImpl` được inject giả để kiểm tra
 * đúng cách xây header (`02-fetch-parse.plan.md §1.1, §5.3`) và cách map response/lỗi
 * sang `FetchResult`, KHÔNG kiểm tra proxy tunnel thật (cần credentials thật — chờ user
 * cung cấp để test tích hợp riêng).
 */

import { describe, expect, it, vi } from "vitest";

import { OxylabsUnblockerProvider } from "../../../src/infras/providers/oxylabs-provider";

function fakeResponse(options: { status: number; body?: string; headers?: Record<string, string> }): Response {
  const headerMap = new Map(Object.entries(options.headers ?? {}));
  return {
    status: options.status,
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? headerMap.get(key) ?? null,
    },
    arrayBuffer: async () => new TextEncoder().encode(options.body ?? "").buffer,
  } as unknown as Response;
}

describe("OxylabsUnblockerProvider", () => {
  it("Đúng logic — 200 OK → ok=true, body giữ nguyên bytes, không có failureReason", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 200,
        body: "<html>ok</html>",
        headers: { "content-type": "text/html" },
      }),
    );
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(result.contentType).toBe("text/html");
    expect(result.body.toString("utf-8")).toBe("<html>ok</html>");
    expect(result.failureReason).toBeNull();
  });

  it("Đúng logic — header luôn có X-Oxylabs-Successful-Status-Codes (200,404) để không đốt retry nội bộ", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 200, body: "x" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    await provider.fetch({ url: "https://vietlott.vn/keno" });

    const callArgs = fetchImpl.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(callArgs.headers["X-Oxylabs-Successful-Status-Codes"]).toBe("200,404");
  });

  it("Đúng logic — req.country → set header x-oxylabs-geo-location", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 200, body: "x" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    await provider.fetch({ url: "https://vietlott.vn/keno", country: "vn" });

    const callArgs = fetchImpl.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(callArgs.headers["x-oxylabs-geo-location"]).toBe("vn");
  });

  it("Đúng logic — req.render=true → set header x-oxylabs-render=html", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 200, body: "x" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    await provider.fetch({ url: "https://vietlott.vn/keno", render: true });

    const callArgs = fetchImpl.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(callArgs.headers["x-oxylabs-render"]).toBe("html");
  });

  it("Đúng logic — render=false (mặc định) → KHÔNG set header x-oxylabs-render (tiết kiệm chi phí)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 200, body: "x" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    await provider.fetch({ url: "https://vietlott.vn/keno" });

    const callArgs = fetchImpl.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    expect(callArgs.headers["x-oxylabs-render"]).toBeUndefined();
  });

  it("Logic ngược — 401 (proxy credentials sai) → ok=false, failureReason nói rõ KHÔNG phải lỗi site nguồn, KHÔNG retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 401, body: "" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(401);
    expect(result.failureReason).toMatch(/không phải lỗi site nguồn/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("Logic ngược — 550 Faulted → ok=false, failureReason nói rõ Oxylabs đã tự retry nội bộ, KHÔNG retry thêm", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 550, body: "" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(550);
    expect(result.failureReason).toMatch(/550 Faulted/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("Logic ngược — 404 (Oxylabs khai là thành công) → ok=true, KHÔNG coi là lỗi", async () => {
    // Vietlott trả 404 cho kỳ chưa công bố — Unblocker vẫn coi là "successful" nhờ
    // X-Oxylabs-Successful-Status-Codes, KHÔNG được ta tự coi đây là lỗi transport.
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ status: 404, body: "not found page" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(404);
  });

  it("Đúng logic — retry khi 429/502/503/504 (lỗi transport CỦA OXYLABS), thành công ở lần retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 503, body: "" }))
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: "<html>ok</html>" }));
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("Đúng logic — X-Oxylabs-Final-Url có mặt → đưa vào providerMeta", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 200,
        body: "x",
        headers: { "x-oxylabs-final-url": "https://vietlott.vn/final" },
      }),
    );
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.providerMeta.finalUrl).toBe("https://vietlott.vn/final");
  });

  it("Logic ngược — timeout (AbortSignal.timeout) → wrap thành ApiClientError retryable, hết retry → throw", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      return Promise.reject(err);
    });
    const provider = new OxylabsUnblockerProvider({
      username: "u",
      password: "p",
      fetchImpl,
    });

    await expect(provider.fetch({ url: "https://vietlott.vn/keno", timeoutMs: 10 })).rejects.toThrow();
    // maxRetries: 2 → tổng 3 lần gọi (1 gốc + 2 retry).
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  }, 15_000);
});
