/**
 * Base Use Case cho tenant dispatch batch processing.
 *
 * Đóng kín flow chung cho cả main và retry lane; 2 subclass chỉ override
 * phần **fetch pending batch** (filter `retryCount` khác nhau), default
 * query limit, và soft time-budget. Tách vậy giúp debug log / metrics từng
 * lane rõ ràng mà không cần param `lane` rải khắp code.
 *
 * ## Flow (vòng lặp đến cạn hàng hoặc hết budget)
 *
 * 1. Lặp `while (elapsed < maxExecutionMs)`:
 *    - `fetchPending(limit)` — subclass override: main dùng
 *      `getPendingMainBatch`, retry dùng `getPendingRetryBatch`. 2 filter
 *      (`retryCount $exists false|true`) mutually exclusive + complete → 2
 *      worker không bao giờ xử lý trùng.
 *    - Group orders theo `tenantId`, mỗi tenant chunk `DISPATCH_CHUNK_SIZE`
 *      = 50, gọi `batchTransaction`, phân loại per-item.
 *    - 1 lần `bulkApplyBatchResult` cho iteration này — merge cả dispatched
 *      và failed trong cùng 1 MongoDB round trip.
 *    - Cộng dồn vào tổng output.
 * 2. Early exit: `pending.length === 0` (hết hàng) hoặc hết budget.
 *
 * ## Lý do vòng lặp
 *
 * Mỗi lần chạy Lambda là 1 cron tick (main 1 phút, retry 3 phút). Trong 1
 * tick thường có thể xử lý nhiều batch `limit` — nếu không loop, phần dư
 * phải chờ tick tiếp theo → trễ vô ích. Soft budget chừa ~5-15s cuối để
 * flush log / bulk write không bị Lambda kill giữa op.
 *
 * ## Retry vô hạn
 *
 * Mọi loại lỗi (tenant `success: false`, HTTP throw, outer fail) đều retry
 * vô hạn. Orders không bao giờ tự chuyển `Failed` (status đó đã bị xoá).
 * Staff monitor qua `listStuck` khi `retryCount >= RETRY_ALERT_THRESHOLD`.
 *
 * ## Idempotency
 *
 * Tenant dedup theo `tx`. Dù `reservedConcurrency: 1` vẫn có thể overlap
 * ngắn ở cold-start boundary → cùng 1 tx có thể gửi 2 lần, tenant trả
 * `duplicate: true`, `bulkApplyBatchResult` idempotent.
 *
 * ## Distributed lock
 *
 * Extends {@link SingleRunWorker} — main/retry lane mỗi lane 1 `lockKey`
 * riêng, đảm bảo chỉ 1 invocation chạy tại 1 thời điểm. Overlap ở cold-start
 * (issue của `reservedConcurrency: 1`) được lock phủ tiếp.
 *
 * `ctx.heartbeat()` KHÔNG được gọi vì không cần thiết: TTL (90s/330s) luôn
 * lớn hơn Lambda timeout (60s/300s), lock chắc chắn outlive toàn bộ execution.
 * Heartbeat chỉ có giá trị khi TTL < total runtime — không đúng với use case này.
 */

import { chunk, toTenantUsername } from "@megawin/shared/utils";
import { type BatchTransactionItem, type TenantGatewayClient, tenantGateway } from "@megawin/tenant-gateway";
import { SingleRunWorker } from "@megawin/worker-core/workers";

import { DISPATCH_CHUNK_SIZE } from "../../config";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { PendingDispatchOrder } from "../../infras/repos/types";
import { computeNextAttemptAt } from "./backoff";
import { normalizeDispatchError } from "./normalize-error";

export interface ProcessDispatchBatchInput {
  /** Override query limit mỗi iteration — dùng cho testing. Default do subclass quyết định. */
  limit?: number;
  /** Override soft time-budget (ms) — dùng cho testing. Default do subclass quyết định. */
  maxExecutionMs?: number;
}

export interface ProcessDispatchBatchOutput {
  /** Tổng số orders đã query từ outbox qua tất cả iterations. */
  polled: number;
  /** Tổng số orders mark dispatched thành công. */
  dispatched: number;
  /** Tổng số orders mark attempt failed (sẽ retry sau `nextAttemptAt`). */
  failed: number;
  /** `true` nếu đã cạn pending; `false` nếu dừng vì hết time-budget. */
  done: boolean;
}

interface BatchResultAccumulator {
  dispatched: string[];
  failed: { tx: string; error: string; nextAttemptAt: Date }[];
}

export abstract class ProcessDispatchBatchBaseUseCase extends SingleRunWorker<
  ProcessDispatchBatchInput,
  ProcessDispatchBatchOutput
> {
  protected readonly repo = new DispatchOrderRepository();

  /** Default limit khi caller không truyền `input.limit`. */
  protected abstract defaultLimit(): number;

  /** Default time-budget (ms) khi caller không truyền `input.maxExecutionMs`. */
  protected abstract defaultMaxExecutionMs(): number;

  /** Fetch pending orders thuộc lane — main hoặc retry. */
  protected abstract fetchPending(limit: number): Promise<PendingDispatchOrder[]>;

  /**
   * input is optional, so we need to default it to an empty object
   * tránh bị throw error vì input.limit is undefined
   * @param input - The input to the process
   * @returns The output of the process
   */ protected async runLocked(input: ProcessDispatchBatchInput = {}): Promise<ProcessDispatchBatchOutput> {
    const limit = input.limit ?? this.defaultLimit();
    const maxExecutionMs = input.maxExecutionMs ?? this.defaultMaxExecutionMs();
    const startTime = Date.now();

    const total: ProcessDispatchBatchOutput = {
      polled: 0,
      dispatched: 0,
      failed: 0,
      done: false,
    };

    while (Date.now() - startTime < maxExecutionMs) {
      const pending = await this.fetchPending(limit);

      if (pending.length === 0) {
        total.done = true;
        // Thoát vì hết pending — tick sau sẽ tiếp tục. Các orders chưa xử lý
        // vẫn đang `Pending` với `nextAttemptAt <= now` nên được pick lại ngay.
        return total;
      }

      const acc: BatchResultAccumulator = {
        dispatched: [],
        failed: [],
      };

      for (const [tenantId, orders] of groupByTenant(pending)) {
        await this.processTenant(tenantId, orders, acc);
      }

      // Bulk apply batch result
      await this.repo.bulkApplyBatchResult({
        dispatched: acc.dispatched,
        failed: acc.failed,
      });

      total.polled += pending.length;
      total.dispatched += acc.dispatched.length;
      total.failed += acc.failed.length;

      // Iteration cuối cùng chắc chắn đã cạn pending — tránh thêm 1 round trip
      // query chỉ để confirm rỗng.
      if (pending.length < limit) {
        total.done = true;
        return total;
      }
    }

    // Thoát vì hết time-budget — tick sau sẽ tiếp tục. Các orders chưa xử lý
    // vẫn đang `Pending` với `nextAttemptAt <= now` nên được pick lại ngay.
    return total;
  }

  private async processTenant(
    tenantId: string,
    orders: PendingDispatchOrder[],
    acc: BatchResultAccumulator,
  ): Promise<void> {
    const client = await tenantGateway.getClient(tenantId);

    // Không có client = tenant chưa setup `callbackBaseUrl`. Trong context dispatch
    // (đã confirm debit thành công trước đó) đây là LỖI CẤU HÌNH, KHÔNG được mark
    // `Dispatched` (sẽ mất credit thật của player). Queue failure để retry lần sau
    // (nếu admin setup xong sẽ tự thành công) và surface lên BO UI stuck orders sau
    // khi chạm `RETRY_ALERT_THRESHOLD` để staff xử lý.
    //
    // `tenantGateway.getClient` chỉ `logWarn` (no config là trạng thái hợp lệ ở
    // context khác, VD DRY-RUN) — mức độ nghiêm trọng ở ĐÂY do use case này quyết,
    // nên log riêng qua `queueFailure`/`errMsg`, không dựa vào log của gateway.
    if (!client) {
      const errMsg = `[no_tenant_config] Tenant ${tenantId} chưa cấu hình callbackBaseUrl`;
      for (const o of orders) {
        this.queueFailure(o, errMsg, acc);
      }
      return;
    }

    // Chia dispatch orders thành các chunks để gửi sang bên tenant api batchTransaction
    for (const c of chunk(orders, DISPATCH_CHUNK_SIZE)) {
      await this.processChunk(client, c, acc);
    }
  }

  /**
   * Thực hiện process cho 1 chunk
   * @param client - The client to use to process the chunk
   * @param orders - The orders to process
   * @param acc - The accumulator to process
   * @returns
   */
  private async processChunk(
    client: TenantGatewayClient,
    orders: PendingDispatchOrder[],
    acc: BatchResultAccumulator,
  ): Promise<void> {
    const items: BatchTransactionItem[] = orders.map(
      (o) =>
        ({
          action: o.action,
          reason: o.reason,
          tx: o.tx,
          playerId: toTenantUsername(o.username),
          amount: o.amount,
          currency: o.currency,
          gameId: o.gameId,
          roundIds: o.roundIds,
          description: o.description,
          force: o.force,
          metadata: o.metadata,
        }) satisfies BatchTransactionItem,
    );

    try {
      const response = await client.batchTransaction({ items });

      // Batch-level fail: response có nhưng `success: false` ở outer level — tenant
      // từ chối CẢ batch có chủ đích (sai API key, payload invalid, tenant internal
      // error v.v.) TRƯỚC khi xử lý bất kỳ item nào. Đây KHÔNG phải transport error.
      //
      // Theo contract: nếu `success: false` ở outer, tenant CHƯA credit item nào →
      // retry toàn bộ an toàn. Nếu tenant xử lý một phần rồi mới fail outer, vẫn
      // an toàn vì idempotency `tx` (giống nhánh catch transport bên dưới).
      if (!response.success) {
        const errMsg = normalizeDispatchError({ kind: "outer", error: response.error });
        console.error(
          `[tenant-dispatch] chunk batch-level fail`,
          JSON.stringify({
            tenantId: orders[0]?.tenantId,
            orderCount: orders.length,
            error: errMsg,
          }),
        );

        for (const o of orders) {
          this.queueFailure(o, errMsg, acc);
        }

        return;
      }

      const txMap = new Map(orders.map((o) => [o.tx, o]));

      for (const r of response.data!.results) {
        const order = txMap.get(r.tx);
        if (!order) {
          console.warn(`[tenant-dispatch] unknown tx in response: ${r.tx}`);
          continue;
        }

        if (r.success) {
          acc.dispatched.push(order.tx);
        } else {
          const errMsg = normalizeDispatchError({ kind: "item", error: r.error });
          console.warn(
            `[tenant-dispatch] item tenant error`,
            JSON.stringify({
              tx: order.tx,
              tenantId: order.tenantId,
              retryCount: order.retryCount,
              error: errMsg,
            }),
          );
          this.queueFailure(order, errMsg, acc);
        }
      }
    } catch (err) {
      // Transport error: timeout, network down, DNS fail, 5xx sau khi hết HTTP retry.
      //
      // Ở điểm này client KHÔNG thể biết tenant đã xử lý tới đâu (partial success):
      //   - Tenant chưa nhận request, HOẶC
      //   - Tenant đã nhận + xử lý nhưng response cắt giữa đường.
      //
      // Mark TẤT CẢ là failed và retry — SAFE vì:
      //   1. `tx` là UUIDv7 cố định per order, giữ nguyên qua mọi lần retry.
      //   2. Tenant PHẢI dedup theo `tx` (contract `batchTransaction`): items đã xử lý
      //      trả `success: true, duplicate: true` với kết quả cũ → worker mark dispatched
      //      bình thường ở lần retry, KHÔNG double-credit.
      //   3. Items chưa xử lý → tenant credit lần đầu khi retry.
      //
      // Alternative "mark unknown + gọi checkTransactionStatus per tx" là over-engineering:
      // thêm state machine phức tạp, 50 round trips extra, bản thân checkStatus cũng
      // có transport error. Idempotency qua `tx` giải quyết cleanly hơn.
      const errMsg = normalizeDispatchError({ kind: "http", error: err });
      console.error(
        `[tenant-dispatch] chunk transport error`,
        JSON.stringify({
          tenantId: orders[0]?.tenantId,
          orderCount: orders.length,
          error: errMsg,
        }),
      );
      for (const o of orders) {
        this.queueFailure(o, errMsg, acc);
      }
    }
  }

  /**
   * Queue a failure for an order
   * @param order - The order to queue failure for
   * @param errMsg - The error message to queue failure for
   * @param acc - The accumulator to queue failure for
   * @param acc
   */
  private queueFailure(order: PendingDispatchOrder, errMsg: string, acc: BatchResultAccumulator): void {
    const currentRetry = order.retryCount ?? 0;
    // Compute the next attempt at
    const nextAttemptAt = computeNextAttemptAt(currentRetry + 1);

    acc.failed.push({
      tx: order.tx,
      error: errMsg,
      nextAttemptAt,
    });
  }
}

function groupByTenant(orders: PendingDispatchOrder[]): Map<string, PendingDispatchOrder[]> {
  const map = new Map<string, PendingDispatchOrder[]>();
  for (const o of orders) {
    const arr = map.get(o.tenantId) ?? [];
    arr.push(o);
    map.set(o.tenantId, arr);
  }
  return map;
}
