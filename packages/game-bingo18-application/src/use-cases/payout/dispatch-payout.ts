/**
 * Use Case: Dispatch Payout Batch (Bingo 18)
 *
 * Worker loop trả thưởng cho 1 draw.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  createTenantGatewayClient,
  type TenantGatewayClient,
  type PayoutItem,
} from "@megawin/tenant-gateway";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";

const BATCH_QUERY_LIMIT = 200;
const PAYOUT_CHUNK_SIZE = 50;
const MAX_RETRY_COUNT = 10;
const GAME_PRODUCT_BINGO18 = "bingo18";

export interface DispatchPayoutBatchInput {
  /** ID kỳ quay cần dispatch payout. */
  drawId: string;
}

export interface DispatchPayoutBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true khi không còn entries pending payout → kết thúc loop. */
  done: boolean;
  /** Tổng entries đã gửi payout thành công. */
  dispatched: number;
  /** Tổng entries gửi payout thất bại. */
  failed: number;
  /** Số entries bị skip (vượt MAX_RETRY_COUNT). */
  skipped: number;
  /** Chi tiết kết quả payout từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entries đã dispatch thành công cho tenant. */
    dispatched: number;
    /** Số entries dispatch thất bại cho tenant. */
    failed: number;
    /** Tổng tiền trả thưởng cho tenant (VND) = Σ(entry.payout.payoutAmount). */
    totalAmount: number;
  }>;
}

export class DispatchPayoutBatchUseCase extends InternalUseCase<
  DispatchPayoutBatchInput,
  DispatchPayoutBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(
    input: DispatchPayoutBatchInput
  ): Promise<DispatchPayoutBatchResult> {
    const { drawId } = input;
    const entries = await this.entryRepo.getPendingPayoutEntries(
      drawId,
      BATCH_QUERY_LIMIT
    );

    if (entries.length === 0) {
      return {
        drawId,
        done: true,
        dispatched: 0,
        failed: 0,
        skipped: 0,
        tenantResults: [],
      };
    }

    const eligible = entries.filter(
      (e) => ((e as any).payout?.payoutRetryCount ?? 0) < MAX_RETRY_COUNT
    );
    const skipped = entries.length - eligible.length;

    if (eligible.length === 0 && skipped > 0) {
      return {
        drawId,
        done: true,
        dispatched: 0,
        failed: 0,
        skipped,
        tenantResults: [],
      };
    }

    const tenantGroups = groupByTenant(eligible);
    const tenantResults: DispatchPayoutBatchResult["tenantResults"] = [];
    let totalDispatched = 0;
    let totalFailed = 0;

    for (const [tenantId, tenantEntries] of tenantGroups) {
      const result = await dispatchToTenant(
        this.entryRepo,
        this.getTenantConfig,
        tenantId,
        drawId,
        tenantEntries
      );
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

async function loadGatewayClient(
  getTenantConfig: GetTenantConfigInternalUseCase,
  tenantId: string
): Promise<TenantGatewayClient | null> {
  const tenantConfig = await getTenantConfig.run({ tenantId });

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
  getTenantConfig: GetTenantConfigInternalUseCase,
  tenantId: string,
  drawId: string,
  entries: any[]
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalAmount: number;
}> {
  const totalAmount = entries.reduce(
    (s: number, e: any) => s + (e.payout?.payoutAmount ?? 0),
    0
  );

  const gateway = await loadGatewayClient(getTenantConfig, tenantId);

  if (!gateway) {
    console.warn(
      `[dispatch-payout-bingo18] Tenant ${tenantId}: no callbackBaseUrl. ` +
        `${entries.length} entries, ${totalAmount} VND (DRY-RUN → auto-dispatched)`
    );
    const ids = entries.map(extractId);
    await entryRepo.batchMarkPayoutDispatched(ids);
    return { tenantId, dispatched: entries.length, failed: 0, totalAmount };
  }

  const batches = chunk(entries, PAYOUT_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const items: PayoutItem[] = batch.map((e: any) => ({
      playerId: e.accountId,
      entryId: extractId(e),
      amount: e.payout?.payoutAmount ?? 0,
      currency: "VND",
      transactionId: `payout-bingo18-${drawId}-${extractId(e)}`,
      gameId: GAME_PRODUCT_BINGO18,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Trả thưởng Bingo 18 kỳ ${drawId}`,
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
        await entryRepo.batchMarkPayoutDispatched(succeededIds);
        dispatched += succeededIds.length;
      }
      if (failedIds.length > 0) {
        const errMsg = response.results
          .filter((r) => r.status === "failed")
          .map((r) => r.error)
          .join("; ");
        await entryRepo.batchMarkPayoutFailed(
          failedIds,
          errMsg || "Tenant returned failed"
        );
        failed += failedIds.length;
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(
        `[dispatch-payout-bingo18] Tenant ${tenantId} batch failed: ${errMsg}`
      );
      await entryRepo.batchMarkPayoutFailed(ids, errMsg);
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalAmount };
}
