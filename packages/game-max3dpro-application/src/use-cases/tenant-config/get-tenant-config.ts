/**
 * API Use Case: Get Tenant Config (Max 3D Pro)
 *
 * Thin adapter cho API route – delegate sang GetTenantConfigInternalUseCase.
 * Không trực tiếp gọi repo.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import type { GetTenantConfigInput, GetTenantConfigOutput } from "./dto/tenant-config.dto";
import { GetTenantConfigInternalUseCase } from "./get-tenant-config-internal";

export class GetTenantConfigUseCase extends UseCase<GetTenantConfigInput, GetTenantConfigOutput> {
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(input: GetTenantConfigInput): Promise<GetTenantConfigOutput> {
    const config = await this.getTenantConfig.run({
      tenantId: input.tenantId,
    });

    if (!config) {
      throw new AppException(
        "TENANT_CONFIG_NOT_FOUND",
        `Chưa có cấu hình cho tenant "${input.tenantId}". Tạo mới bằng cách cập nhật.`,
      );
    }

    return { config };
  }
}
