/**
 * Transaction API — gọi callback endpoint xử lý giao dịch trên ví player.
 *
 * Ba endpoint:
 * - `POST /transaction` — 1 giao dịch (bet debit, rollback).
 * - `POST /transaction/batch` — batch (payout, refund nhiều player).
 * - `GET /transaction/:tx/status` — kiểm tra trạng thái giao dịch (read-only).
 *
 * Mọi response theo {@link CallbackResponse} envelope: `success: boolean` + `data` / `error`.
 * Retry tích hợp sẵn trong HttpClient layer (exponential backoff, tối đa 3 lần cho status 502/503/504).
 * Idempotency đảm bảo retry an toàn — tenant xử lý trùng `tx` = trả kết quả cũ với `data.duplicate: true`.
 */

import type { HttpClient } from "@megawin/http-client";

import { CALLBACK_PATHS } from "../shared";
import type {
  TransactionRequest,
  TransactionResponse,
  BatchTransactionRequest,
  BatchTransactionResponse,
  TransactionStatusResponse,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TransactionApi Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface cho Transaction callback API.
 *
 * MegaWin dùng để gọi tenant server xử lý giao dịch cộng/trừ tiền player.
 * Implementation tự động retry khi tenant trả status code tạm thời (408, 429, 502-504).
 * **KHÔNG retry `500`** — coi là bug permanent.
 *
 * Mọi response dùng {@link CallbackResponse} envelope — consumer check `response.success`
 * thay vì string literal.
 */
export interface TransactionApi {
  /**
   * Thực hiện 1 giao dịch trên ví player.
   *
   * **Endpoint:** `POST /transaction`
   *
   * Dùng cho:
   * - Bet debit (trừ tiền khi player đặt cược).
   * - Rollback (hoàn tiền khi bet thất bại).
   * - Bonus credit (thưởng khuyến mãi).
   * - Adjustment (điều chỉnh thủ công).
   *
   * **Retry tầng HTTP:** Tự động retry tối đa 3 lần (502/503/504) với exponential backoff.
   * An toàn retry vì tenant xử lý idempotent qua `tx` — trả `data.duplicate: true`.
   *
   * **Business error (HTTP 200 + `success: false`):** Xoá WAL → reject bet → dừng hẳn, không retry.
   *
   * @param req - Payload giao dịch. @see {@link TransactionRequest}
   * @returns {@link TransactionResponse} — `success: true` + `data: TransactionData` hoặc `success: false` + `error`.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * // Debit khi player đặt cược
   * const result = await api.transaction({
   *   action: "debit",
   *   reason: "bet",
   *   tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
   *   playerId: "john_doe",
   *   amount: 150000,
   *   currency: "VND",
   *   gameId: "keno",
   *   roundIds: ["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"],
   * });
   *
   * if (!result.success) {
   *   // result.error?.code === "INSUFFICIENT_BALANCE"
   * }
   * // result.data!.balance — số dư sau giao dịch
   * ```
   */
  transaction(req: TransactionRequest): Promise<TransactionResponse>;

  /**
   * Thực hiện batch giao dịch trên ví nhiều players.
   *
   * **Endpoint:** `POST /transaction/batch`
   *
   * Dùng cho:
   * - Trả thưởng hàng loạt sau settle kỳ quay (`reason: "payout"`).
   * - Hoàn tiền hàng loạt khi void draw (`reason: "refund"`).
   *
   * **Batch size:** MegaWin gửi tối đa 50 items/batch.
   * Tenant xử lý từng item độc lập — partial success được chấp nhận.
   *
   * **Retry tầng HTTP:** Tự động retry toàn batch tối đa 3 lần (502/503/504) với exponential backoff.
   * Items đã duplicate sẽ trả lại kết quả cũ với `duplicate: true` khi retry — an toàn.
   *
   * **Business error per-item (HTTP 200 + item `success: false`):** MegaWin mark entry failed,
   * dispatch loop (Step Function) **chủ động gửi lại cùng `tx`** ở batch tiếp (tối đa 10 vòng).
   *
   * Response có 2 tầng:
   * - Outer: `success: true/false` — batch đã nhận và xử lý hay chưa.
   * - Inner: `data.results[].success` — từng item thành công hay thất bại.
   *
   * @param req - Payload chứa danh sách items. @see {@link BatchTransactionRequest}
   * @returns {@link BatchTransactionResponse} — outer envelope + per-item results.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * const result = await api.batchTransaction({
   *   items: [
   *     {
   *       action: "credit",
   *       reason: "payout",
   *       tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
   *       playerId: "john_doe",
   *       amount: 200000,
   *       currency: "VND",
   *       gameId: "keno",
   *       roundIds: ["2026-04-10.095"],
   *     },
   *   ],
   * });
   *
   * // Outer envelope thành công → iterate per-item results
   * if (result.success) {
   *   for (const r of result.data!.results) {
   *     if (r.success) {
   *       // mark entry dispatched
   *     } else {
   *       // r.error?.code — mark entry failed, retry later
   *     }
   *   }
   * }
   * ```
   */
  batchTransaction(req: BatchTransactionRequest): Promise<BatchTransactionResponse>;

  /**
   * Kiểm tra trạng thái giao dịch — read-only, không side effect.
   *
   * **Endpoint:** `GET /transaction/:tx/status`
   *
   * Recovery scheduler gọi API này khi tìm thấy orphan WAL (DEBIT_PENDING quá 30s).
   * Mục đích: xác nhận tiền đã thực sự bị trừ khỏi ví player chưa — để quyết định
   * có gửi rollback credit hay không.
   *
   * **Tại sao cần?** Ngăn **phantom credit** — scenario:
   * 1. MegaWin gửi debit → timeout (network) → tenant CHƯA nhận/xử lý.
   * 2. Recovery rollback ngay → gửi credit → tenant cộng tiền cho player.
   * 3. Kết quả: player nhận tiền miễn phí (debit không xảy ra, credit xảy ra).
   *
   * **Scheduler chỉ đọc `success` — không phân biệt error code:**
   * - `success: true` → tiền ĐÃ bị trừ (DB committed) → check ticket → markCompleted hoặc rollback credit.
   * - `success: false` → tiền CHƯA bị trừ (mọi lý do) → xoá WAL, không gửi rollback credit.
   * - timeout/5xx → indeterminate → retry lần sau.
   *
   * **Rule cho tenant implement status check:**
   * - Trả `success: true` khi và chỉ khi DB đã commit debit transaction.
   * - Trả `success: false` (với `error.code = "NOT_FOUND"` hoặc business error code) khi tiền chưa bị trừ.
   *
   * @param tx - Transaction ID (UUIDv7) cần kiểm tra.
   * @returns {@link TransactionStatusResponse} — `success` + `data.processedAt` hoặc `error`.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * const result = await api.checkTransactionStatus("019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b");
   *
   * if (result.success) {
   *   // Tiền ĐÃ bị trừ khỏi ví — kiểm tra ticket exists → rollback hoặc self-heal
   * } else {
   *   // Tiền CHƯA bị trừ (NOT_FOUND, business error, ...) → xoá WAL, an toàn
   *   // Scheduler không quan tâm error.code cụ thể là gì
   * }
   * ```
   */
  checkTransactionStatus(tx: string): Promise<TransactionStatusResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tạo TransactionApi instance từ HttpClient đã cấu hình.
 *
 * @internal Dùng bởi `createTenantGatewayClient` — không export ra ngoài package.
 */
export function createTransactionApi(http: HttpClient): TransactionApi {
  return {
    transaction: (req: TransactionRequest) =>
      http.post<TransactionResponse>(CALLBACK_PATHS.transaction, req),

    batchTransaction: (req: BatchTransactionRequest) =>
      http.post<BatchTransactionResponse>(CALLBACK_PATHS.batchTransaction, req),

    checkTransactionStatus: (tx: string) => {
      const path = CALLBACK_PATHS.transactionStatus.replace(":tx", tx);
      return http.get<TransactionStatusResponse>(path);
    },
  };
}
