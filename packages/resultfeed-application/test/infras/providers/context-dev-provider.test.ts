/**
 * ResultFeed – Unit test: ContextDevProvider
 *
 * PURE — không DB, KHÔNG gọi API context.dev thật. `httpClient` được inject giả để
 * kiểm tra đúng endpoint/params (`02-fetch-parse.plan.md §1.1, §5.5`) và cách map
 * response/lỗi sang `FetchResult`.
 */

import type { HttpClient } from "@megawin/http-client";
import { ApiClientError } from "@megawin/http-client";
import { describe, expect, it, vi } from "vitest";

import { ContextDevProvider } from "../../../src/infras/providers/context-dev-provider";

function fakeHttpClient(getImpl: HttpClient["get"]): HttpClient {
  return {
    get: getImpl,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe("ContextDevProvider", () => {
  it("Đúng logic — gọi ĐÚNG endpoint Scrape HTML (/web/scrape/html), KHÔNG dùng Markdown/Extract (bẫy D2)", async () => {
    const getMock = vi.fn().mockResolvedValue({
      success: true,
      html: "<html>ok</html>",
      url: "https://vietlott.vn/keno",
      type: "html",
      metadata: { finalUrl: "https://vietlott.vn/keno" },
    });
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(getMock).toHaveBeenCalledWith(
      "/web/scrape/html",
      expect.objectContaining({
        rawResponse: true,
        params: expect.objectContaining({ url: "https://vietlott.vn/keno" }),
      }),
    );
  });

  it("Đúng logic — response success → ok=true, body = html field (UTF-8 bytes)", async () => {
    const getMock = vi.fn().mockResolvedValue({
      success: true,
      html: "<html>nội dung</html>",
      url: "https://vietlott.vn/keno",
      type: "html",
      metadata: { finalUrl: "https://vietlott.vn/keno-final" },
    });
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(true);
    expect(result.body.toString("utf-8")).toBe("<html>nội dung</html>");
    expect(result.providerMeta.finalUrl).toBe("https://vietlott.vn/keno-final");
    expect(result.failureReason).toBeNull();
  });

  it("Đúng logic — LUÔN gửi maxAgeMs=0 — không nhận trang cache (chống lấy nhầm kỳ cũ, plan P10)", async () => {
    const getMock = vi.fn().mockResolvedValue({
      success: true,
      html: "x",
      url: "u",
      type: "html",
      metadata: {},
    });
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    await provider.fetch({ url: "https://vietlott.vn/keno" });

    const callOptions = getMock.mock.calls[0]?.[1] as {
      params: Record<string, unknown>;
    };
    expect(callOptions.params.maxAgeMs).toBe(0);
  });

  it("Logic ngược — API trả lỗi (400 WEBSITE_BLOCKED) → ok=false, failureReason có message, KHÔNG throw ra ngoài", async () => {
    const getMock = vi.fn().mockRejectedValue(
      new ApiClientError(400, {
        code: "WEBSITE_BLOCKED",
        message: "Target site blocked the request",
      }),
    );
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(400);
    expect(result.failureReason).toMatch(/blocked/i);
    expect(result.body.length).toBe(0);
  });

  it("Logic ngược — network error (không phải ApiClientError) → ok=false, httpStatus=0", async () => {
    const getMock = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNRESET"));
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    const result = await provider.fetch({ url: "https://vietlott.vn/keno" });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(0);
    expect(result.failureReason).toMatch(/ECONNRESET/);
  });

  it("Đúng logic — req.country → truyền vào params.country", async () => {
    const getMock = vi.fn().mockResolvedValue({
      success: true,
      html: "x",
      url: "u",
      type: "html",
      metadata: {},
    });
    const provider = new ContextDevProvider({
      apiKey: "key",
      httpClient: fakeHttpClient(getMock),
    });

    await provider.fetch({ url: "https://vietlott.vn/keno", country: "vn" });

    const callOptions = getMock.mock.calls[0]?.[1] as {
      params: Record<string, unknown>;
    };
    expect(callOptions.params.country).toBe("vn");
  });
});
