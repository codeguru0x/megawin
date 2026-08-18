/**
 * Cache module: Active Jackpot Cycle (Mega 6/45) — CHỈ cho read path HIỂN THỊ.
 *
 * ⚠️ PHẠM VI SỬ DỤNG: chỉ dùng trong use-case ĐỌC phục vụ player/UI (getJackpot của
 * game, widget jackpot gộp cross-game `GET /games/jackpots`). TUYỆT ĐỐI KHÔNG dùng
 * trong settle / void / resettle / báo cáo tài chính — những flow đó phải đọc thẳng
 * `JackpotCycleRepository` để có số liệu tươi. Staleness ở đường tiền = sai tiền.
 *
 * Policy: read-through TTL 60s — jackpot chỉ đổi khi settle (Mega 6/45 quay 3 kỳ/tuần)
 * nên 60s là rất bảo toàn. `negativeTtlSec: 5` để cycle mới vừa tạo xuất hiện gần như
 * ngay (không bị negative-cache 60s "chưa có jackpot").
 *
 * KHÔNG invalidate từ settle worker: chậm tối đa 60s trên widget hiển thị là chấp nhận
 * được, đổi lại không chèn cache concern vào đường settle. `invalidate()` vẫn export
 * để dùng khi có nhu cầu thật (VD ops flush).
 *
 * ⚠️ Entity chứa field `Date` (startedAt/closedAt/createdAt/updatedAt). Từ 17/08 L2 Redis giữ
 * nguyên kiểu `Date` qua `json-date-codec` (`@megawin/cache`), nên KHÔNG còn bị JSON làm thành
 * string. Vẫn nên bọc `new Date(...)` khi gọi method của Date: entry được ghi TRƯỚC deploy codec
 * còn nằm trong Redis tới hết TTL, và một app chưa deploy vẫn có thể ghi entry định dạng cũ.
 */

import { createCachedFetcher, getDefaultCacheStore } from "@megawin/cache";
import type { JackpotCycleEntity } from "@megawin/game-mega645/entities";

import { JackpotCycleRepository } from "../infras/repos/jackpot-cycle-repo";
import { MEGA645_CACHE_KEYS } from "./keys";

let repo: JackpotCycleRepository | null = null;

/** Lazy singleton — tạo repo ở fetch đầu tiên (không phải lúc import), tái dùng qua warm invocation. */
function getRepo(): JackpotCycleRepository {
  if (!repo) {
    repo = new JackpotCycleRepository();
  }

  return repo;
}

// Module-level singleton — mọi use-case trong process share cùng 1 cache.
const fetcher = createCachedFetcher<void, JackpotCycleEntity | null>(
  // Loader KHÔNG catch lỗi DB: lỗi phải propagate để không bị negative-cache oan.
  async () => await getRepo().getActiveCycle(),
  {
    store: getDefaultCacheStore(),
    keyPrefix: MEGA645_CACHE_KEYS.activeJackpotCycle,
    ttlSec: 60,
    negativeTtlSec: 5,
  },
);

/**
 * Cache read-through cho jackpot cycle đang active của Mega 6/45.
 *
 * - `fetch()`      : dùng trong read use-case HIỂN THỊ (KHÔNG dùng ở settle/void/resettle).
 * - `invalidate()` : xoá cache khi cần dữ liệu tươi ngay (ops flush).
 */
export const activeJackpotCycleCache = {
  fetch: (): Promise<JackpotCycleEntity | null> => fetcher.fetch(),
  invalidate: (): Promise<void> => fetcher.invalidate(),
};
