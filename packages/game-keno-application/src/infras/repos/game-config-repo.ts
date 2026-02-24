import { KenoCollections } from "@megawin/game-keno/entities";
import { GameConfigScope, GameProduct } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import {
  GameConfigMapper,
  TenantConfigMapper,
  type GlobalConfigEntity,
  type TenantConfigEntity,
} from "../mappers/game-config-mapper";

export class GameConfigRepository extends BaseRepo<
  GlobalConfigEntity,
  GameConfigMapper
> {
  constructor() {
    super({
      collName: KenoCollections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }

  async getGlobalConfig(): Promise<GlobalConfigEntity | null> {
    return await this.findOne({
      product: GameProduct.Keno,
      scope: GameConfigScope.Global,
    });
  }
}

export class TenantConfigRepository extends BaseRepo<
  TenantConfigEntity,
  TenantConfigMapper
> {
  constructor() {
    super({
      collName: KenoCollections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfigEntity | null> {
    return await this.findOne({
      product: GameProduct.Keno,
      scope: GameConfigScope.Tenant,
      tenantId,
    });
  }
}
