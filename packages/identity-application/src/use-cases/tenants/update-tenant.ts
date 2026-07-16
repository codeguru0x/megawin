import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { tenantCallbackConfigCache } from "@megawin/tenant-gateway/caches";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import type { UpdateTenantInput, UpdateTenantOutput } from "./dto/tenant.dto";

export class UpdateTenantUseCase extends NextApiUseCase<UpdateTenantInput, UpdateTenantOutput> {
  protected async execute(input: UpdateTenantInput): Promise<UpdateTenantOutput> {
    const repo = new TenantRepository();

    const tenant = await repo.updateTenant(input.tenantId, {
      displayName: input.displayName,
      description: input.description,
      callbackBaseUrl: input.callbackBaseUrl,
    });

    if (!tenant) {
      throw AppException.notFound(`Tenant "${input.tenantId}" không tồn tại.`);
    }

    // callbackBaseUrl nằm trong cached config → đổi thì phải dọn cache ngay,
    // tránh gateway dispatch tới URL cũ tối đa 10 phút (TTL). displayName/description
    // không nằm trong config nên không cần invalidate.
    if (input.callbackBaseUrl !== undefined) {
      await tenantCallbackConfigCache.invalidate(input.tenantId);
    }

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
    };
  }
}
