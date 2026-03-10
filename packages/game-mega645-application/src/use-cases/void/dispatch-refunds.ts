import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  createTenantGatewayClient,
  type TenantGatewayClient,
  type RefundItem,
} from "@megawin/tenant-gateway";
import { GameProduct } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type { VoidContext } from "./types";

/** Số entries tối đa query 1 lần — tránh load quá nhiều document vào memory. */
const BATCH_QUERY_LIMIT = 200;

/** Số entries tối đa gửi đi trong 1 batchRefund API call tới TenantGateway. */
const REFUND_CHUNK_SIZE = 50;

/**
 * Kết quả của 1 lần chạy DispatchRefundBatch.
 * Step Function dùng `done` để quyết định loop tiếp hay chuyển sang FinalizeVoid.
 */
export interface DispatchRefundBatchResult {
  /** ID kỳ quay. */
  drawId: string;
  /** true nếu đã hoàn tiền hết tất cả entry (không còn pending). */
  done: boolean;
  /** Số entry đã gửi hoàn tiền thành công qua tenant gateway trong lần chạy này. */
  dispatched: number;
  /** Số entry gửi hoàn tiền thất bại trong lần chạy này. */
  failed: number;
  /** Kết quả hoàn tiền chi tiết theo từng tenant. */
  tenantResults: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Số entry đã dispatch thành công. */
    dispatched: number;
    /** Số entry dispatch thất bại. */
    failed: number;
    /** Tổng số tiền hoàn trả cho tenant (VND). Công thức: Σ(entry.voidInfo.refundAmount). */
    totalRefundAmount: number;
  }>;
}

/**
 * Use Case: Dispatch Refund Batch (Mega 6/45)
 *
 * Step 4 (loop) của Void Draw Step Function.
 * Query entries có refundStatus=pending, nhóm theo tenant, gửi batchRefund qua TenantGateway API.
 *
 * CRASH-SAFE: chỉ query entries refundStatus=pending → đã dispatch/failed tự skip.
 * Mỗi lần chạy xử lý tối đa BATCH_QUERY_LIMIT entries, chia nhỏ thành chunk REFUND_CHUNK_SIZE
 * trước khi gửi API. done=true khi không còn entry pending nào.
 *
 * DRY-RUN: Tenant không có callbackBaseUrl → tự mark dispatched (không gửi API thật).
 * duplicate response từ gateway → coi như success (idempotent).
 */
export class DispatchRefundBatchUseCase extends InternalUseCase<
  VoidContext,
  DispatchRefundBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly tenantConfigRepo = new TenantConfigRepository();

  protected async execute(
    input: VoidContext
  ): Promise<DispatchRefundBatchResult> {
    const { drawId } = input;

    // Query batch entries cần hoàn tiền (refundStatus=pending).
    // Giới hạn BATCH_QUERY_LIMIT để tránh timeout Lambda.
    const entries = await this.entryRepo.getPendingRefundEntries(
      drawId,
      BATCH_QUERY_LIMIT
    );

    if (entries.length === 0) {
      return { drawId, done: true, dispatched: 0, failed: 0, tenantResults: [] };
    }

    // Nhóm entries theo tenant để gọi 1 batchRefund API cho mỗi tenant,
    // tránh gọi nhiều API cho cùng 1 tenant trong 1 batch.
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

    // Kiểm tra lại sau khi dispatch xong batch này — có thể còn entries pending
    // từ các batch trước chưa được xử lý (BATCH_QUERY_LIMIT < tổng entries).
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

/**
 * Nhóm entries theo tenantId để gửi batchRefund cho từng tenant riêng.
 * Mỗi tenant có gateway endpoint khác nhau, không thể gộp chung.
 */
function groupByTenant(entries: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const entry of entries) {
    const list = map.get(entry.tenantId) ?? [];
    list.push(entry);
    map.set(entry.tenantId, list);
  }
  return map;
}

/** Chia mảng thành các chunk có kích thước tối đa `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Trích xuất entry ID từ document MongoDB.
 * Entry có thể có `id` (string) hoặc `_id` (ObjectId) tùy version schema.
 */
function extractId(entry: any): string {
  return entry.id ?? entry._id?.toHexString?.() ?? String(entry._id);
}

/**
 * Load TenantGatewayClient từ TenantConfig.
 * Trả về null nếu tenant không có callbackBaseUrl (DRY-RUN mode).
 */
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

/**
 * Gửi refund cho tất cả entries của 1 tenant qua TenantGateway batchRefund API.
 *
 * DRY-RUN: Nếu tenant không có callbackBaseUrl, tự mark dispatched mà không gọi API.
 * Dùng cho môi trường dev/test hoặc tenant chưa cấu hình gateway.
 *
 * duplicate từ gateway = success: transactionId đã tồn tại = refund đã xử lý trước đó.
 * Gặp lỗi cả batch → mark failed từng entry để retry sau.
 */
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
  // Tính tổng refundAmount trước khi gọi gateway để log và return kết quả.
  const totalRefundAmount = entries.reduce(
    (s: number, e: any) => s + (e.voidInfo?.refundAmount ?? 0),
    0
  );

  const gateway = await loadGatewayClient(tenantConfigRepo, tenantId);

  if (!gateway) {
    // DRY-RUN: Tenant chưa cấu hình callbackBaseUrl → mark tất cả dispatched,
    // không gửi API thật. Thường gặp ở môi trường dev hoặc tenant internal.
    console.warn(
      `[dispatch-refund] Tenant ${tenantId}: no callbackBaseUrl. ` +
        `${entries.length} entries, ${totalRefundAmount} VND (DRY-RUN → auto-dispatched)`
    );
    for (const e of entries) {
      await entryRepo.markRefundDispatched(extractId(e));
    }
    return { tenantId, dispatched: entries.length, failed: 0, totalRefundAmount };
  }

  // Chia entries thành chunks nhỏ để tránh vượt quá giới hạn payload của gateway API.
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
      // transactionId duy nhất per entry — đảm bảo idempotent nếu retry.
      transactionId: `refund-${drawId}-${extractId(e)}`,
      gameId: GameProduct.Mega645,
      roundId: drawId,
      ticketNo: e.entrySummary?.ticketNo ?? "",
      description: `Hoàn tiền Mega 6/45 kỳ ${drawId} – kỳ bị huỷ`,
    }));

    try {
      const response = await gateway.batchRefund({ items });

      for (const r of response.results) {
        if (r.status === "success" || r.status === "duplicate") {
          // duplicate = transactionId đã tồn tại → refund đã xử lý trước đó → idempotent.
          await entryRepo.markRefundDispatched(r.entryId);
          dispatched++;
        } else {
          await entryRepo.markRefundFailed(r.entryId, r.error ?? "Tenant returned failed");
          failed++;
        }
      }
    } catch (err: any) {
      // Lỗi cả batch (network, timeout...) → mark failed từng entry.
      // Các entry failed sẽ còn trong pending, Step Function loop lại ở lần sau.
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
