/**
 * ResultFeed – Oxylabs Web Unblocker Provider (primary transport)
 *
 * `02-fetch-parse.plan.md §1.1, §5.1-§5.3`. Web Unblocker hoạt động như một HTTPS
 * **proxy** (`unblock.oxylabs.io:60000`, xác thực bằng API user/pass RIÊNG của Web
 * Unblocker — KHÔNG phải login dashboard) — trả bytes GỐC (không JSON envelope). Đây là
 * lý do chọn Unblocker thay Web Scraper API (giữ được provenance bytes, xem plan §5.2).
 *
 * Nguồn tham khảo chính thức (đã verify request/response format trước khi viết, KHÔNG
 * đoán): {@link https://developers.oxylabs.io/products/web-unblocker/making-requests}.
 *
 * ⚠️ Proxy tunnel dùng certificate RIÊNG của Oxylabs (để MITM render/unblock) — PHẢI tắt
 * verify TLS (`rejectUnauthorized: false`) theo đúng hướng dẫn chính thức. Đây là kết nối
 * đã xác thực bằng username/password tới vendor, KHÔNG phải bỏ verify khi gọi trực tiếp
 * site nguồn.
 */

import { withRetry } from "@megawin/http-client";
import { ResultFeedProviderId } from "@megawin/resultfeed/entities";
import { ApiClientError } from "@megawin/shared/api-types";
import { type Dispatcher, ProxyAgent, fetch as undiciFetch } from "undici";

import type { FetchProvider, FetchRequest, FetchResult } from "./types";

/** Trang server-rendered không cần render — nhanh nhất (plan §5.3). */
const DEFAULT_TIMEOUT_MS = 30_000;
/** `x-oxylabs-render: html` đẩy timeout lên tới ~180s (plan §5.3) — chỉ khi `req.render`. */
const RENDER_TIMEOUT_MS = 180_000;

/** Status code coi là lỗi TRANSPORT của chính Oxylabs (rate limit, gateway) — được retry. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
/** API user/pass Web Unblocker không hợp lệ — lỗi config, KHÔNG retry. */
const OXYLABS_UNAUTHORIZED_STATUS = 401;
/** Oxylabs không truy cập được site nguồn sau khi tự retry nội bộ — KHÔNG retry thêm. */
const OXYLABS_FAULTED_STATUS = 550;

export interface OxylabsUnblockerConfig {
  username: string;
  password: string;
  /** Mặc định `https://unblock.oxylabs.io:60000`. Override cho test/sandbox. */
  proxyUri?: string;
  /**
   * Inject transport để unit test không cần proxy/credential thật.
   * Mặc định: `undici` `fetch` qua `ProxyAgent` (kết nối proxy thật).
   * @internal
   */
  fetchImpl?: typeof undiciFetch;
}

/**
 * Provider transport primary — chỉ "thuê bytes", KHÔNG parse (D2, 00-overview.md).
 *
 * Retry: chỉ retry lỗi transport (timeout, network, 429/502/503/504 CỦA CHÍNH OXYLABS).
 * KHÔNG retry khi Oxylabs trả 200 nhưng nội dung site sai (kỳ chưa có) — đó là việc của
 * lịch fetch (`SourceCursorRepository`), không phải retry ở tầng transport.
 */
export class OxylabsUnblockerProvider implements FetchProvider {
  readonly providerId = ResultFeedProviderId.OxylabsUnblocker;

  private readonly dispatcher: Dispatcher;
  private readonly fetchImpl: typeof undiciFetch;

  constructor(config: OxylabsUnblockerConfig) {
    const proxyUri = config.proxyUri ?? "https://unblock.oxylabs.io:60000";
    this.dispatcher = new ProxyAgent({
      uri: proxyUri,
      auth: Buffer.from(`${config.username}:${config.password}`).toString("base64"),
      requestTls: { rejectUnauthorized: false },
      proxyTls: { rejectUnauthorized: false },
    });
    this.fetchImpl = config.fetchImpl ?? undiciFetch;
  }

  async fetch(req: FetchRequest): Promise<FetchResult> {
    const timeoutMs = req.timeoutMs ?? (req.render ? RENDER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

    return await withRetry(() => this.executeOnce(req, timeoutMs), {
      maxRetries: 2,
      retryableStatuses: [0, 408, 429, 502, 503, 504],
    });
  }

  private buildHeaders(req: FetchRequest): Record<string, string> {
    const headers: Record<string, string> = { ...req.headers };

    if (req.country) {
      headers["x-oxylabs-geo-location"] = req.country;
    }
    if (req.render) {
      headers["x-oxylabs-render"] = "html";
    }
    // Vietlott trả status lạ cho kỳ CHƯA công bố — khai "thành công" để Unblocker KHÔNG
    // đốt retry nội bộ cho câu trả lời "chưa có" (plan §5.3, §1.1).
    headers["X-Oxylabs-Successful-Status-Codes"] = "200,404";

    return headers;
  }

  private async executeOnce(req: FetchRequest, timeoutMs: number): Promise<FetchResult> {
    const startedAt = Date.now();
    const fetchedAt = new Date(startedAt);

    try {
      const response = await this.fetchImpl(req.url, {
        method: "GET",
        headers: this.buildHeaders(req),
        dispatcher: this.dispatcher as Dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (RETRYABLE_STATUSES.has(response.status)) {
        throw new ApiClientError(response.status, {
          code: "NETWORK_ERROR",
          message: `Oxylabs Unblocker trả status ${response.status} — lỗi transport phía vendor, không phải nội dung site nguồn.`,
        });
      }

      const body = Buffer.from(await response.arrayBuffer());
      const elapsedMs = Date.now() - startedAt;
      const finalUrl = response.headers.get("x-oxylabs-final-url");

      // 401 ở đây là lỗi AUTH TỚI PROXY (API user/pass Web Unblocker sai) — KHÔNG phải
      // status của site nguồn. 550 Faulted = Oxylabs đã tự retry nội bộ nhưng vẫn
      // không vào được site. Cả hai KHÔNG retry thêm ở tầng ta (retry không sửa được).
      const failureReason =
        response.status === OXYLABS_UNAUTHORIZED_STATUS
          ? "Oxylabs Unblocker: API user/pass không hợp lệ (401) — kiểm tra lại credentials, không phải lỗi site nguồn."
          : response.status === OXYLABS_FAULTED_STATUS
            ? "Oxylabs Unblocker không truy cập được site nguồn sau khi tự retry nội bộ (550 Faulted)."
            : null;

      return {
        ok: failureReason === null,
        httpStatus: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body,
        providerMeta: finalUrl ? { finalUrl } : {},
        elapsedMs,
        fetchedAt,
        failureReason,
      };
    } catch (err) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      const isAbort = err instanceof Error && err.name === "TimeoutError";
      // Wrap thành ApiClientError để withRetry nhận diện đây là lỗi transport retryable.
      throw new ApiClientError(isAbort ? 408 : 0, {
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        message: isAbort
          ? `Oxylabs Unblocker timeout sau ${timeoutMs}ms.`
          : err instanceof Error
            ? err.message
            : "Network error khi gọi Oxylabs Unblocker.",
      });
    }
  }
}
