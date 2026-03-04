/**
 * Use Case: Dispatch Refund Batch (Max 3D)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE:
 *   - Query chỉ entries có voidInfo.refundStatus = pending/failed
 *   - Entries đã dispatch refund không bị gửi lại
 *   - Tenant nhận entryId làm idempotency key → duplicate = no-op
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

const BATCH_QUERY_LIMIT = 200;
const REFUND_CHUNK_SIZE = 50;

export interface DispatchRefundBatchInput {
  /** ID kỳ quay cần dispatch refund. */
  drawId: string;
}

export interface DispatchRefundBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true nếu đã hết entries cần refund. */
  done: boolean;
  /** Số entries đã gửi refund thành công. */
  dispatched: number;
  /** Số entries gửi refund thất bại. */
  failed: number;
  /** Chi tiết kết quả refund theo từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entries dispatch thành công. */
    dispatched: number;
    /** Số entries dispatch thất bại. */
    failed: number;
    /** Tổng tiền hoàn cho tenant (VND). */
    totalRefundAmount: number;
  }>;
}

export class DispatchRefundBatchUseCase extends InternalUseCase<
  DispatchRefundBatchInput,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();

  protected async execute(
    input: DispatchRefundBatchInput
  ): Promise<DispatchRefundBatchResult> {
    const { drawId } = input;
    const entries = await this.entryRepo.getPendingRefundEntries(
      drawId,
      BATCH_QUERY_LIMIT
    );

    if (entries.length === 0) {
      return {
        drawId,
        done: true,
        dispatched: 0,
        failed: 0,
        tenantResults: [],
      };
    }

    const tenantGroups = groupByTenant(entries);
    const tenantResults: DispatchRefundBatchResult["tenantResults"] = [];
    let totalDispatched = 0;
    let totalFailed = 0;

    for (const [tenantId, tenantEntries] of tenantGroups) {
      const result = await dispatchRefundToTenant(
        this.entryRepo,
        this.tenantConfigRepo,
        tenantId,
        drawId,
        tenantEntries
      );
      tenantResults.push(result);
      totalDispatched += result.dispatched;
      totalFailed += result.failed;
    }

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

function groupByTenant(entries: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const entry of entries) {
    const list = map.get(entry.tenantId) ?? [];
    list.push(entry);
    map.set(entry.tenantId, list);
  }
  return map;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractId(entry: any): string {
  return entry.id ?? entry._id?.toHexString?.() ?? String(entry._id);
}

async function loadGatewayClient(
  tenantConfigRepo: TenantConfigRepository,
  tenantId: string
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

async function dispatchRefundToTenant(
  entryRepo: EntryRepository,
  tenantConfigRepo: TenantConfigRepository,
  tenantId: string,
  drawId: string,
  entries: any[]
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalRefundAmount: number;
}> {
  const totalRefundAmount = entries.reduce(
    (s: number, e: any) => s + (e.voidInfo?.refundAmount ?? 0),
    0
  );

  const gateway = await loadGatewayClient(tenantConfigRepo, tenantId);

  if (!gateway) {
    console.warn(
      `[dispatch-refund] Tenant ${tenantId}: no callbackBaseUrl. ` +
        `${entries.length} entries, ${totalRefundAmount} VND (DRY-RUN → auto-dispatched)`
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

  const batches = chunk(entries, REFUND_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const items: RefundItem[] = batch.map((e: any) => ({
      playerId: e.accountId,
      accountId: e.accountId,
      entryId: extractId(e),
      amount: e.voidInfo?.refundAmount ?? 0,
      currency: "VND",
      transactionId: `refund-${drawId}-${extractId(e)}`,
      gameId: GameProduct.Max3d,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Hoàn tiền Max 3D kỳ ${drawId} – kỳ bị huỷ`,
    }));

    try {
      const response = await gateway.batchRefund({ items });

      for (const r of response.results) {
        if (r.status === "success" || r.status === "duplicate") {
          await entryRepo.markRefundDispatched(r.entryId);
          dispatched++;
        } else {
          await entryRepo.markRefundFailed(
            r.entryId,
            r.error ?? "Tenant returned failed"
          );
          failed++;
        }
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(
        `[dispatch-refund] Tenant ${tenantId} batch failed: ${errMsg}`
      );
      for (const e of batch) {
        await entryRepo.markRefundFailed(extractId(e), errMsg);
      }
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalRefundAmount };
}
