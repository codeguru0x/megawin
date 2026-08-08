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

// ── Balance types ────────────────────────────────────────────────────────────
export type { BalanceApi, BalanceData, GetBalanceRequest, GetBalanceResponse } from "./balance";
// ── Client interface ─────────────────────────────────────────────────────────
export type { TenantGatewayClient } from "./client";
// ── Logging policy ───────────────────────────────────────────────────────────
export { TxLoggingPolicy } from "./entities/enums";
// ── Main facade — cached, self-contained ─────────────────────────────────────
export { tenantGateway } from "./gateway";
export type {
  CallbackErrorInfo,
  CallbackResponse,
  TenantGatewayConfig,
  TransactionStatusErrorCode,
} from "./shared";
// ── Shared types — CallbackResponse envelope, error codes ────────────────────
export { BalanceErrorCode, TransactionErrorCode } from "./shared";
// ── Transaction types ────────────────────────────────────────────────────────
export type {
  BatchTransactionData,
  BatchTransactionItem,
  BatchTransactionItemResult,
  BatchTransactionRequest,
  BatchTransactionResponse,
  TransactionApi,
  TransactionCallOptions,
  TransactionData,
  TransactionRequest,
  TransactionResponse,
  TransactionStatusData,
  TransactionStatusResponse,
} from "./transaction";
