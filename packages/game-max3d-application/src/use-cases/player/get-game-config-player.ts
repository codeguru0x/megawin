/**
 * Use Case: Get Game Config for Player (Max 3D)
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { PlayerGetGameConfigOutput } from "./dto/player-game-config.dto";

export interface GetGameConfigPlayerInput {
  tenantId: string;
}

export class GetGameConfigPlayerUseCase extends ApiGatewayUseCase<
  GetGameConfigPlayerInput,
  PlayerGetGameConfigOutput
> {
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();
  private readonly getTenantConfig = new GetTenantConfigInternalUseCase();

  protected async execute(input: GetGameConfigPlayerInput): Promise<PlayerGetGameConfigOutput> {
    const [globalConfig, tenantConfig] = await Promise.all([
      this.getGlobalConfig.run(),
      this.getTenantConfig.run({ tenantId: input.tenantId }),
    ]);

    return {
      game: {
        unitPrice: globalConfig.play.unitPrice,
        maxBoardsPerTicket: globalConfig.play.maxBoardsPerTicket,
        maxDrawCount: globalConfig.play.maxDrawCount,
        drawsPerDay: globalConfig.play.drawsPerDay,
        drawTimes: [...globalConfig.play.drawTimes],
        drawDaysOfWeek: [...globalConfig.play.drawDaysOfWeek],
      },
      prizes: {
        basic: {
          special: globalConfig.defaultPrizes.basic.special,
          first: globalConfig.defaultPrizes.basic.first,
          second: globalConfig.defaultPrizes.basic.second,
          third: globalConfig.defaultPrizes.basic.third,
        },
        combo: {
          combo3: {
            special: globalConfig.defaultPrizes.combo.combo3.special,
            first: globalConfig.defaultPrizes.combo.combo3.first,
            second: globalConfig.defaultPrizes.combo.combo3.second,
            third: globalConfig.defaultPrizes.combo.combo3.third,
          },
          combo6: {
            special: globalConfig.defaultPrizes.combo.combo6.special,
            first: globalConfig.defaultPrizes.combo.combo6.first,
            second: globalConfig.defaultPrizes.combo.combo6.second,
            third: globalConfig.defaultPrizes.combo.combo6.third,
          },
        },
        plus: {
          special: globalConfig.defaultPrizes.plus.special,
          first: globalConfig.defaultPrizes.plus.first,
          second: globalConfig.defaultPrizes.plus.second,
          third: globalConfig.defaultPrizes.plus.third,
          fourth: globalConfig.defaultPrizes.plus.fourth,
          fifth: globalConfig.defaultPrizes.plus.fifth,
          sixth: globalConfig.defaultPrizes.plus.sixth,
        },
      },
      tenant: {
        isEnabled: tenantConfig?.isEnabled ?? true,
      },
    };
  }
}
