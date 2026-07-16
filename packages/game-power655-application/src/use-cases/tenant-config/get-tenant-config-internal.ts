/**
 * Use Case: Get Tenant Config (Power 6/55) – Internal
 *
 * Điểm truy cập duy nhất để lấy tenant config trong các use case nội bộ.
 * Tất cả use cases (place-bet, dispatch-payout, dispatch-refund…)
 * nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * Cache concern (key, TTL, loader, invalidation) sống ở `caches/tenant-config.cache.ts`
 * — use-case chỉ gọi `tenantConfigCache.fetch(tenantId)`. Invalidate khi admin
 * cập nhật qua `tenantConfigCache.invalidate(tenantId)` (xem update-tenant-config.ts).
 *
 * Cách dùng từ use case khác:
 *   private readonly getTenantConfig = new GetTenantConfigInternalUseCase();
 *   const config = await this.getTenantConfig.run({ tenantId });
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { tenantConfigCache } from "../../caches/tenant-config.cache";
import type { TenantConfigEntity } from "@megawin/game-power655/entities";

export interface GetTenantConfigInternalInput {
  tenantId: string;
}

export class GetTenantConfigInternalUseCase extends InternalUseCase<
  GetTenantConfigInternalInput,
  TenantConfigEntity | null
> {
  protected async execute(input: GetTenantConfigInternalInput): Promise<TenantConfigEntity | null> {
    return await tenantConfigCache.fetch(input.tenantId);
  }
}
