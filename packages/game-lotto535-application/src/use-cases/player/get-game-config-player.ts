/**
 * Use Case: Get Game Config for Player (Lotto 5/35)
 *
 * Trả cấu hình game Lotto 5/35 cho frontend player:
 * - Luật chơi (mệnh giá, số board, số kỳ tối đa, giờ quay...)
 * - Bảng giải thưởng cố định (tier1 → consolation)
 * - Thông tin Jackpot (seed, ngưỡng chia)
 * - Trạng thái tenant (có được phép chơi không)
 *
 * Không expose thông tin tài chính nội bộ (commissionRate, companyRate, splitRatios...).
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";

import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { PlayerGetGameConfigOutput } from "./dto/player-game-config.dto";

export interface GetGameConfigPlayerInput {
  tenantId: string;
}

export class GetGameConfigPlayerUseCase extends ApiGatewayUseCase<GetGameConfigPlayerInput, PlayerGetGameConfigOutput> {
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
      },
      prizes: {
        tier1: globalConfig.defaultPrizes.tier1,
        tier2: globalConfig.defaultPrizes.tier2,
        tier3: globalConfig.defaultPrizes.tier3,
        tier4: globalConfig.defaultPrizes.tier4,
        tier5: globalConfig.defaultPrizes.tier5,
        consolation: globalConfig.defaultPrizes.consolation,
      },
      jackpot: {
        seedAmount: globalConfig.jackpot.seedAmount,
        splitThreshold: globalConfig.jackpot.splitThreshold,
      },
      tenant: {
        isEnabled: tenantConfig.isEnabled,
      },
    };
  }
}
