/**
 * Use Case: Dispatch Refund Batch (Bingo 18)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Gửi yêu cầu hoàn tiền cho tenant qua TenantGateway API.
 *
 * CRASH-SAFE: entries đã dispatch refund không bị gửi lại.
 * done = true khi hết entries cần refund.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  createTenantGatewayClient,
  type TenantGatewayClient,
  type RefundItem,
} from "@megawin/tenant-gateway";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { VoidContext } from "./types";

const BATCH_QUERY_LIMIT = 200;
const REFUND_CHUNK_SIZE = 50;
const GAME_PRODUCT_BINGO18 = "bingo18";

export interface DispatchRefundBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true khi không còn entries pending refund → kết thúc loop. */
  done: boolean;
  /** Tổng entries đã gửi refund thành công. */
  dispatched: number;
  /** Tổng entries gửi refund thất bại. */
  failed: number;
  /** Chi tiết kết quả refund từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entries đã dispatch thành công cho tenant. */
    dispatched: number;
    /** Số entries dispatch thất bại cho tenant. */
    failed: number;
    /** Tổng tiền hoàn trả cho tenant (VND) = Σ(entry.voidInfo.refundAmount). */
    totalRefundAmount: number;
  }>;
}

export class DispatchRefundBatchUseCase extends InternalUseCase<
  VoidContext,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(
    input: VoidContext
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
        this.getTenantConfig,
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

// ─── Private helpers ───

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

async function dispatchRefundToTenant(
  entryRepo: EntryRepository,
  getTenantConfig: GetTenantConfigInternalUseCase,
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

  const gateway = await loadGatewayClient(getTenantConfig, tenantId);

  if (!gateway) {
    console.warn(
      `[dispatch-refund-bingo18] Tenant ${tenantId}: no callbackBaseUrl. ` +
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
      entryId: extractId(e),
      amount: e.voidInfo?.refundAmount ?? 0,
      currency: "VND",
      transactionId: `refund-${drawId}-${extractId(e)}`,
      gameId: GAME_PRODUCT_BINGO18,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Hoàn tiền Bingo 18 kỳ ${drawId} – kỳ bị huỷ`,
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
        `[dispatch-refund-bingo18] Tenant ${tenantId} batch failed: ${errMsg}`
      );
      for (const e of batch) {
        await entryRepo.markRefundFailed(extractId(e), errMsg);
      }
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalRefundAmount };
}
