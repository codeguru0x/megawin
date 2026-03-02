import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { AbstractTenantConfigRepository } from "@megawin/game-max3d-core/repos";
import {
  TenantConfigMapper,
  type TenantConfigEntity,
} from "../mappers/tenant-config-mapper";

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
