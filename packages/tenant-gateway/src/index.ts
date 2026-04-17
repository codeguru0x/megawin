/**
 * @megawin/tenant-gateway — Outbound HTTP client gọi callback API của tenant.
 *
 * MegaWin là game provider, tenant là đối tác phân phối.
 * Package này dùng để MegaWin gọi ngược vào API tenant thực hiện:
 * - Cộng/trừ tiền ví player (Transaction API).
 * - Query số dư (Balance API).
 *
 * ## Quick Start
 *
 * ```ts
 * import { tenantGateway } from "@megawin/tenant-gateway";
 *
 * const client = await tenantGateway.getClient("acme");
 * if (client) {
 *   await client.batchTransaction({ items: [...] });
 * }
 * ```
 *
 * @packageDocumentation
 */

// ── Client interface ─────────────────────────────────────────────────────────
export type { TenantGatewayClient } from "./client";

// ── Main facade — cached, self-contained ─────────────────────────────────────
export { tenantGateway } from "./gateway";

// ── Shared types — CallbackResponse envelope, error codes ────────────────────
export { TransactionErrorCode, BalanceErrorCode } from "./shared";
export type {
  CallbackResponse,
  CallbackErrorInfo,
  TenantGatewayConfig,
  TransactionStatusErrorCode,
} from "./shared";

// ── Transaction types ────────────────────────────────────────────────────────
export type {
  TransactionRequest,
  TransactionData,
  TransactionResponse,
  BatchTransactionItem,
  BatchTransactionRequest,
  BatchTransactionItemResult,
  BatchTransactionData,
  BatchTransactionResponse,
  TransactionStatusData,
  TransactionStatusResponse,
  TransactionApi,
} from "./transaction";

// ── Balance types ────────────────────────────────────────────────────────────
export type { GetBalanceRequest, GetBalanceResponse, BalanceData, BalanceApi } from "./balance";
