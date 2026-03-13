/**
 * Use Case: Get Game Config for Player (Bingo 18)
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
        maxBasicBoardsPerTicket: globalConfig.play.maxBasicBoardsPerTicket,
        maxDrawCount: globalConfig.play.maxDrawCount,
        drawIntervalMinutes: globalConfig.play.drawIntervalMinutes,
        firstDrawTime: globalConfig.play.firstDrawTime,
        lastDrawTime: globalConfig.play.lastDrawTime,
        timezone: globalConfig.play.timezone,
      },
      prizes: {
        singleNum: {
          match1: globalConfig.singleNumPrizes.match1,
          match2: globalConfig.singleNumPrizes.match2,
          match3: globalConfig.singleNumPrizes.match3,
        },
        doubleMatch: {
          win: globalConfig.doubleMatchPrizes.win,
        },
        tripleMatch: {
          specific: globalConfig.tripleMatchPrizes.specific,
          any: globalConfig.tripleMatchPrizes.any,
        },
        sumTotal: { ...globalConfig.sumTotalPrizes },
        bigSmallDraw: {
          big: globalConfig.bigSmallDrawPrizes.big,
          draw: globalConfig.bigSmallDrawPrizes.draw,
          small: globalConfig.bigSmallDrawPrizes.small,
        },
      },
      tenant: {
        isEnabled: tenantConfig.isEnabled,
      },
    };
  }
}
