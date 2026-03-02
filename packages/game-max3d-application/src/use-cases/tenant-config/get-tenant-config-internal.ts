/**
 * Use Case: Get Tenant Config (Max 3D) – Internal
 *
 * Điểm truy cập duy nhất để lấy tenant config trong các use case nội bộ.
 * Tất cả use cases (place-bet, dispatch-payout, dispatch-refund…)
 * nên dùng use case này thay vì gọi repo trực tiếp.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type { TenantConfigEntity } from "../../infras/mappers/tenant-config-mapper";

export interface GetTenantConfigInternalInput {
  tenantId: string;
}

export class GetTenantConfigInternalUseCase extends InternalUseCase<
  GetTenantConfigInternalInput,
  TenantConfigEntity | null
> {
  private readonly repo = new TenantConfigRepository();

  protected async execute(
    input: GetTenantConfigInternalInput,
  ): Promise<TenantConfigEntity | null> {
    return await this.repo.getTenantConfig(input.tenantId);
  }
}
