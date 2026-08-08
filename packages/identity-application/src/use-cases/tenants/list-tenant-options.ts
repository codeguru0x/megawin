import { NextApiUseCase } from "@megawin/next/server";

import { TenantRepository } from "../../infras/repos/tenant-repo";
import type { ListTenantOptionsOutput } from "./dto/tenant.dto";

export class ListTenantOptionsUseCase extends NextApiUseCase<void, ListTenantOptionsOutput> {
  protected async execute(): Promise<ListTenantOptionsOutput> {
    const repo = new TenantRepository();
    const options = await repo.getTenantOptions();

    return {
      tenants: options.map((o) => ({
        tenantId: o.tenantId,
        displayName: o.displayName,
        status: o.status,
      })),
    };
  }
}
