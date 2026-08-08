/**
 * Cache module: Global Config (Lotto 5/35).
 *
 * Sở hữu TOÀN BỘ cache concern cho global config — key, TTL, loader,
 * invalidation — tách khỏi use-case (use-case chỉ gọi `fetch`/`invalidate`).
 *
 * Policy: read-through TTL 60s, single-flight, stale-on-error.
 * Loader throw khi config chưa init → lỗi KHÔNG bị cache (chỉ cache success).
 */

import { createCachedFetcher, getDefaultCacheStore } from "@megawin/cache";
import { AppException } from "@megawin/shared/errors";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { GameConfigRepository } from "../infras/repos/game-config-repo";
import type { GlobalConfigEntity } from "@megawin/game-lotto535/entities";
import { LOTTO535_CACHE_KEYS } from "./keys";

let repo: GameConfigRepository | null = null;

/** Lazy singleton — tạo repo ở fetch đầu tiên (không phải lúc import), tái dùng qua warm invocation (Lambda) và song song (Next.js). Repo stateless nên share an toàn. */
function getRepo(): GameConfigRepository {
  if (!repo) {
    repo = new GameConfigRepository();
  }

  return repo;
}

// Module-level singleton — mọi use-case trong process share cùng 1 cache.
const fetcher = createCachedFetcher<void, GlobalConfigEntity>(
  async () => {
    const config = await getRepo().getGlobalConfig();
    if (!config) {
      // Code riêng (KHÔNG dùng `AppException.internal` generic) để
      // `GetGlobalConfigUseCase` (BO route) bắt CHÍNH XÁC trường hợp này — phân biệt
      // với lỗi hạ tầng khác (analysis §3.8, p0-03). Giữ statusCode 500 (lỗi vận
      // hành/config, không phải lỗi request của client) cho MỌI caller khác (game
      // logic, worker).
      throw new AppException(APP_ERROR_CODES.GAME_CONFIG_NOT_FOUND, "Lotto 5/35 GameConfig chưa được khởi tạo.", {
        statusCode: 500,
      });
    }
    return config;
  },
  {
    store: getDefaultCacheStore(),
    keyPrefix: LOTTO535_CACHE_KEYS.globalConfig,
    ttlSec: 60 * 10, // 10 minutes
  },
);

/**
 * Cache read-through cho global config Lotto 5/35.
 *
 * - `fetch()`      : dùng trong read use-cases thay cho repo trực tiếp.
 * - `invalidate()` : gọi sau khi upsert config thành công (update use-case).
 *   Cross-process: container khác tự hết hạn theo TTL 60s (hoặc qua L2 Redis).
 */
export const globalConfigCache = {
  fetch: (): Promise<GlobalConfigEntity> => fetcher.fetch(),
  invalidate: (): Promise<void> => fetcher.invalidate(),
};
