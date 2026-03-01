import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type {
  GetTenantConfigInput,
  GetTenantConfigOutput,
} from "./dto/tenant-config.dto";

/**
 * Lấy cấu hình game Power 6/55 riêng cho 1 tenant.
 * Nếu chưa tồn tại → throw NOT_FOUND.
 */
export class GetTenantConfigUseCase extends NextApiUseCase<
  GetTenantConfigInput,
  GetTenantConfigOutput
> {
  private readonly repo = new TenantConfigRepository();

  /** @inheritdoc */
  protected async execute(
    input: GetTenantConfigInput
  ): Promise<GetTenantConfigOutput> {
    const config = await this.repo.getTenantConfig(input.tenantId);

    if (!config) {
      throw new AppException(
        "TENANT_CONFIG_NOT_FOUND",
        `Chưa có cấu hình cho tenant "${input.tenantId}". Tạo mới bằng cách cập nhật.`
      );
    }

    return { config };
  }
}
