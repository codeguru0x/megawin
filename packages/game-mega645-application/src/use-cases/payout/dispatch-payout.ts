/**
 * Use Case: Dispatch Payout Batch (Mega 6/45)
 *
 * Worker loop trả thưởng cho 1 draw.
 * Crash-safe: Entries đã dispatched không bị gửi lại.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { tenantGateway, type BatchTransactionItem } from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DEFAULT_CURRENCY } from "@megawin/shared/types";

const BATCH_QUERY_LIMIT = 200;
const PAYOUT_CHUNK_SIZE = 50;
const MAX_RETRY_COUNT = 10;

export interface DispatchPayoutBatchInput {
  /** ID kỳ quay cần trả thưởng. */
  drawId: string;
}

export interface DispatchPayoutBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true nếu đã trả thưởng hết tất cả entry (không còn pending). */
  done: boolean;
  /** Số entry đã gửi trả thưởng thành công qua tenant gateway. */
  dispatched: number;
  /** Số entry gửi trả thưởng thất bại. */
  failed: number;
  /** Số entry bị bỏ qua do vượt quá số lần retry tối đa (MAX_RETRY_COUNT). */
  skipped: number;
  /** Kết quả trả thưởng theo từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entry đã dispatch thành công. */
    dispatched: number;
    /** Số entry dispatch thất bại. */
    failed: number;
    /** Tổng số tiền trả thưởng cho tenant (VND). */
    totalAmount: number;
  }>;
}

export class DispatchPayoutBatchUseCase extends InternalUseCase<
  DispatchPayoutBatchInput,
  DispatchPayoutBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: DispatchPayoutBatchInput): Promise<DispatchPayoutBatchResult> {
    const { drawId } = input;
    const entries = await this.entryRepo.getPendingPayoutEntries(drawId, BATCH_QUERY_LIMIT);

    if (entries.length === 0) {
      return { drawId, done: true, dispatched: 0, failed: 0, skipped: 0, tenantResults: [] };
    }

    const eligible = entries.filter(
      (e) => ((e as any).payout?.payoutRetryCount ?? 0) < MAX_RETRY_COUNT,
    );
    const skipped = entries.length - eligible.length;

    if (eligible.length === 0 && skipped > 0) {
      return { drawId, done: true, dispatched: 0, failed: 0, skipped, tenantResults: [] };
    }

    const tenantGroups = groupByTenant(eligible);
    const tenantResults: DispatchPayoutBatchResult["tenantResults"] = [];
    let totalDispatched = 0;
    let totalFailed = 0;

    for (const [tenantId, tenantEntries] of tenantGroups) {
      const result = await dispatchToTenant(this.entryRepo, tenantId, drawId, tenantEntries);
      tenantResults.push(result);
      totalDispatched += result.dispatched;
      totalFailed += result.failed;
    }

    const remaining = await this.entryRepo.countPendingPayoutEntries(drawId);

    return {
      drawId,
      done: remaining === 0,
      dispatched: totalDispatched,
      failed: totalFailed,
      skipped,
      tenantResults,
    };
  }
}

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

async function dispatchToTenant(
  entryRepo: EntryRepository,
  tenantId: string,
  drawId: string,
  entries: any[],
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalAmount: number;
}> {
  const totalAmount = entries.reduce((s: number, e: any) => s + (e.payout?.payoutAmount ?? 0), 0);

  const gateway = await tenantGateway.getClient(tenantId);

  if (!gateway) {
    console.warn(
      `[dispatch-payout] Tenant ${tenantId}: no callbackBaseUrl configured. ` +
        `${entries.length} entries, ${totalAmount} VND (DRY-RUN → auto-dispatched)`,
    );
    const ids = entries.map(extractId);
    await entryRepo.batchMarkPayoutDispatched(ids);
    return { tenantId, dispatched: entries.length, failed: 0, totalAmount };
  }

  const batches = chunk(entries, PAYOUT_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const txToEntryId = new Map<string, string>();
    const items: BatchTransactionItem[] = batch.map((e: any) => {
      const entryId = extractId(e);
      const tx = e.payout!.payoutTx!;
      txToEntryId.set(tx, entryId);
      return {
        action: "credit" as const,
        reason: "payout" as const,
        tx,
        playerId: e.accountId,
        amount: e.payout?.payoutAmount ?? 0,
        currency: DEFAULT_CURRENCY,
        gameId: GameProduct.Mega645,
        roundIds: [drawId],
        description: `Trả thưởng Mega 6/45 kỳ ${drawId}`,
        metadata: { entryId, ticketNo: e.entrySummary?.ticketNo ?? "" },
      };
    });

    const ids = batch.map(extractId);

    try {
      const response = await gateway.batchTransaction({ items });

      if (!response.success) {
        const errMsg = response.error?.message ?? "Batch transaction failed";
        console.error(`[dispatch-payout] Tenant ${tenantId} batch error: ${errMsg}`);
        await entryRepo.batchMarkPayoutFailed(ids, errMsg);
        failed += batch.length;
        continue;
      }

      const succeededIds: string[] = [];
      const failedIds: string[] = [];
      const failedErrors: string[] = [];

      for (const r of response.data!.results) {
        const entryId = txToEntryId.get(r.tx);
        if (!entryId) continue;
        if (r.success) {
          succeededIds.push(entryId);
        } else {
          failedIds.push(entryId);
          failedErrors.push(r.error?.message ?? "unknown");
        }
      }

      if (succeededIds.length > 0) {
        await entryRepo.batchMarkPayoutDispatched(succeededIds);
        dispatched += succeededIds.length;
      }
      if (failedIds.length > 0) {
        const errMsg = failedErrors.join("; ");
        await entryRepo.batchMarkPayoutFailed(failedIds, errMsg || "Tenant returned failed");
        failed += failedIds.length;
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(`[dispatch-payout] Tenant ${tenantId} batch failed: ${errMsg}`);
      await entryRepo.batchMarkPayoutFailed(ids, errMsg);
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalAmount };
}
