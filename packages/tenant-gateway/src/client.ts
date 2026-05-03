/**
 * TenantGatewayClient — HTTP client gọi callback API của tenant.
 *
 * MegaWin gọi tenant server để:
 * - Trừ/cộng tiền player qua Transaction API.
 * - Kiểm tra số dư qua Balance API.
 *
 * Security: API Key qua header `x-api-key` (tenant cung cấp cho MegaWin).
 * Retry: exponential backoff (500ms base, max 3 retries) cho mọi request — tích hợp
 * sẵn trong HttpClient layer, không cần wrap thủ công.
 * Idempotency: mọi transaction có `tx` unique — retry an toàn.
 *
 * Client được tạo per-tenant tại runtime từ {@link TenantGatewayConfig}.
 * Callers gọi `createTenantGatewayClient(config)` với config load từ TenantConfig DB.
 *
 * @example
 * ```ts
 * import { createTenantGatewayClient } from "@megawin/tenant-gateway";
 *
 * const gateway = createTenantGatewayClient({
 *   callbackBaseUrl: "https://api.tenant.com",
 *   apiKey: "sk_live_abc123",
 *   tenantId: "acme",
 *   timeout: 30_000,
 * });
 *
 * // Single transaction — bet debit
 * const result = await gateway.transaction({
 *   action: "debit",
 *   reason: "bet",
 *   tx: "bet-01HXYZ123ABC",
 *   playerId: "john_doe",
 *   amount: 50000,
 *   currency: "VND",
 * });
 *
 * // Batch transaction — payout
 * const batch = await gateway.batchTransaction({
 *   items: [
 *     { action: "credit", reason: "payout", tx: "payout-keno-...", ... },
 *   ],
 * });
 *
 * // Balance check
 * const result = await gateway.getBalance({ playerId: "john_doe" });
 * if (result.success) console.log(result.data!.balance);
 * ```
 */

import { createHttpClient, type HttpClient } from "@megawin/http-client";

import type { TenantGatewayConfig } from "./shared/types";
import { createTransactionApi, type TransactionApi } from "./transaction";
import { createBalanceApi, type BalanceApi } from "./balance";

/** Default timeout cho HTTP requests (ms). */
const DEFAULT_TIMEOUT = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// TenantGatewayClient Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composite client gộp tất cả callback APIs.
 *
 * Hiện tại gồm {@link TransactionApi} và {@link BalanceApi}.
 * Khi thêm API mới (report, notification, ...) sẽ extend thêm.
 *
 * Tạo instance qua {@link createTenantGatewayClient}.
 */
export interface TenantGatewayClient extends TransactionApi, BalanceApi {}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tạo TenantGatewayClient từ config của tenant.
 *
 * Khởi tạo HTTP client với:
 * - `x-api-key` header — authenticate request từ MegaWin.
 * - `x-tenant-id` header — identify tenant.
 * - Timeout mặc định 10s, override được qua config.
 *
 * Mỗi lần gọi tạo client mới — không cache. Callers tạo client tại đầu use case,
 * dùng xong bỏ. Phù hợp cho serverless (Lambda) vì không giữ state.
 *
 * @param config - Cấu hình kết nối: URL, API key, tenant ID, timeout.
 * @returns Client với đầy đủ Transaction + Balance APIs.
 *
 * @example
 * ```ts
 * // Load config từ DB
 * const tenantConfig = await tenantConfigRepo.getTenantConfig(tenantId);
 *
 * const gateway = createTenantGatewayClient({
 *   callbackBaseUrl: tenantConfig.callbackBaseUrl,
 *   apiKey: tenantConfig.apiKey ?? "",
 *   tenantId,
 *   timeout: 30_000,
 * });
 *
 * // Sử dụng
 * await gateway.transaction({ ... });
 * await gateway.batchTransaction({ ... });
 * const { balance } = await gateway.getBalance({ playerId: "john_doe" });
 * ```
 */
export function createTenantGatewayClient(config: TenantGatewayConfig): TenantGatewayClient {
  const { callbackBaseUrl, apiKey, tenantId, timeout = DEFAULT_TIMEOUT } = config;

  const http: HttpClient = createHttpClient({
    baseUrl: callbackBaseUrl,
    timeout,
    retry: 3,
    headers: {
      "x-api-key": apiKey,
      "x-tenant-id": tenantId,
    },
  });

  // Compose từ các sub-APIs.
  // Khi thêm API mới, tạo factory mới và spread vào đây.
  const transactionApi = createTransactionApi(http, tenantId);
  const balanceApi = createBalanceApi(http);

  return {
    ...transactionApi,
    ...balanceApi,
  };
}
