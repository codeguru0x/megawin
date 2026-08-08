import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import { generateApiKey } from "../../shared/generate-api-key";
import type { CreateTenantInput, CreateTenantOutput } from "./dto/tenant.dto";

export class CreateTenantUseCase extends NextApiUseCase<CreateTenantInput, CreateTenantOutput> {
  protected async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
    const repo = new TenantRepository();
    const apiKey = generateApiKey();

    const existing = await repo.getTenantById(input.tenantId.toLowerCase());
    if (existing) {
      throw AppException.conflict(`Tenant "${input.tenantId}" đã tồn tại.`);
    }

    const tenant = await repo.createTenant({
      tenantId: input.tenantId,
      displayName: input.displayName,
      description: input.description,
      apiKey,
      callbackBaseUrl: input.callbackBaseUrl,
    });

    if (!tenant) {
      throw AppException.internal("Tạo tenant thất bại.");
    }

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      status: tenant.status,
      apiKey: tenant.apiKey,
    };
  }
}
