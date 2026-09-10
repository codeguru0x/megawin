import type { OpsHubSnapshotOutput } from "@megawin/game-bingo18-application/use-cases/operations";
import { GetOpsHubSnapshotUseCase } from "@megawin/game-bingo18-application/use-cases/operations";

const useCase = new GetOpsHubSnapshotUseCase();

/**
 * Cache snapshot hub Bingo18 ở cấp module — tách RIÊNG khỏi Keno (biến module khác,
 * không share `cachedSnapshot` với `api/keno/.../snapshot-cache.ts`).
 *
 * Tách khỏi `route.ts` vì Next.js Route Handler chỉ cho export HTTP method + config field;
 * export `invalidateHubSnapshotCache` từ `route.ts` bị coi là export không hợp lệ.
 */
const HUB_SNAPSHOT_CACHE_TTL_MS = 2_000;

/** Tên biến rõ ràng Bingo18 — tránh lẫn với cache Keno cùng pattern. */
let bingo18HubSnapshotCache: { data: OpsHubSnapshotOutput; limit: number; expiresAt: number } | null = null;
/** Gộp các request đồng thời rơi vào lúc cache vừa hết hạn — tránh N query trùng lặp. */
let pendingFetch: Promise<OpsHubSnapshotOutput> | null = null;

/**
 * Đọc snapshot qua cache TTL ngắn — gọi SAU khi auth guard đã pass (xem `route.ts`).
 *
 * TTL 2s: K staff poll trong cùng cửa sổ chỉ tốn 1 lần đọc DB. `serverNow` có thể cũ tới
 * TTL này — 2s nằm trong sai số cho phép (ngưỡng nhỏ nhất ~30s salesClose).
 */
export async function getSnapshotCached(limit: number): Promise<OpsHubSnapshotOutput> {
  const now = Date.now();
  if (bingo18HubSnapshotCache && bingo18HubSnapshotCache.limit === limit && bingo18HubSnapshotCache.expiresAt > now) {
    return bingo18HubSnapshotCache.data;
  }
  // So sánh tường minh với `null` — Biome `noMisusedPromises` coi Promise trong điều kiện
  // là khả năng quên `await`; ở đây chủ đích kiểm tra "đang có fetch pending hay không".
  if (pendingFetch !== null) {
    return pendingFetch;
  }

  pendingFetch = useCase.getData({ limit }).finally(() => {
    pendingFetch = null;
  });

  const data = await pendingFetch;
  bingo18HubSnapshotCache = { data, limit, expiresAt: Date.now() + HUB_SNAPSHOT_CACHE_TTL_MS };
  return data;
}

/**
 * Xoá snapshot Bingo18 đang cache — PHẢI gọi từ MỌI route mutate trạng thái kỳ Hub
 * NGAY SAU khi DB write commit thành công, TRƯỚC khi trả response.
 *
 * Cache độc lập với Keno: bulk action Keno KHÔNG invalidate cache Bingo18 và ngược lại.
 */
export function invalidateHubSnapshotCache(): void {
  bingo18HubSnapshotCache = null;
}
