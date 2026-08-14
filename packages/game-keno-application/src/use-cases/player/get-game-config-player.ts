/**
 * Use Case: Get Game Config for Player (Keno)
 *
 * Trả cấu hình game Keno cho frontend player:
 * - Luật chơi (mệnh giá, số panel, số kỳ tối đa...)
 * - Bảng giải thưởng (cơ bản, Lớn/Nhỏ, Chẵn/Lẻ)
 * - Giới hạn trả thưởng (payout caps bậc 8/9/10)
 * - Trạng thái tenant (có được phép chơi không)
 *
 * Không expose thông tin tài chính nội bộ (commissionRate, companyRate...).
 *
 * LƯU Ý: DTO player build allowlist tường minh (KHÔNG spread `globalConfig`). Section
 * `ops` (ngưỡng alert, top-K, nhịp worker — §3.9) KHÔNG được thêm vào đây: thông tin
 * vận hành nội bộ, tuyệt đối không lộ cho player.
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";
import type { BasicPrizes } from "@megawin/game-keno/entities";

import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { GetTenantConfigInternalUseCase } from "../tenant-config/get-tenant-config-internal";
import type { PlayerBasicPrizes, PlayerGetGameConfigOutput } from "./dto/player-game-config.dto";

export interface GetGameConfigPlayerInput {
  tenantId: string;
}

export class GetGameConfigPlayerUseCase extends UseCase<GetGameConfigPlayerInput, PlayerGetGameConfigOutput> {
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();
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
        maxBasicBoardsPerTicket: globalConfig.play.maxBasicBoardsPerTicket,
        maxDrawCount: globalConfig.play.maxDrawCount,
        drawIntervalMinutes: globalConfig.play.drawIntervalMinutes,
        firstDrawTime: globalConfig.play.firstDrawTime,
        lastDrawTime: globalConfig.play.lastDrawTime,
      },
      prizes: {
        basic: mapBasicPrizes(globalConfig.basicPrizes),
        bigSmall: {
          big13Plus: globalConfig.bigSmallPrizes.big13Plus,
          big1112: globalConfig.bigSmallPrizes.big1112,
          draw: globalConfig.bigSmallPrizes.draw,
          small1112: globalConfig.bigSmallPrizes.small1112,
          small13Plus: globalConfig.bigSmallPrizes.small13Plus,
        },
        evenOdd: {
          even15Plus: globalConfig.evenOddPrizes.even15Plus,
          even1314: globalConfig.evenOddPrizes.even1314,
          even1112: globalConfig.evenOddPrizes.even1112,
          draw: globalConfig.evenOddPrizes.draw,
          odd1112: globalConfig.evenOddPrizes.odd1112,
          odd1314: globalConfig.evenOddPrizes.odd1314,
          odd15Plus: globalConfig.evenOddPrizes.odd15Plus,
        },
      },
      payoutCaps: {
        pick8MaxPerDraw: globalConfig.payoutCaps.pick8MaxPerDraw,
        pick8MaxSetsForFixed: globalConfig.payoutCaps.pick8MaxSetsForFixed,
        pick9MaxPerDraw: globalConfig.payoutCaps.pick9MaxPerDraw,
        pick9MaxSetsForFixed: globalConfig.payoutCaps.pick9MaxSetsForFixed,
        pick10MaxPerDraw: globalConfig.payoutCaps.pick10MaxPerDraw,
        pick10MaxSetsForFixed: globalConfig.payoutCaps.pick10MaxSetsForFixed,
      },
      tenant: {
        isEnabled: tenantConfig?.isEnabled ?? true,
      },
    };
  }
}

/**
 * Chuyển BasicPrizes (key string "pick1"-"pick10") sang Record<number, Record<number, number>>.
 * API trả về numeric keys cho frontend dễ lookup: prizes.basic[5][3].
 */
function mapBasicPrizes(prizes: BasicPrizes): PlayerBasicPrizes {
  const result: PlayerBasicPrizes = {};
  for (const [pickKey, matchMap] of Object.entries(prizes)) {
    const pickCount = parseInt(pickKey.replace("pick", ""), 10);
    if (isNaN(pickCount)) continue;
    result[pickCount] = {};
    for (const [matchStr, amount] of Object.entries(matchMap)) {
      result[pickCount][Number(matchStr)] = amount;
    }
  }
  return result;
}
