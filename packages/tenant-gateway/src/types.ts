/**
 * Tenant Gateway types.
 *
 * DTOs chuẩn cho giao tiếp MegaWin → Tenant server.
 * Tenant phải implement các callback endpoint theo spec này.
 */

// ============ Config ============

export interface TenantGatewayConfig {
  /** Base URL callback API của tenant (vd: "https://api.tenant.com") */
  callbackBaseUrl: string;
  /** API key mà tenant cung cấp cho MegaWin để gọi ngược */
  apiKey: string;
  /** Tenant ID */
  tenantId: string;
  /** Request timeout ms. Mặc định: 10000 */
  timeout?: number;
}

// ============ Balance ============

export interface DebitRequest {
  playerId: string;
  amount: number;
  currency: string;
  transactionId: string;
  gameId: string;
  roundId: string;
  description?: string;
}

export interface DebitResponse {
  transactionId: string;
  balance: number;
  currency: string;
}

export interface CreditRequest {
  playerId: string;
  amount: number;
  currency: string;
  transactionId: string;
  gameId: string;
  roundId: string;
  /** Reference tới debit transaction gốc */
  referenceTransactionId?: string;
  description?: string;
}

export interface CreditResponse {
  transactionId: string;
  balance: number;
  currency: string;
}

export interface RollbackRequest {
  playerId: string;
  transactionId: string;
  /** Debit transaction cần rollback */
  referenceTransactionId: string;
  gameId: string;
  roundId: string;
  reason?: string;
}

export interface RollbackResponse {
  transactionId: string;
  balance: number;
  currency: string;
}

export interface GetBalanceRequest {
  playerId: string;
  currency?: string;
}

export interface GetBalanceResponse {
  playerId: string;
  balance: number;
  currency: string;
}

// ============ Report ============

export interface SubmitReportRequest {
  reportType: "bet_settlement" | "round_result" | "daily_summary";
  gameId: string;
  roundId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SubmitReportResponse {
  acknowledged: boolean;
}

// ============ Client interface ============

export interface TenantGatewayClient {
  debit(req: DebitRequest): Promise<DebitResponse>;
  credit(req: CreditRequest): Promise<CreditResponse>;
  rollback(req: RollbackRequest): Promise<RollbackResponse>;
  getBalance(req: GetBalanceRequest): Promise<GetBalanceResponse>;
  submitReport(req: SubmitReportRequest): Promise<SubmitReportResponse>;
}
