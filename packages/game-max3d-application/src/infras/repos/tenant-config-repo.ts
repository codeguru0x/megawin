import { Max3dCollections } from "@megawin/game-max3d/entities";
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
      collName: Max3dCollections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }
}

export type { TenantConfigEntity };
