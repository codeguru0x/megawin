/**
 * Use Case: Get Global Config (Mega 6/45)
 *
 * Điểm truy cập duy nhất để lấy global config cho game Mega 6/45.
 * Tất cả use cases nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * Cache concern (key, TTL, loader, invalidation) sống ở `caches/global-config.cache.ts`
 * — use-case chỉ gọi `globalConfigCache.fetch()`. Invalidate khi admin cập nhật
 * config qua `globalConfigCache.invalidate()` (xem update-game-config.ts).
 *
 * Route `GET /api/mega645/config` (backoffice) cũng dùng THẲNG use-case này — trả `GlobalConfigEntity` trần.
 * KHÔNG bọc thêm `{ config }`: envelope đó từng tồn tại nhưng FE bóc ra ngay, chỉ là nesting vô ích.
 *
 * Cách dùng từ use case khác:
 *   private readonly getGlobalConfig = new GetGlobalConfigUseCase();
 *   const config = await this.getGlobalConfig.run();
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { GlobalConfigEntity } from "@megawin/game-mega645/entities";

import { globalConfigCache } from "../../caches/global-config.cache";

export class GetGlobalConfigUseCase extends UseCase<void, GlobalConfigEntity> {
  protected async execute(): Promise<GlobalConfigEntity> {
    return await globalConfigCache.fetch();
  }
}
