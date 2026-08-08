import { NextApiUseCase } from "@megawin/next/server";
import { TenantRepository } from "../../infras/repos/tenant-repo";
import type { ListTenantsOutput } from "./dto/tenant.dto";

export class ListTenantsUseCase extends NextApiUseCase<void, ListTenantsOutput> {
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
