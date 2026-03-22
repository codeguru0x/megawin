/**
 * Use Case: Get Game Config for Player (Power 6/55)
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
        tier1: globalConfig.defaultPrizes.tier1,
        tier2: globalConfig.defaultPrizes.tier2,
        tier3: globalConfig.defaultPrizes.tier3,
      },
      jackpot: {
        jackpot1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jackpot2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        jp1OverflowThreshold: globalConfig.jackpot.jp1OverflowThreshold,
      },
      tenant: {
        isEnabled: tenantConfig.isEnabled,
      },
    };
  }
}
