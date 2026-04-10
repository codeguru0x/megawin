/**
 * Use Case: Get Game Config for Player (Max 3D Pro)
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
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

    if (!globalConfig || !tenantConfig) {
      throw AppException.notFound("Không tìm thấy cấu hình game.");
    }

    return {
      game: {
        unitPrice: globalConfig.play.unitPrice,
        minBetCount: globalConfig.play.minBetCount,
        maxBetCount: globalConfig.play.maxBetCount,
        maxBoardsPerTicket: globalConfig.play.maxBoardsPerTicket,
        maxDrawCount: globalConfig.play.maxDrawCount,
        drawsPerDay: globalConfig.play.drawsPerDay,
        drawTimes: globalConfig.play.drawTimes,
        drawDaysOfWeek: globalConfig.play.drawDaysOfWeek,
      },
      prizes: {
        special: globalConfig.defaultPrizes.standard.special,
        specialSub: globalConfig.defaultPrizes.standard.specialSub,
        first: globalConfig.defaultPrizes.standard.first,
        second: globalConfig.defaultPrizes.standard.second,
        third: globalConfig.defaultPrizes.standard.third,
        fourth: globalConfig.defaultPrizes.standard.fourth,
        fifth: globalConfig.defaultPrizes.standard.fifth,
        sixth: globalConfig.defaultPrizes.standard.sixth,
      },
      tenant: {
        isEnabled: tenantConfig.isEnabled,
      },
    };
  }
}
