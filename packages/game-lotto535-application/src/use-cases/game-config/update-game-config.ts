import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Jackpot settings (seed, threshold, split ratios, rounding unit)
 * - Financial rates (commission, company rate)
 * - Prize amounts (tier1-5, consolation)
 * - Play rules (unit price, draw times, etc.)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends NextApiUseCase<
  UpdateGameConfigInput,
  UpdateGameConfigOutput
> {
  protected async execute(
    input: UpdateGameConfigInput,
  ): Promise<UpdateGameConfigOutput> {
    this.validateInput(input);

    const repo = new GameConfigRepository();

    const existing = await repo.getGlobalConfig();

    const merged = {
      jackpot: input.jackpot
        ? { ...(existing?.jackpot ?? DEFAULT_LOTTO535_CONFIG.jackpot), ...input.jackpot }
        : undefined,
      rates: input.rates
        ? { ...(existing?.rates ?? DEFAULT_LOTTO535_CONFIG.rates), ...input.rates }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? { ...(existing?.defaultPrizes ?? DEFAULT_LOTTO535_CONFIG.defaultPrizes), ...input.defaultPrizes }
        : undefined,
      play: input.play
        ? { ...(existing?.play ?? DEFAULT_LOTTO535_CONFIG.play), ...input.play }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.jackpot) cleanMerged.jackpot = merged.jackpot;
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.defaultPrizes) cleanMerged.defaultPrizes = merged.defaultPrizes;
    if (merged.play) cleanMerged.play = merged.play;

    const updated = await repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật GameConfig thất bại.");
    }

    return {
      config: updated,
      version: updated.version,
    };
  }

  private validateInput(input: UpdateGameConfigInput): void {
    if (input.rates) {
      const { defaultCommissionRate, minCommissionRate, companyRate } =
        input.rates;

      if (
        defaultCommissionRate !== undefined &&
        (defaultCommissionRate < 0 || defaultCommissionRate > 1)
      ) {
        throw AppException.badRequest(
          "defaultCommissionRate phải trong range [0, 1].",
        );
      }

      if (
        minCommissionRate !== undefined &&
        (minCommissionRate < 0 || minCommissionRate > 1)
      ) {
        throw AppException.badRequest(
          "minCommissionRate phải trong range [0, 1].",
        );
      }

      if (
        companyRate !== undefined &&
        (companyRate < 0 || companyRate > 1)
      ) {
        throw AppException.badRequest(
          "companyRate phải trong range [0, 1].",
        );
      }
    }

    if (input.defaultPrizes) {
      for (const [key, value] of Object.entries(input.defaultPrizes)) {
        if (value !== undefined && (typeof value !== "number" || value < 0)) {
          throw AppException.badRequest(
            `Giải thưởng ${key} phải là số dương.`,
          );
        }
      }
    }

    if (input.jackpot) {
      if (
        input.jackpot.seedAmount !== undefined &&
        input.jackpot.seedAmount < 0
      ) {
        throw AppException.badRequest("seedAmount phải >= 0.");
      }
      if (
        input.jackpot.splitThreshold !== undefined &&
        input.jackpot.splitThreshold < 0
      ) {
        throw AppException.badRequest("splitThreshold phải >= 0.");
      }
    }
  }
}
