/**
 * ResultFeed – context.dev Scrape HTML Provider (secondary transport)
 *
 * `02-fetch-parse.plan.md §1.1, §5.5`. Vai trò SECONDARY — chỉ dùng khi Oxylabs không
 * đạt hoặc cần failover (plan §5.5: 4 người/1 tuổi/$500k ⇒ rủi ro business continuity,
 * KHÔNG làm primary cho đường tiền).
 *
 * ⚠️ BẪY D2: mặc định context.dev trả Markdown (vendor đã "parse" hộ) — PHẢI dùng đúng
 * endpoint **Scrape HTML** (`GET /v1/web/scrape/html`), KHÔNG dùng Scrape Markdown/Extract.
 *
 * Nguồn tham khảo chính thức (đã verify request/response format trước khi viết, KHÔNG
 * đoán): {@link https://docs.context.dev/api-reference/web-scraping/html}.
 *
 * ⚠️ context.dev bọc HTML trong JSON (`{ success, html, url, type, metadata }`) — không
 * trả bytes gốc như Oxylabs Unblocker (mất provenance như phân tích ở plan §5.2 cho Web
 * Scraper API của Oxylabs). Chấp nhận được vì đây chỉ là nguồn CONFIRMING/secondary,
 * KHÔNG phải nguồn authoritative duy nhất cho đường tiền.
 */

import type { HttpClient } from "@megawin/http-client";
import { ApiClientError, createHttpClient } from "@megawin/http-client";
import { ResultFeedProviderId } from "@megawin/resultfeed/entities";

import type { FetchProvider, FetchRequest, FetchResult } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const BASE_URL = "https://api.context.dev/v1";

/** Shape response `200` của `GET /web/scrape/html` — xem OpenAPI context.dev. */
interface ContextDevScrapeSuccess {
  success: true;
  html: string;
  url: string;
  type: string;
  metadata: {
    sourceUrl?: string;
    finalUrl?: string;
    title?: string;
  };
}

export interface ContextDevProviderConfig {
  apiKey: string;
  /** Mặc định `https://api.context.dev/v1`. Override cho test/sandbox. */
  baseUrl?: string;
  /**
   * Inject HTTP client để unit test không cần API key thật.
   * Mặc định: `createHttpClient` (gọi API thật).
   * @internal
   */
  httpClient?: HttpClient;
}

/**
 * Provider transport secondary — chỉ "thuê bytes" (dưới dạng JSON-wrapped), KHÔNG parse
 * (D2, 00-overview.md). Luôn dùng endpoint Scrape HTML, KHÔNG dùng Markdown/Extract.
 */
export class ContextDevProvider implements FetchProvider {
  readonly providerId = ResultFeedProviderId.ContextDev;

  private readonly http: HttpClient;

  constructor(config: ContextDevProviderConfig) {
    this.http =
      config.httpClient ??
      createHttpClient({
        baseUrl: config.baseUrl ?? BASE_URL,
        headers: { Authorization: `Bearer ${config.apiKey}` },
        timeout: DEFAULT_TIMEOUT_MS,
      });
  }

  async fetch(req: FetchRequest): Promise<FetchResult> {
    const startedAt = Date.now();
    const fetchedAt = new Date(startedAt);

    try {
      // `rawResponse: true` — content.dev không theo convention ApiResponse<T> của
      // MegaWin (không có field `data`), phải nhận nguyên envelope, tự parse ở đây.
      const raw = await this.http.get<ContextDevScrapeSuccess>("/web/scrape/html", {
        params: {
          url: req.url,
          country: req.country,
          timeoutMS: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          // Không cache — nhận trang cache = lấy kỳ cũ tưởng kỳ mới (plan §5.5 P10).
          maxAgeMs: 0,
        },
        timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        rawResponse: true,
      });

      const elapsedMs = Date.now() - startedAt;

      return {
        ok: true,
        // context.dev KHÔNG trả httpStatus của site nguồn — dùng 200 (API call thành
        // công) làm proxy. Chấp nhận được vì vai trò chỉ CONFIRMING (plan §5.5).
        httpStatus: 200,
        contentType: "text/html",
        body: Buffer.from(raw.html, "utf-8"),
        providerMeta: {
          finalUrl: raw.metadata.finalUrl,
          detectedType: raw.type,
        },
        elapsedMs,
        fetchedAt,
        failureReason: null,
      };
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const httpStatus = err instanceof ApiClientError ? err.status : 0;
      const message = err instanceof Error ? err.message : "Network error khi gọi context.dev.";

      return {
        ok: false,
        httpStatus,
        contentType: "",
        body: Buffer.alloc(0),
        providerMeta: {},
        elapsedMs,
        fetchedAt,
        failureReason: message,
      };
    }
  }
}
