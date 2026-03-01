import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import type { UpdateTenantInput, UpdateTenantOutput } from "./dto/tenant.dto";

export class UpdateTenantUseCase extends NextApiUseCase<
  UpdateTenantInput,
  UpdateTenantOutput
> {
  protected async execute(
    input: UpdateTenantInput
  ): Promise<UpdateTenantOutput> {
    const repo = new TenantRepository();

    const tenant = await repo.updateTenant(input.tenantId, {
      displayName: input.displayName,
      description: input.description,
      callbackBaseUrl: input.callbackBaseUrl,
    });

    if (!tenant) {
      throw AppException.notFound(`Tenant "${input.tenantId}" không tồn tại.`);
    }

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
    };
  }
}
