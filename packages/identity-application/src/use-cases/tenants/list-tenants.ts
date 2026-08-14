import { UseCase } from "@megawin/app-core/use-cases";

import { TenantRepository } from "../../infras/repos/tenant-repo";
import type { ListTenantsOutput } from "./dto/tenant.dto";

export class ListTenantsUseCase extends UseCase<void, ListTenantsOutput> {
  protected async execute(): Promise<ListTenantsOutput> {
    const repo = new TenantRepository();
    const tenants = await repo.getAllTenants();

    return {
      tenants: tenants.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        displayName: t.displayName,
        description: t.description,
        status: t.status,
        apiKey: t.apiKey,
        callbackBaseUrl: t.callbackBaseUrl,
        apiKeyLastRotatedAt: t.apiKeyLastRotatedAt.toISOString?.() ?? String(t.apiKeyLastRotatedAt),
        createdAt: t.createdAt.toISOString?.() ?? String(t.createdAt),
        updatedAt: t.updatedAt.toISOString?.() ?? String(t.updatedAt),
      })),
    };
  }
}
