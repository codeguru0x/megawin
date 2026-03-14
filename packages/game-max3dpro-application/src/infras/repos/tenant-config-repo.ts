import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { AbstractTenantConfigRepository } from "@megawin/game-max3d-core/repos";
import { TenantConfigMapper } from "../mappers/tenant-config-mapper";
import type { TenantConfigEntity } from "@megawin/game-max3dpro/entities";

export class TenantConfigRepository extends AbstractTenantConfigRepository<
  TenantConfigEntity,
  TenantConfigMapper
> {
  constructor() {
    super({
      collName: Max3dproCollections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }
}

export type { TenantConfigEntity };
