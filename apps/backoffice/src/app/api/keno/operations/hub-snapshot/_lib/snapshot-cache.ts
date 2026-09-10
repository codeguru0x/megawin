import type { OpsHubSnapshotOutput } from "@megawin/game-keno-application/use-cases/operations";
import { GetOpsHubSnapshotUseCase } from "@megawin/game-keno-application/use-cases/operations";

const useCase = new GetOpsHubSnapshotUseCase();

/**
 * Cache snapshot hub ở cấp module — chia sẻ giữa các request đồng thời trên cùng instance
 * (p1-01 §4.3(2)). Tách RIÊNG khỏi `route.ts` (thay vì khai báo thẳng trong đó) — Next.js
 * Route Handler CHỈ cho export HTTP method (`GET`/`POST`/…) + vài config field
 * (`dynamic`/`revalidate`/…); export thêm 1 hàm thường (`invalidateHubSnapshotCache`) từ
 * `route.ts` để route MUTATE khác import bị coi là export không hợp lệ. Đặt ở `_lib` (module
 * thường, không phải route) thì import tự do từ bất kỳ route nào trong `api/keno/`.
 */
const HUB_SNAPSHOT_CACHE_TTL_MS = 2_000;

let cachedSnapshot: { data: OpsHubSnapshotOutput; limit: number; expiresAt: number } | null = null;
/** Gộp các request đồng thời rơi vào lúc cache vừa hết hạn — tránh N query trùng lặp. */
let pendingFetch: Promise<OpsHubSnapshotOutput> | null = null;

/**
 * Đọc snapshot qua cache TTL ngắn — gọi SAU khi auth guard đã pass (xem `route.ts`).
 *
 * TTL ngắn hơn nhịp poll nhiều lần: K staff poll trong cùng cửa sổ 2s chỉ tốn 1 lần đọc DB
 * (query stats FETCH ~33KB/doc — chi phí đắt nhất của route này). `serverNow` trong payload
 * có thể cũ tới TTL này — 2s nằm trong sai số cho phép của mọi ngưỡng dẫn xuất (nhỏ nhất là
 * `MIN_SALES_WINDOW_SECONDS` = 60s). KHÔNG nâng lên hàng chục giây — `serverNow` sẽ nói dối.
 *
 * `React.cache()` KHÔNG dùng được ở đây — nó chỉ dedupe TRONG 1 request
 * (`vercel-react-best-practices` §3.3/§3.6). Cần cache CROSS-request nên dùng biến module.
 *
 * KHÔNG dùng Redis/`@megawin/cache` ở P1: TTL 2s trên cùng instance đã bắt trọn phần lớn
 * trùng lặp; thêm 1 network hop cho thứ sống 2 giây là lỗ.
 */
export async function getSnapshotCached(limit: number): Promise<OpsHubSnapshotOutput> {
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.limit === limit && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.data;
  }
  // So sánh tường minh với `null` (không viết `if (pendingFetch)`) — Biome
  // `nursery/noMisusedPromises` coi biểu thức Promise trong điều kiện là khả năng nhầm
  // quên `await`; ở đây chủ đích kiểm tra "đang có fetch pending hay không", không phải
  // trạng thái resolve của Promise.
  if (pendingFetch !== null) {
    return pendingFetch;
  }

  pendingFetch = useCase.getData({ limit }).finally(() => {
    pendingFetch = null;
  });

  const data = await pendingFetch;
  cachedSnapshot = { data, limit, expiresAt: Date.now() + HUB_SNAPSHOT_CACHE_TTL_MS };
  return data;
}

/**
 * Xoá snapshot đang cache — PHẢI gọi từ MỌI route mutate trạng thái kỳ hiển thị trên Hub
 * (đóng/mở bán, kết sổ, huỷ, công bố kết quả, đổi giờ quay…) NGAY SAU khi DB write commit
 * thành công, TRƯỚC khi trả response.
 *
 * BUG THẬT đã sửa (09/09 — user báo đóng bán hàng loạt xong tab "Chưa có KQ" không tự hiện
 * 3 kỳ vừa đóng, phải bấm "Live" mới thấy): client ĐÃ gọi `invalidateQueries` đúng ngay sau
 * mutation thành công (refetch diễn ra thật), nhưng route GET vẫn có thể trả `cachedSnapshot`
 * CŨ (TTL 2s) nếu request refetch đó rơi trúng cửa sổ 2s kể từ lần đọc gần nhất (VD nhịp poll
 * tự động vừa chạy ngay trước khi staff bấm đóng bán — refetch của client đúng nhưng nhận lại
 * DATA CŨ từ cache server, không phải lỗi client). Vì cache là module-level (không phụ thuộc
 * request), route mutate PHẢI tự xoá nó — GET route không có cách nào biết "vừa có mutate".
 */
export function invalidateHubSnapshotCache(): void {
  cachedSnapshot = null;
}
