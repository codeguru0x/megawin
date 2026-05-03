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
import { generateId } from "@megawin/shared/utils";

import { TxLogEventType, TxLogStatus, TxLoggingPolicy } from "../entities/enums";
import type { TxLogInput } from "../entities/tx-log";
import { CALLBACK_PATHS } from "../shared";
import {
  classifyItem,
  classifyBatchOuterReject,
  classifyThrown,
  type ClassifiedOutcome,
} from "../shared/tx-log-classifier";
import { logTxUseCase, logTxBulkUseCase } from "../shared/tx-logging";
import type {
  TransactionRequest,
  TransactionResponse,
  BatchTransactionRequest,
  BatchTransactionResponse,
  BatchTransactionItem,
  TransactionStatusResponse,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Logging policy — kiểm soát việc ghi `tx_logs` theo call site
// ─────────────────────────────────────────────────────────────────────────────

/** Options chung cho `transaction` / `batchTransaction` — tách metadata khỏi payload gửi tenant. */
export interface TransactionCallOptions {
  /**
   * Policy ghi `tx_logs`. Default: `TxLoggingPolicy.Always` — log mọi outcome
   * (backward compat). Xem {@link TxLoggingPolicy} cho chi tiết từng policy
   * và bảng quy tắc.
   */
  logging?: TxLoggingPolicy;
}

/**
 * Quyết định có skip log cho 1 outcome không, dựa trên policy.
 *
 * Khi `policy === TxLoggingPolicy.OnSuccessOrUncertain`, chỉ log outcome mà
 * system còn giữ state → cần reconcile hoặc forensic:
 * - Success (audit trail).
 * - Uncertainty: timeout, network, HTTP 5xx/408/429, batch outer reject →
 *   WAL / dispatch order chưa được clear, scheduler sẽ retry.
 *
 * Skip mọi case tenant đã **dứt khoát từ chối** (system lập tức
 * `safeDeleteWal`, không còn gì reconcile):
 * - Business reject (HTTP 200 + `success: false`).
 * - HTTP 400 / 401 reject ở HTTP layer.
 *
 * Module-level pure function — không có closure state, safe để call N lần.
 */
function shouldSkipLog(policy: TxLoggingPolicy, outcome: ClassifiedOutcome): boolean {
  if (policy === TxLoggingPolicy.Off) {
    return true;
  }

  if (policy === TxLoggingPolicy.Always) {
    return false;
  }

  // policy === TxLoggingPolicy.OnSuccessOrUncertain — whitelist các case LOG,

  // còn lại skip. An toàn hơn blacklist (network error không có httpStatus
  // nhưng vẫn uncertainty → phải log).

  // Success case: log luôn.
  if (outcome.status === TxLogStatus.Success) {
    return false;
  }

  const err = outcome.error;
  if (!err) {
    return false; // defensive — Failed mà thiếu error thì log cho dễ debug.
  }

  // Batch outer reject hoặc transport-level uncertainty.
  if (err.batchOuterRejected) {
    return false;
  }

  if (err.code === "TIMEOUT" || err.code === "NETWORK_ERROR") {
    return false;
  }

  // HTTP-level uncertainty — 408 timeout (nếu không phải code TIMEOUT),
  // 429 rate limit, 5xx server error. Tenant chưa chắc đã nhận được / apply
  // transaction → WAL giữ cho scheduler.
  if (
    err.httpStatus !== undefined &&
    (err.httpStatus >= 500 || err.httpStatus === 408 || err.httpStatus === 429)
  ) {
    return false;
  }

  // Còn lại: business reject (HTTP 200 + `success: false`), HTTP 400 / 401 —
  // tenant dứt khoát từ chối → caller safeDeleteWal → không cần log.
  return true;
}

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
   * @param options - Call options (logging policy, …). @see {@link TransactionCallOptions}
   * @returns {@link TransactionResponse} — `success: true` + `data: TransactionData` hoặc `success: false` + `error`.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * // Debit khi player đặt cược — align với safeDeleteWal lifecycle, skip
   * // log case system cleanup (business reject / HTTP 4xx).
   * const result = await api.transaction(
   *   {
   *     action: "debit",
   *     reason: "bet",
   *     tx: "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
   *     playerId: "john_doe",
   *     amount: 150000,
   *     currency: "VND",
   *     gameId: "keno",
   *     roundIds: ["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"],
   *   },
   *   { logging: TxLoggingPolicy.OnSuccessOrUncertain },
   * );
   *
   * if (!result.success) {
   *   // result.error?.code === "INSUFFICIENT_BALANCE"
   * }
   * // result.data!.balance — số dư sau giao dịch
   * ```
   */
  transaction(
    req: TransactionRequest,
    options?: TransactionCallOptions,
  ): Promise<TransactionResponse>;

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
   * @param options - Call options (logging policy, …). @see {@link TransactionCallOptions}
   * @returns {@link BatchTransactionResponse} — outer envelope + per-item results.
   * @throws {@link ApiClientError} khi tenant server lỗi sau hết retry.
   *
   * @example
   * ```ts
   * // Dispatch credit/payout dùng default `Always` — luôn log, audit đầy đủ.
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
  batchTransaction(
    req: BatchTransactionRequest,
    options?: TransactionCallOptions,
  ): Promise<BatchTransactionResponse>;

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
 * Mọi call đều set `rawResponse: true` — tenant callback trả envelope
 * {@link CallbackResponse} 2 tầng (outer + per-item), và `success: false` là
 * câu trả lời nghiệp vụ hợp lệ (ví dụ status check `NOT_FOUND`). HttpClient
 * default sẽ auto-unwrap + throw khi `success: false` → mất thông tin và
 * làm dispatch loop / recovery scheduler rẽ sai nhánh.
 *
 * ## Logging (fire-and-forget, không block flow)
 *
 * Wrap `transaction` và `batchTransaction` để log audit vào `tx_logs`:
 * - 1 doc / item (batch sinh N docs cùng `batchId`).
 * - Log thành công hoặc thất bại theo {@link TxLoggingPolicy} mà caller chọn.
 * - Default `TxLoggingPolicy.Always` — log mọi outcome (dispatch/credit/payout).
 * - `TxLoggingPolicy.OnSuccessOrUncertain` — debit dùng, skip business reject
 *   + HTTP 400/401 vì caller đã `safeDeleteWal` (no reconcile needed).
 * - `checkTransactionStatus` KHÔNG log (read-only, tần suất cao, không cần audit).
 *
 * @param http - HttpClient đã inject api key + headers.
 * @param tenantId - Dùng stamp vào log để filter/group theo tenant.
 * @internal Dùng bởi `createTenantGatewayClient` — không export ra ngoài package.
 */

// Singleton use cases được share từ `shared/tx-logging`. Fire-and-forget:
// caller dùng `void useCase.run(...)` để không block main flow; repo tự
// swallow insert error + console.error.

/**
 * Safety-net cho log fire-and-forget.
 *
 * Repo `upsertLog`/`upsertLogs` đã `try/catch` + `console.error`, nhưng
 * wrapper `.catch()` này **defensive** phòng khi ai đó refactor quên swallow
 * → tránh `unhandledRejection` crash process (Node ≥ 15 default behavior).
 *
 * Không log lại ở đây để tránh double log noise.
 */
function safeFireAndForget(p: Promise<unknown>): void {
  // Đã log ở repo. Swallow để không crash Lambda / Next.js server.
  void p.catch(() => {});
}

/**
 * Build `TxLogInput` cho 1 single transaction — dùng chung cho success path
 * và exception path để tránh duplicate object literal.
 */
function buildSingleLogInput(args: {
  tenantId: string;
  req: TransactionRequest;
  responsePayload: unknown;
  outcome: ClassifiedOutcome;
}): Omit<TxLogInput, "createdAt"> {
  return {
    eventType: TxLogEventType.Transaction,
    tx: args.req.tx,
    batchId: args.req.tx,
    tenantId: args.tenantId,
    requestPayload: args.req,
    responsePayload: args.responsePayload,
    status: args.outcome.status,
    error: args.outcome.error,
  };
}

/**
 * Build 1 `TxLogInput` cho 1 item trong batch. Caller map qua `req.items` tuỳ
 * path (outer reject / outer success / exception) để sinh `responsePayload +
 * outcome` cho từng item.
 */
function buildBatchItemLogInput(args: {
  tenantId: string;
  batchId: string;
  item: BatchTransactionItem;
  responsePayload: unknown;
  outcome: ClassifiedOutcome;
}): Omit<TxLogInput, "createdAt"> {
  return {
    eventType: TxLogEventType.BatchTransaction,
    tx: args.item.tx,
    batchId: args.batchId,
    tenantId: args.tenantId,
    requestPayload: args.item,
    responsePayload: args.responsePayload,
    status: args.outcome.status,
    error: args.outcome.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Log helpers — module-level pure functions
// ─────────────────────────────────────────────────────────────────────────────
//
// Đóng gói cặp `classify + build + fire` cho từng path để main flow của
// `transaction` / `batchTransaction` chỉ còn 3 bước: post → log → return.
// Đặt ở module-level (không nested trong `createTransactionApi`) để tránh
// re-allocate 4 closures mỗi lần factory chạy — factory có thể được gọi nhiều
// lần cho nhiều tenant khác nhau trong cùng process.

/** Log 1 single transaction khi HTTP 200 (bất kể outer success / fail). */
function logSingleSuccess(
  tenantId: string,
  req: TransactionRequest,
  response: TransactionResponse,
  policy: TxLoggingPolicy,
): void {
  const outcome = response.success
    ? classifyItem({ success: true })
    : classifyItem({ success: false, error: response.error });

  if (shouldSkipLog(policy, outcome)) {
    return;
  }

  safeFireAndForget(
    logTxUseCase.run(buildSingleLogInput({ tenantId, req, responsePayload: response, outcome })),
  );
}

/** Log 1 single transaction khi exception (timeout / network / HTTP 4xx/5xx). */
function logSingleError(
  tenantId: string,
  req: TransactionRequest,
  err: unknown,
  policy: TxLoggingPolicy,
): void {
  const outcome = classifyThrown(err);

  if (shouldSkipLog(policy, outcome)) {
    return;
  }

  safeFireAndForget(
    logTxUseCase.run(buildSingleLogInput({ tenantId, req, responsePayload: undefined, outcome })),
  );
}

/**
 * Log N items của batch khi HTTP 200 — 2 trường hợp:
 * - Outer reject: cùng `outcome` + `responsePayload = response` cho mọi item.
 * - Outer success: outcome per-item theo `results[idx]`; thiếu result → `MISSING_RESULT`.
 *
 * Policy apply per-item: outer reject → tất cả items share outcome
 * `BATCH_REJECTED` với `batchOuterRejected = true` → luôn log (uncertainty).
 * Outer success → từng item có outcome riêng, skip per-item nếu `shouldSkipLog`.
 */
function logBatchSuccess(
  tenantId: string,
  req: BatchTransactionRequest,
  batchId: string,
  response: BatchTransactionResponse,
  policy: TxLoggingPolicy,
): void {
  if (!response.success) {
    // Outer reject: `responsePayload` là full envelope để UI thấy error + context.
    const outcome = classifyBatchOuterReject(response.error);
    if (shouldSkipLog(policy, outcome)) {
      return;
    }

    const inputs = req.items.map((item) =>
      buildBatchItemLogInput({
        tenantId,
        batchId,
        item,
        responsePayload: response,
        outcome,
      }),
    );
    safeFireAndForget(logTxBulkUseCase.run(inputs));
    return;
  }

  // Outer success: match results[i] ↔ items[i] theo index (tenant contract).
  // `results.length` PHẢI bằng `items.length`; defensive: thiếu → MISSING_RESULT.
  const results = response.data?.results ?? [];

  const inputs: Array<Omit<TxLogInput, "createdAt">> = [];
  for (let idx = 0; idx < req.items.length; idx++) {
    const item = req.items[idx]!;
    const result = results[idx];

    const outcome = result
      ? classifyItem({ success: result.success, error: result.error })
      : classifyItem({
          success: false,
          error: { code: "MISSING_RESULT", message: "Missing result for item" },
        });

    if (shouldSkipLog(policy, outcome)) {
      continue;
    }

    inputs.push(
      buildBatchItemLogInput({
        tenantId,
        batchId,
        item,
        responsePayload: result,
        outcome,
      }),
    );
  }

  // Bulk use case tự no-op khi empty — an toàn.
  safeFireAndForget(logTxBulkUseCase.run(inputs));
}

/**
 * Log N items của batch khi exception — cùng 1 `outcome` cho mọi item.
 * `responsePayload = undefined` vì http-client không expose body khi throw.
 *
 * Exception path luôn là transport / HTTP 4xx/5xx / timeout — outcome chung
 * cho cả batch, nên chỉ cần check `shouldSkipLog` 1 lần.
 */
function logBatchError(
  tenantId: string,
  req: BatchTransactionRequest,
  batchId: string,
  err: unknown,
  policy: TxLoggingPolicy,
): void {
  const outcome = classifyThrown(err);

  if (shouldSkipLog(policy, outcome)) {
    return;
  }

  const inputs = req.items.map((item) =>
    buildBatchItemLogInput({
      tenantId,
      batchId,
      item,
      responsePayload: undefined,
      outcome,
    }),
  );

  safeFireAndForget(logTxBulkUseCase.run(inputs));
}

export function createTransactionApi(http: HttpClient, tenantId: string): TransactionApi {
  return {
    transaction: async (req: TransactionRequest, options?: TransactionCallOptions) => {
      const policy = options?.logging ?? TxLoggingPolicy.Always;
      // Single tx: 1 doc / 1 transaction, batchId = tx (để UI render thống nhất).
      try {
        const response = await http.post<TransactionResponse>(CALLBACK_PATHS.transaction, req, {
          rawResponse: true,
        });
        logSingleSuccess(tenantId, req, response, policy);
        return response;
      } catch (err) {
        logSingleError(tenantId, req, err, policy);
        throw err;
      }
    },

    batchTransaction: async (req: BatchTransactionRequest, options?: TransactionCallOptions) => {
      const policy = options?.logging ?? TxLoggingPolicy.Always;
      // Batch: 1 doc / item cùng chung 1 batchId. Items không có sẵn batchId →
      // sinh UUIDv7 per call (ordered theo thời gian, link các items lại).
      const batchId = generateId();

      try {
        const response = await http.post<BatchTransactionResponse>(
          CALLBACK_PATHS.batchTransaction,
          req,
          { rawResponse: true },
        );
        logBatchSuccess(tenantId, req, batchId, response, policy);
        return response;
      } catch (err) {
        logBatchError(tenantId, req, batchId, err, policy);
        throw err;
      }
    },

    checkTransactionStatus: (tx: string) => {
      // Không log — read-only, tần suất cao (recovery scheduler), không có giá trị audit.
      const path = CALLBACK_PATHS.transactionStatus.replace(":tx", tx);
      return http.get<TransactionStatusResponse>(path, { rawResponse: true });
    },
  };
}
