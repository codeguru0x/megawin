/**
 * Use Case: Get Game Config for Player (Mega 6/45)
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
        drawsPerWeek: globalConfig.play.drawsPerWeek,
        drawDaysOfWeek: [...globalConfig.play.drawDaysOfWeek],
        drawTime: globalConfig.play.drawTime,
      },
      prizes: {
        tier1: globalConfig.defaultPrizes.tier1,
        tier2: globalConfig.defaultPrizes.tier2,
        tier3: globalConfig.defaultPrizes.tier3,
      },
      jackpot: {
        seedAmount: globalConfig.jackpot.seedAmount,
        splitThreshold: globalConfig.jackpot.splitThreshold,
      },
      tenant: {
        isEnabled: tenantConfig?.isEnabled ?? true,
      },
    };
  }
}
