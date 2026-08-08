import { NextApiUseCase } from "@megawin/next/server";

import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type { ListTenantConfigsOutput } from "./dto/tenant-config.dto";

/**
 * Lấy danh sách tất cả tenant config đã tạo.
 * Sorted theo tenantId tăng dần.
 */
export class ListTenantConfigsUseCase extends NextApiUseCase<void, ListTenantConfigsOutput> {
  private readonly repo = new TenantConfigRepository();

  protected async execute(): Promise<ListTenantConfigsOutput> {
    const configs = await this.repo.listTenantConfigs();
    return { configs };
  }
}
