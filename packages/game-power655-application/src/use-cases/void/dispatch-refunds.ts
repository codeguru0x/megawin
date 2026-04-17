/**
 * Use Case: Dispatch Refund Batch (Power 6/55)
 *
 * Step 3 (loop) của Void Draw Step Function.
 * Pipeline: prepare-void → void-entries → **dispatch-refunds** → finalize-void
 *
 * Gửi yêu cầu hoàn tiền cho từng tenant qua TenantGateway API.
 *
 * LUỒNG XỬ LÝ:
 *   1. Query tối đa BATCH_QUERY_LIMIT entries có voidInfo.refundStatus = pending/failed
 *   2. Group entries theo tenantId (mỗi tenant có endpoint gateway riêng)
 *   3. Với mỗi tenant: load gateway client → chia nhỏ thành chunks → dispatch từng chunk
 *   4. Kiểm tra xem còn entries pending → trả done = true/false
 *
 * CRASH-SAFE:
 *   - Query chỉ entries có voidInfo.refundStatus = pending/failed
 *   - Entries đã dispatch (refundStatus = dispatched) không bị gửi lại
 *   - Mỗi entry được mark dispatched/failed ngay sau khi có kết quả
 *   - done = true khi hết entries cần refund
 *
 * DRY-RUN MODE:
 *   - Tenant không có callbackBaseUrl (chưa tích hợp gateway) → auto-dispatched
 *   - Chỉ mark status, không gọi API thực → player tự nhận tiền khi tenant kết nối sau
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { tenantGateway, type BatchTransactionItem } from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import { DEFAULT_CURRENCY } from "@megawin/shared/types";

/** Số entries tối đa query mỗi lần gọi Lambda. */
const BATCH_QUERY_LIMIT = 200;

/**
 * Số entries gửi trong 1 request tới TenantGateway.
 * Giới hạn 50 để tránh rate limit / timeout từ gateway bên tenant.
 * Nếu 1 chunk fail → chỉ chunk đó bị mark failed, các chunk khác không ảnh hưởng.
 */
const REFUND_CHUNK_SIZE = 50;

export interface DispatchRefundBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true khi đã hết entries cần hoàn tiền. */
  done: boolean;
  /** Số entries đã dispatch hoàn tiền thành công. */
  dispatched: number;
  /** Số entries dispatch hoàn tiền thất bại. */
  failed: number;
  /** Chi tiết kết quả theo từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entries hoàn tiền thành công cho tenant. */
    dispatched: number;
    /** Số entries hoàn tiền thất bại cho tenant. */
    failed: number;
    /** Tổng số tiền hoàn cho tenant (VND). */
    totalRefundAmount: number;
  }>;
}

/**
 * Dispatch refund cho entries đã void Power 6/55.
 *
 * Mỗi lần execute xử lý 1 batch (tối đa BATCH_QUERY_LIMIT entries).
 * Step Function gọi lặp lại cho đến khi done = true.
 *
 * @param input.drawId - ID kỳ quay cần dispatch refund
 * @returns done = true nếu hết entries cần refund, false nếu cần gọi tiếp
 */
export class DispatchRefundBatchUseCase extends InternalUseCase<
  VoidContext,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<DispatchRefundBatchResult> {
    const { drawId } = input;

    // ── Bước 1: Query entries cần dispatch refund ──────────────────────
    // Chỉ lấy entries có voidInfo.refundStatus = pending hoặc failed (retry).
    const entries = await this.entryRepo.getPendingRefundEntries(drawId, BATCH_QUERY_LIMIT);

    // Không còn entries cần refund → báo done.
    if (entries.length === 0) {
      return {
        drawId,
        done: true,
        dispatched: 0,
        failed: 0,
        tenantResults: [],
      };
    }

    // ── Bước 2: Group entries theo tenant ──────────────────────────────
    // Mỗi tenant có gateway endpoint riêng → phải dispatch riêng biệt.
    const tenantGroups = groupByTenant(entries);
    const tenantResults: DispatchRefundBatchResult["tenantResults"] = [];
    let totalDispatched = 0;
    let totalFailed = 0;

    // ── Bước 3: Dispatch refund cho từng tenant ───────────────────────
    for (const [tenantId, tenantEntries] of tenantGroups) {
      const result = await dispatchRefundToTenant(this.entryRepo, tenantId, drawId, tenantEntries);
      tenantResults.push(result);
      totalDispatched += result.dispatched;
      totalFailed += result.failed;
    }

    // ── Bước 4: Kiểm tra còn entries pending ──────────────────────────
    // Query thêm 1 entry để xác định có cần gọi tiếp hay không.
    // (Batch hiện tại có thể không phải batch cuối.)
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

// ─── Private helpers ───────────────────────────────────────────────────────

/**
 * Group entries theo tenantId.
 * Mỗi tenant có gateway endpoint riêng (callbackBaseUrl, apiKey) →
 * phải gửi request tách biệt. Group trước giúp chỉ load TenantConfig 1 lần/tenant.
 */
function groupByTenant(entries: TicketEntryEntity[]): Map<string, TicketEntryEntity[]> {
  const map = new Map<string, TicketEntryEntity[]>();
  for (const entry of entries) {
    const list = map.get(entry.tenantId) ?? [];
    list.push(entry);
    map.set(entry.tenantId, list);
  }
  return map;
}

/**
 * Chia mảng thành các chunk nhỏ có kích thước tối đa `size`.
 * Dùng để giới hạn số entries/request gửi tới TenantGateway (rate limiting).
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Trích xuất entry ID string từ TicketEntryEntity.
 * entity.id là ObjectId hex string từ application mapper.
 */
function extractId(entry: TicketEntryEntity): string {
  return entry.id;
}

/**
 * Dispatch refund cho tất cả entries của 1 tenant cụ thể.
 *
 * Luồng:
 *   1. Tính tổng refundAmount (để trả về cho reporting)
 *   2. Load gateway client từ TenantConfig
 *   3a. Nếu KHÔNG có gateway (DRY-RUN) → mark tất cả entries là dispatched
 *   3b. Nếu CÓ gateway → chia entries thành chunks (REFUND_CHUNK_SIZE = 50)
 *       → gửi từng chunk → mark dispatched/failed theo kết quả
 *
 * ERROR HANDLING:
 *   - Response thành công: per-entry status → mark dispatched hoặc failed
 *   - Response "duplicate": coi như success (idempotent, gateway đã nhận trước đó)
 *   - Network/timeout error: toàn bộ chunk bị mark failed → sẽ retry lần gọi sau
 *   - markRefundFailed ghi lý do lỗi vào DB → debug và audit trail
 *
 * @param entryRepo - Repo entries để cập nhật refund status
 * @param tenantId - ID tenant
 * @param drawId - ID kỳ quay (dùng cho transactionId)
 * @param entries - Danh sách entries cần refund của tenant này
 * @returns Kết quả dispatch: dispatched count, failed count, totalRefundAmount
 */
async function dispatchRefundToTenant(
  entryRepo: EntryRepository,
  tenantId: string,
  drawId: string,
  entries: TicketEntryEntity[],
): Promise<{
  tenantId: string;
  dispatched: number;
  failed: number;
  totalRefundAmount: number;
}> {
  const totalRefundAmount = entries.reduce((s, e) => s + (e.voidInfo?.refundAmount ?? 0), 0);

  const gateway = await tenantGateway.getClient(tenantId);

  // ── DRY-RUN: tenant chưa cấu hình callbackBaseUrl ────────────────
  // Không gọi API, chỉ mark dispatched. Tenant tự xử lý hoàn tiền khi kết nối sau.
  // Log warning để operator biết có entries bị auto-dispatched.
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

  // ── Dispatch thực tế: chia thành chunks để tránh rate limit ────────
  const batches = chunk(entries, REFUND_CHUNK_SIZE);
  let dispatched = 0;
  let failed = 0;

  for (const batch of batches) {
    const txToEntryId = new Map<string, string>();
    const items: BatchTransactionItem[] = batch.map((e) => {
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
        gameId: GameProduct.Power655,
        roundIds: [drawId],
        description: `Hoàn tiền Power 6/55 kỳ ${drawId} – kỳ bị huỷ`,
        metadata: { entryId, ticketNo: e.entrySummary?.ticketNo ?? "" },
      };
    });

    try {
      const response = await gateway.batchTransaction({ items });

      if (!response.success) {
        const errMsg = response.error?.message ?? "Batch transaction failed";
        console.error(`[dispatch-refund] Tenant ${tenantId} batch failed: ${errMsg}`);
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
    } catch (err: unknown) {
      // Network error / timeout / unexpected exception → toàn bộ chunk failed.
      // Ghi error cho từng entry → retry ở lần gọi sau.
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[dispatch-refund] Tenant ${tenantId} batch failed: ${errMsg}`);
      for (const e of batch) {
        await entryRepo.markRefundFailed(extractId(e), errMsg);
      }
      failed += batch.length;
    }
  }

  return { tenantId, dispatched, failed, totalRefundAmount };
}
