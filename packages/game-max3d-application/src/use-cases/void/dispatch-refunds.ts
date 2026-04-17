/**
 * Use Case: Dispatch Refund Batch (Max 3D)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 3 TRONG VOID FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE:
 *   - Query chỉ entries có voidInfo.refundStatus = pending/failed
 *   - Entries đã dispatch refund không bị gửi lại
 *   - Tenant nhận entryId làm idempotency key → duplicate = no-op
 *   - done = true khi hết entries cần refund
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { tenantGateway, type BatchTransactionItem } from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";
import { DEFAULT_CURRENCY } from "@megawin/shared/types";

const BATCH_QUERY_LIMIT = 200;
const REFUND_CHUNK_SIZE = 50;

export interface DispatchRefundBatchResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** true nếu đã hết entries cần refund. */
  done: boolean;
  /** Số entries đã gửi refund thành công. */
  dispatched: number;
  /** Số entries gửi refund thất bại. */
  failed: number;
  /** Chi tiết kết quả refund theo từng tenant. */
  tenantResults: Array<{
    /** Mã tenant. */
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
  VoidContext,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<DispatchRefundBatchResult> {
    const { drawId } = input;
    const entries = await this.entryRepo.getPendingRefundEntries(drawId, BATCH_QUERY_LIMIT);

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
      const result = await dispatchRefundToTenant(this.entryRepo, tenantId, drawId, tenantEntries);
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

async function dispatchRefundToTenant(
  entryRepo: EntryRepository,
  tenantId: string,
  drawId: string,
  entries: any[],
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalRefundAmount: number;
}> {
  const totalRefundAmount = entries.reduce(
    (s: number, e: any) => s + (e.voidInfo?.refundAmount ?? 0),
    0,
  );

  const gateway = await tenantGateway.getClient(tenantId);

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

  const batches = chunk(entries, REFUND_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const txToEntryId = new Map<string, string>();
    const items: BatchTransactionItem[] = batch.map((e: any) => {
      const entryId = extractId(e);
      const tx = e.voidInfo!.refundTx;
      txToEntryId.set(tx, entryId);
      return {
        action: "credit" as const,
        reason: "refund" as const,
        tx,
        playerId: e.accountId,
        amount: e.voidInfo?.refundAmount ?? 0,
        currency: DEFAULT_CURRENCY,
        gameId: GameProduct.Max3d,
        roundIds: [drawId],
        description: `Hoàn tiền Max 3D kỳ ${drawId} – kỳ bị huỷ`,
        metadata: { entryId, ticketNo: e.entrySummary?.ticketNo ?? "" },
      };
    });

    try {
      const response = await gateway.batchTransaction({ items });

      if (!response.success) {
        const errMsg = response.error?.message ?? "Batch transaction failed";
        console.error(`[dispatch-refund] Tenant ${tenantId} batch error: ${errMsg}`);
        for (const e of batch) {
          await entryRepo.markRefundFailed(extractId(e), errMsg);
        }
        failed += batch.length;
        continue;
      }

      for (const r of response.data!.results) {
        const entryId = txToEntryId.get(r.tx);
        if (!entryId) continue;
        if (r.success) {
          await entryRepo.markRefundDispatched(entryId);
          dispatched++;
        } else {
          await entryRepo.markRefundFailed(entryId, r.error?.message ?? "Tenant returned failed");
          failed++;
        }
      }
    } catch (err: any) {
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
