import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_KENO_CONFIG } from "@megawin/game-keno/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Keno toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Financial rates (commission, company rate)
 * - Basic prize table (pick1-10)
 * - Side bet prizes (big/small, even/odd)
 * - Payout caps (pick8/9/10)
 * - Play rules (unit price, draw interval, etc.)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends NextApiUseCase<
  UpdateGameConfigInput,
  UpdateGameConfigOutput
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(
    input: UpdateGameConfigInput
  ): Promise<UpdateGameConfigOutput> {
    this.validateInput(input);
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      rates: input.rates
        ? { ...(existing?.rates ?? DEFAULT_KENO_CONFIG.rates), ...input.rates }
        : undefined,
      basicPrizes: input.basicPrizes ? input.basicPrizes : undefined,
      bigSmallPrizes: input.bigSmallPrizes
        ? {
            ...(existing?.bigSmallPrizes ?? DEFAULT_KENO_CONFIG.bigSmallPrizes),
            ...input.bigSmallPrizes,
          }
        : undefined,
      evenOddPrizes: input.evenOddPrizes
        ? {
            ...(existing?.evenOddPrizes ?? DEFAULT_KENO_CONFIG.evenOddPrizes),
            ...input.evenOddPrizes,
          }
        : undefined,
      payoutCaps: input.payoutCaps
        ? {
            ...(existing?.payoutCaps ?? DEFAULT_KENO_CONFIG.payoutCaps),
            ...input.payoutCaps,
          }
        : undefined,
      play: input.play
        ? { ...(existing?.play ?? DEFAULT_KENO_CONFIG.play), ...input.play }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.basicPrizes) cleanMerged.basicPrizes = merged.basicPrizes;
    if (merged.bigSmallPrizes)
      cleanMerged.bigSmallPrizes = merged.bigSmallPrizes;
    if (merged.evenOddPrizes) cleanMerged.evenOddPrizes = merged.evenOddPrizes;
    if (merged.payoutCaps) cleanMerged.payoutCaps = merged.payoutCaps;
    if (merged.play) cleanMerged.play = merged.play;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật Keno GameConfig thất bại.");
    }

    return {
      config: updated,
      version: updated.version,
    };
  }

  private validateInput(input: UpdateGameConfigInput): void {
    if (input.rates) {
      const { defaultCommissionRate, companyRate } = input.rates;

      if (
        defaultCommissionRate !== undefined &&
        (defaultCommissionRate < 0 || defaultCommissionRate > 1)
      ) {
        throw AppException.badRequest(
          "defaultCommissionRate phải trong range [0, 1]."
        );
      }

      if (companyRate !== undefined && (companyRate < 0 || companyRate > 1)) {
        throw AppException.badRequest("companyRate phải trong range [0, 1].");
      }
    }

    if (input.basicPrizes) {
      for (const [pickKey, matchPrizes] of Object.entries(input.basicPrizes)) {
        if (!/^pick([1-9]|10)$/.test(pickKey)) {
          throw AppException.badRequest(
            `Key "${pickKey}" không hợp lệ. Phải là pick1-pick10.`
          );
        }
        for (const [matchStr, value] of Object.entries(matchPrizes)) {
          if (typeof value !== "number" || value < 0) {
            throw AppException.badRequest(
              `Giải thưởng ${pickKey}[${matchStr}] phải là số dương.`
            );
          }
        }
      }
    }

    if (input.payoutCaps) {
      const caps = input.payoutCaps;
      for (const key of Object.keys(caps) as Array<keyof typeof caps>) {
        const val = caps[key];
        if (val !== undefined && (typeof val !== "number" || val < 0)) {
          throw AppException.badRequest(`Payout cap ${key} phải là số dương.`);
        }
      }
    }
  }
}
