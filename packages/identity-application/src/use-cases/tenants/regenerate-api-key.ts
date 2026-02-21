import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import { generateApiKey } from "../../shared/generate-api-key";
import type {
  RegenerateApiKeyInput,
  RegenerateApiKeyOutput,
} from "./dto/tenant.dto";

export class RegenerateApiKeyUseCase extends NextApiUseCase<
  RegenerateApiKeyInput,
  RegenerateApiKeyOutput
> {
  protected async execute(
    input: RegenerateApiKeyInput,
  ): Promise<RegenerateApiKeyOutput> {
    const repo = new TenantRepository();
    const newApiKey = generateApiKey();

    const tenant = await repo.regenerateApiKey(input.tenantId, newApiKey);

    if (!tenant) {
      throw AppException.notFound(`Tenant "${input.tenantId}" không tồn tại.`);
    }

    return {
      tenantId: tenant.tenantId,
      apiKey: tenant.apiKey,
    };
  }
}
