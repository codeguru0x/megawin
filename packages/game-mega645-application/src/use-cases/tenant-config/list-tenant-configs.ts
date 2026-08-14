import { UseCase } from "@megawin/app-core/use-cases";

import { TenantConfigRepository } from "../../infras/repos/tenant-config-repo";
import type { ListTenantConfigsOutput } from "./dto/tenant-config.dto";

export class ListTenantConfigsUseCase extends UseCase<void, ListTenantConfigsOutput> {
  private readonly repo = new TenantConfigRepository();

  protected async execute(): Promise<ListTenantConfigsOutput> {
    const configs = await this.repo.listTenantConfigs();
    return { configs };
  }
}
