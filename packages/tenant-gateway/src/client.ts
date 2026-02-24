/**
 * TenantGatewayClient -- HTTP client gọi callback API của tenant.
 *
 * MegaWin gọi tenant server để:
 * - Trừ/cộng tiền player (debit/credit)
 * - Rollback giao dịch lỗi
 * - Kiểm tra số dư
 * - Gửi báo cáo (settlement, round result)
 *
 * Security: API Key header (tenant cung cấp cho MegaWin).
 * Retry: exponential backoff với idempotency qua transactionId.
 */

import {
  createHttpClient,
  type HttpClient,
  ApiClientError,
} from "@megawin/http-client";

import type {
  TenantGatewayConfig,
  TenantGatewayClient,
  DebitRequest,
  DebitResponse,
  CreditRequest,
  CreditResponse,
  RollbackRequest,
  RollbackResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  SubmitReportRequest,
  SubmitReportResponse,
  BatchPayoutRequest,
  BatchPayoutResponse,
  BatchRefundRequest,
  BatchRefundResponse,
} from "./types";

// ============ Retry config ============

const DEFAULT_TIMEOUT = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries) break;

      const shouldRetry =
        err instanceof ApiClientError &&
        RETRYABLE_STATUS_CODES.has(err.status);

      if (!shouldRetry) break;

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * delay * 0.3;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

// ============ Callback paths ============

const PATHS = {
  debit: "/megawin/callback/debit",
  credit: "/megawin/callback/credit",
  rollback: "/megawin/callback/rollback",
  balance: "/megawin/callback/balance",
  report: "/megawin/callback/report",
  batchPayout: "/megawin/callback/payout/batch",
  batchRefund: "/megawin/callback/refund/batch",
} as const;

// ============ Factory ============

export function createTenantGatewayClient(
  config: TenantGatewayConfig,
): TenantGatewayClient {
  const { callbackBaseUrl, apiKey, tenantId, timeout = DEFAULT_TIMEOUT } = config;

  const http: HttpClient = createHttpClient({
    baseUrl: callbackBaseUrl,
    timeout,
    headers: {
      "X-Api-Key": apiKey,
      "X-Tenant-Id": tenantId,
    },
  });

  return {
    debit: (req: DebitRequest) =>
      withRetry(() => http.post<DebitResponse>(PATHS.debit, req)),

    credit: (req: CreditRequest) =>
      withRetry(() => http.post<CreditResponse>(PATHS.credit, req)),

    rollback: (req: RollbackRequest) =>
      withRetry(() => http.post<RollbackResponse>(PATHS.rollback, req)),

    getBalance: (req: GetBalanceRequest) =>
      withRetry(() =>
        http.get<GetBalanceResponse>(PATHS.balance, {
          params: {
            playerId: req.playerId,
            currency: req.currency,
          },
        }),
      ),   

    submitReport: (req: SubmitReportRequest) =>
      withRetry(() => http.post<SubmitReportResponse>(PATHS.report, req)),

    batchPayout: (req: BatchPayoutRequest) =>
      withRetry(() => http.post<BatchPayoutResponse>(PATHS.batchPayout, req)),

    batchRefund: (req: BatchRefundRequest) =>
      withRetry(() => http.post<BatchRefundResponse>(PATHS.batchRefund, req)),
  };
}
 