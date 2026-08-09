import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { tenantCallbackConfigCache } from "@megawin/tenant-gateway/caches";

import { TenantRepository } from "../../infras/repos/tenant-repo";
import { generateApiKey } from "../../shared/generate-api-key";
import type { RegenerateApiKeyInput, RegenerateApiKeyOutput } from "./dto/tenant.dto";

export class RegenerateApiKeyUseCase extends NextApiUseCase<RegenerateApiKeyInput, RegenerateApiKeyOutput> {
  protected async execute(input: RegenerateApiKeyInput): Promise<RegenerateApiKeyOutput> {
    const repo = new TenantRepository();
    const newApiKey = generateApiKey();

    const tenant = await repo.regenerateApiKey(input.tenantId, newApiKey);

    if (!tenant) {
      throw AppException.notFound(`Tenant "${input.tenantId}" không tồn tại.`);
    }

    // apiKey vừa rotate nằm trong cached config → dọn cache ngay để gateway
    // ký request bằng key mới, tránh gọi callback bằng apiKey cũ tối đa 10 phút.
    await tenantCallbackConfigCache.invalidate(input.tenantId);

    return {
      tenantId: tenant.tenantId,
      apiKey: tenant.apiKey,
    };
  }
}
