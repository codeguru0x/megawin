/**
 * Use Case: Dispatch Refund Batch (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4 TRONG VOID FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * (Sau VoidEntries + SyncTicketSummaries)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 * Mỗi tenant có 1 TenantGateway endpoint riêng (callbackBaseUrl trong config).
 *
 * ────────────────────────────────────────────────
 * FLOW MỖI LẦN GỌI:
 * ────────────────────────────────────────────────
 *   1. Query batch entries đã voided + refundStatus = "pending" hoặc "failed"
 *      (batch 200 — giới hạn nhỏ hơn vì mỗi entry = 1 API call tới tenant)
 *
 *   2. Group by tenantId
 *      (mỗi tenant có endpoint riêng, cần gửi batch riêng)
 *
 *   3. Với từng tenant:
 *      a. Load TenantGateway client (callbackBaseUrl + apiKey từ tenant config)
 *      b. Nếu không có callbackBaseUrl → DRY-RUN: auto-mark dispatched
 *         (dev/test environment không cần gọi thật)
 *      c. Chunk entries ≤ 50 (giới hạn batch size của TenantGateway API)
 *      d. Gọi gateway.batchRefund({ items }) cho từng chunk
 *      e. Per entry response:
 *         - "success" / "duplicate" → markRefundDispatched (hoàn thành)
 *         - "failed" → markRefundFailed (sẽ retry vòng sau)
 *
 *   4. Sau khi xử lý hết batch, check remaining entries
 *      → done = true nếu không còn entries cần refund
 *
 * ────────────────────────────────────────────────
 * REFUND ITEM GỬI CHO TENANT:
 * ────────────────────────────────────────────────
 *   {
 *     playerId, accountId, entryId,
 *     amount (VND),
 *     currency: "VND",
 *     transactionId: "refund-{drawId}-{entryId}" (idempotency key),
 *     gameId: "lotto535",
 *     roundId: drawId,
 *     description: "Hoàn tiền Lotto 5/35 kỳ {drawId} – kỳ bị huỷ"
 *   }
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - Query chỉ entries có refundStatus = "pending" hoặc "failed"
 *   - Entries đã dispatched → không query lại → skip tự nhiên
 *   - transactionId = "refund-{drawId}-{entryId}" → tenant nhận làm idempotency key
 *     → duplicate call = no-op (tenant trả status "duplicate")
 *   - done = true khi hết entries cần refund
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  createTenantGatewayClient,
  type TenantGatewayClient,
  type RefundItem,
} from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";

/** Số entries query mỗi lần (nhỏ hơn settle batch vì có I/O tới tenant). */
const BATCH_QUERY_LIMIT = 200;
/** Max entries gửi trong 1 lần batchRefund tới tenant. */
const REFUND_CHUNK_SIZE = 50;

export interface DispatchRefundBatchInput {
  /** Mã kỳ quay cần dispatch refund. */
  drawId: string;
}

export interface DispatchRefundBatchResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** true nếu không còn entries cần refund. */
  done: boolean;
  /** Số entries đã dispatch refund thành công. */
  dispatched: number;
  /** Số entries dispatch thất bại (sẽ retry vòng sau). */
  failed: number;
  /** Kết quả chi tiết theo từng tenant. */
  tenantResults: Array<{
    /** Mã tenant. */
    tenantId: string;
    /** Số entries dispatch thành công. */
    dispatched: number;
    /** Số entries dispatch thất bại. */
    failed: number;
    /** Tổng tiền hoàn cho tenant (VND) = Σ(entry.voidInfo.refundAmount). */
    totalRefundAmount: number;
  }>;
}

export class DispatchRefundBatchUseCase extends InternalUseCase<
  DispatchRefundBatchInput,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();

  /** Dispatch refund cho 1 batch entries đã void. Loop cho đến khi done = true. */
  protected async execute(input: DispatchRefundBatchInput): Promise<DispatchRefundBatchResult> {
    const { drawId } = input;

    // ── STEP 1: Query entries đã voided, refundStatus = "pending"/"failed" ──
    // Entries đã dispatched không xuất hiện → retry safe
    const entries = await this.entryRepo.getPendingRefundEntries(drawId, BATCH_QUERY_LIMIT);

    // Không còn entries cần refund → hoàn tất
    if (entries.length === 0) {
      return {
        drawId,
        done: true,
        dispatched: 0,
        failed: 0,
        tenantResults: [],
      };
    }

    // ── STEP 2: Group by tenantId (mỗi tenant có endpoint riêng) ──
    const tenantGroups = groupByTenant(entries);
    const tenantResults: DispatchRefundBatchResult["tenantResults"] = [];
    let totalDispatched = 0;
    let totalFailed = 0;

    // ── STEP 3: Dispatch refund cho từng tenant ──
    for (const [tenantId, tenantEntries] of tenantGroups) {
      const result = await dispatchRefundToTenant(
        this.entryRepo,
        this.tenantConfigRepo,
        tenantId,
        drawId,
        tenantEntries,
      );
      tenantResults.push(result);
      totalDispatched += result.dispatched;
      totalFailed += result.failed;
    }

    // ── STEP 4: Check remaining → done? ──
    // Query lại 1 entry để kiểm tra còn entries cần refund không
    const remaining = await this.entryRepo.getPendingRefundEntries(drawId, 1);

    return {
      drawId,
      done: remaining.length === 0,
      dispatched: totalDispatched,
      failed: totalFailed,
      tenantResults,
    };
  }
}

// ─────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────

/** Group entries theo tenantId. */
function groupByTenant(entries: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const entry of entries) {
    const list = map.get(entry.tenantId) ?? [];
    list.push(entry);
    map.set(entry.tenantId, list);
  }
  return map;
}

/** Chia mảng thành chunks nhỏ hơn. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Extract entry ID (hỗ trợ cả string id lẫn ObjectId). */
function extractId(entry: any): string {
  return entry.id ?? entry._id?.toHexString?.() ?? String(entry._id);
}

/**
 * Load TenantGateway client cho 1 tenant.
 * Trả null nếu tenant không có callbackBaseUrl (dev/test → DRY-RUN).
 */
async function loadGatewayClient(
  tenantConfigRepo: TenantConfigRepository,
  tenantId: string,
): Promise<TenantGatewayClient | null> {
  const tenantConfig = await tenantConfigRepo.getTenantConfig(tenantId);

  const callbackBaseUrl = (tenantConfig as any)?.callbackBaseUrl;
  const apiKey = (tenantConfig as any)?.apiKey;

  if (!callbackBaseUrl) return null;

  return createTenantGatewayClient({
    callbackBaseUrl,
    apiKey: apiKey ?? "",
    tenantId,
    timeout: 30_000,
  });
}

/**
 * Dispatch refund cho entries của 1 tenant cụ thể.
 *
 * Flow:
 *   1. Load TenantGateway client
 *   2. Nếu không có gateway (dev/test) → DRY-RUN: auto-mark dispatched
 *   3. Chunk entries ≤ 50, gọi gateway.batchRefund cho từng chunk
 *   4. Mark dispatched/failed per entry dựa trên response
 *
 * transactionId format: "refund-{drawId}-{entryId}"
 *   → Tenant dùng làm idempotency key, duplicate call = no-op
 */
async function dispatchRefundToTenant(
  entryRepo: EntryRepository,
  tenantConfigRepo: TenantConfigRepository,
  tenantId: string,
  drawId: string,
  entries: any[],
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalRefundAmount: number;
}> {
  // Tổng tiền hoàn cho tenant (VND)
  const totalRefundAmount = entries.reduce(
    (s: number, e: any) => s + (e.voidInfo?.refundAmount ?? 0),
    0,
  );

  const gateway = await loadGatewayClient(tenantConfigRepo, tenantId);

  // DRY-RUN: tenant không có callbackBaseUrl → auto-mark dispatched
  // Dùng cho dev/test environment, hoặc tenant mới chưa setup callback
  if (!gateway) {
    console.warn(
      `[dispatch-refund] Tenant ${tenantId}: no callbackBaseUrl. ` +
        `${entries.length} entries, ${totalRefundAmount} VND (DRY-RUN → auto-dispatched)`,
    );
    for (const e of entries) {
      await entryRepo.markRefundDispatched(extractId(e));
    }
    return {
      tenantId,
      dispatched: entries.length,
      failed: 0,
      totalRefundAmount,
    };
  }

  // Gửi thật qua TenantGateway API (chunk ≤ 50 entries/lần)
  const batches = chunk(entries, REFUND_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    // Build refund items cho tenant
    const items: RefundItem[] = batch.map((e: any) => ({
      playerId: e.accountId,
      accountId: e.accountId,
      entryId: extractId(e),
      amount: e.voidInfo?.refundAmount ?? 0,
      currency: "VND",
      // transactionId = idempotency key → tenant nhận duplicate = no-op
      transactionId: `refund-${drawId}-${extractId(e)}`,
      gameId: GameProduct.Lotto535,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Hoàn tiền Lotto 5/35 kỳ ${drawId} – kỳ bị huỷ`,
    }));

    try {
      const response = await gateway.batchRefund({ items });

      // Xử lý response per entry
      for (const r of response.results) {
        if (r.status === "success" || r.status === "duplicate") {
          // "duplicate" = tenant đã nhận rồi (retry case) → coi như thành công
          await entryRepo.markRefundDispatched(r.entryId);
          dispatched++;
        } else {
          // "failed" → mark failed, sẽ retry ở vòng tiếp theo
          await entryRepo.markRefundFailed(r.entryId, r.error ?? "Tenant returned failed");
          failed++;
        }
      }
    } catch (err: any) {
      // Toàn bộ batch call thất bại (network error, timeout...)
      // → Mark tất cả entries trong batch là failed → retry vòng sau
      const errMsg = err?.message ?? String(err);
      console.error(`[dispatch-refund] Tenant ${tenantId} batch failed: ${errMsg}`);
      for (const e of batch) {
        await entryRepo.markRefundFailed(extractId(e), errMsg);
      }
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalRefundAmount };
}
