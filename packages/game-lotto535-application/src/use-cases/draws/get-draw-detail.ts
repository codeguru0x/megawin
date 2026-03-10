import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_PRIZE_TIER_RULES } from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type { GetDrawDetailInput, GetDrawDetailOutput } from "./dto/draw.dto";

/**
 * Chi tiết 1 kỳ quay -- bao gồm result, jackpot, financial, stats.
 * Dùng cho trang chi tiết kỳ quay trên backoffice.
 *
 * Trả thêm `prizeAmounts` từ game config (fallback về DEFAULT_PRIZE_TIER_RULES)
 * để UI hiển thị cột "Tiền/line" đúng ngay cả khi tier không có winner.
 */
export class GetDrawDetailUseCase extends NextApiUseCase<GetDrawDetailInput, GetDrawDetailOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly configRepo = new GameConfigRepository();

  protected async execute(input: GetDrawDetailInput): Promise<GetDrawDetailOutput> {
    const [draw, config] = await Promise.all([
      this.drawRepo.getDrawById(input.drawId),
      this.configRepo.getGlobalConfig(),
    ]);

    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    // Build prizeAmounts: tier → unit amount per winning line
    // Ưu tiên config.defaultPrizes, fallback về DEFAULT_PRIZE_TIER_RULES
    const prizeAmounts: Record<string, number> = {};
    for (const rule of DEFAULT_PRIZE_TIER_RULES) {
      const configAmount = config?.defaultPrizes?.[rule.tier as keyof typeof config.defaultPrizes];
      prizeAmounts[rule.tier] = configAmount ?? rule.defaultAmount;
    }

    return { draw, prizeAmounts };
  }
}
