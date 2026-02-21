import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import type {
  UpdateTenantStatusInput,
  UpdateTenantStatusOutput,
} from "./dto/tenant.dto";

export class UpdateTenantStatusUseCase extends NextApiUseCase<
  UpdateTenantStatusInput,
  UpdateTenantStatusOutput
> {
  protected async execute(
    input: UpdateTenantStatusInput,
  ): Promise<UpdateTenantStatusOutput> {
    const repo = new TenantRepository();

    const tenant = await repo.updateTenantStatus(
      input.tenantId,
      input.status,
    );

    if (!tenant) {
      throw AppException.notFound(`Tenant "${input.tenantId}" không tồn tại.`);
    }

    return {
      tenantId: tenant.tenantId,
      status: tenant.status,
    };
  }
}
