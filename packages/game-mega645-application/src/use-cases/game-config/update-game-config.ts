import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

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
      jackpot: input.jackpot
        ? {
            ...(existing?.jackpot ?? DEFAULT_MEGA645_CONFIG.jackpot),
            ...input.jackpot,
          }
        : undefined,
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_MEGA645_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ??
              DEFAULT_MEGA645_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play
        ? { ...(existing?.play ?? DEFAULT_MEGA645_CONFIG.play), ...input.play }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.jackpot) cleanMerged.jackpot = merged.jackpot;
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.defaultPrizes) cleanMerged.defaultPrizes = merged.defaultPrizes;
    if (merged.play) cleanMerged.play = merged.play;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

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

    if (input.defaultPrizes) {
      for (const [key, value] of Object.entries(input.defaultPrizes)) {
        if (value !== undefined && (typeof value !== "number" || value < 0)) {
          throw AppException.badRequest(`Giải thưởng ${key} phải là số dương.`);
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
