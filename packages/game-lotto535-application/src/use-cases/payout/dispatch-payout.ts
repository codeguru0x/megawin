/**
 * Use Case: Dispatch Payout Batch
 *
 * Worker loop trả thưởng cho 1 draw.
 * Chạy đến khi hết entries cần dispatch (done = true).
 *
 * Flow mỗi lần gọi:
 *   1. Query batch entries (payoutStatus = pending/failed, retryCount < max)
 *   2. Group by tenantId
 *   3. Với mỗi tenant: tạo TenantGatewayClient, gửi batchPayout (chunk ≤50)
 *   4. Xử lý response per item: mark dispatched/failed
 *   5. Đếm remaining → done?
 *
 * Crash-safe:
 *   - Entries đã dispatched không bị gửi lại (query filter payoutStatus)
 *   - Tenant nhận entryId làm idempotency key → duplicate = no-op
 *   - Failed entries retry ở vòng loop tiếp theo
 *
 * Tenant down:
 *   - API error → batch entries = failed + ghi lỗi
 *   - Không block các tenant khác
 *   - Retry count tăng, vượt MAX_RETRY → bỏ qua (admin manual)
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import {
  createTenantGatewayClient,
  type TenantGatewayClient,
  type PayoutItem,
} from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TenantConfigRepository } from "../../infras/repos/game-config-repo";

const BATCH_QUERY_LIMIT = 200;
const PAYOUT_CHUNK_SIZE = 50;
const MAX_RETRY_COUNT = 10;

export interface DispatchPayoutBatchInput {
  drawId: string;
}

export interface DispatchPayoutBatchResult {
  drawId: string;
  done: boolean;
  dispatched: number;
  failed: number;
  skipped: number;
  tenantResults: Array<{
    tenantId: string;
    dispatched: number;
    failed: number;
    totalAmount: number;
  }>;
}

export class DispatchPayoutBatchUseCase extends StepFunctionUseCase<
  DispatchPayoutBatchInput,
  DispatchPayoutBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();

  /** Dispatch payout cho 1 batch. Loop cho đến khi done = true. */
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
  tenantId: string,
): Promise<TenantGatewayClient | null> {
  const tenantConfig = await this.tenantConfigRepo.getTenantConfig(tenantId);

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
  const totalAmount = entries.reduce(
    (s: number, e: any) => s + (e.payout?.payoutAmount ?? 0), 0,
  );

  const gateway = await loadGatewayClient(tenantId);

  if (!gateway) {
    console.warn(
      `[dispatch-payout] Tenant ${tenantId}: no callbackBaseUrl configured. ` +
      `${entries.length} entries, ${totalAmount} VND (DRY-RUN → auto-dispatched)`,
    );
    const ids = entries.map(extractId);
    await this.entryRepo.batchMarkPayoutDispatched(ids);
    return { tenantId, dispatched: entries.length, failed: 0, totalAmount };
  }

  const batches = chunk(entries, PAYOUT_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const items: PayoutItem[] = batch.map((e: any) => ({
      playerId: e.playerId,
      entryId: extractId(e),
      amount: e.payout?.payoutAmount ?? 0,
      currency: "VND",
      transactionId: `payout-${drawId}-${extractId(e)}`,
      gameId: GameProduct.Lotto535,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Trả thưởng Lotto 5/35 kỳ ${drawId}`,
    }));

    const ids = batch.map(extractId);

    try {
      const response = await gateway.batchPayout({ items });

      const succeededIds: string[] = [];
      const failedIds: string[] = [];

      for (const r of response.results) {
        if (r.status === "success" || r.status === "duplicate") {
          succeededIds.push(r.entryId);
        } else {
          failedIds.push(r.entryId);
        }
      }

      if (succeededIds.length > 0) {
        await this.entryRepo.batchMarkPayoutDispatched(succeededIds);
        dispatched += succeededIds.length;
      }
      if (failedIds.length > 0) {
        const errMsg = response.results
          .filter((r) => r.status === "failed")
          .map((r) => r.error)
          .join("; ");
        await this.entryRepo.batchMarkPayoutFailed(failedIds, errMsg || "Tenant returned failed");
        failed += failedIds.length;
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(`[dispatch-payout] Tenant ${tenantId} batch failed: ${errMsg}`);
      await this.entryRepo.batchMarkPayoutFailed(ids, errMsg);
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalAmount };
}
