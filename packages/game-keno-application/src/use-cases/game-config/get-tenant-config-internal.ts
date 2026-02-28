/**
 * Use Case: Get Tenant Config (Keno) – Internal
 *
 * Điểm truy cập duy nhất để lấy tenant config trong các use case nội bộ.
 * Tất cả use cases (place-bet, dispatch-payout, dispatch-refund…)
 * nên dùng use case này thay vì gọi repo trực tiếp.
 *
 * // TODO: Thêm in-memory cache (TTL ~30-60s) tương tự GetGlobalConfigUseCase.
 * // Cache key = tenantId. Invalidate khi admin cập nhật tenant config.
 *
 * Cách dùng từ use case khác:
 *   private readonly getTenantConfig = new GetTenantConfigInternalUseCase();
 *   const config = await this.getTenantConfig.run({ tenantId });
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type { TenantConfigEntity } from "../../infras/mappers/game-config-mapper";

export interface GetTenantConfigInternalInput {
  tenantId: string;
}

export class GetTenantConfigInternalUseCase extends InternalUseCase<
  GetTenantConfigInternalInput,
  TenantConfigEntity | null
> {
  private readonly repo = new TenantConfigRepository();

  // TODO: Thêm cache layer tại đây (Map<tenantId, { data, expireAt }>)
  // để tránh query DB mỗi lần. Sẽ implement cùng lúc với GlobalConfig cache.

  protected async execute(
    input: GetTenantConfigInternalInput,
  ): Promise<TenantConfigEntity | null> {
    return await this.repo.getTenantConfig(input.tenantId);
  }
}
