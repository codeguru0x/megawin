/**
 * Use Case: Get Global Config (Bingo18) – Internal
 *
 * Điểm truy cập duy nhất để lấy global config cho game Bingo18.
 * Tất cả use cases nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * Cache concern (key, TTL, loader, invalidation) sống ở `caches/global-config.cache.ts`
 * — use-case chỉ gọi `globalConfigCache.fetch()`. Invalidate khi admin cập nhật
 * config qua `globalConfigCache.invalidate()` (xem update-game-config.ts).
 *
 * Cách dùng từ use case khác:
 *   private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
 *   const config = await this.getGlobalConfig.run();
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { globalConfigCache } from "../../caches/global-config.cache";
import type { GlobalConfigEntity } from "@megawin/game-bingo18/entities";

export class GetGlobalConfigInternalUseCase extends InternalUseCase<void, GlobalConfigEntity> {
  protected async execute(): Promise<GlobalConfigEntity> {
    return await globalConfigCache.fetch();
  }
}
