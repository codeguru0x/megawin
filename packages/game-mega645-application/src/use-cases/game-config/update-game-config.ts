import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import { globalConfigCache } from "../../caches/global-config.cache";
import type { UpdateGameConfigInput, UpdateGameConfigOutput } from "./dto/game-config.dto";

export class UpdateGameConfigUseCase extends NextApiUseCase<
  UpdateGameConfigInput,
  UpdateGameConfigOutput
> {
  private readonly repo = new GameConfigRepository();

  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
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
            ...(existing?.defaultPrizes ?? DEFAULT_MEGA645_CONFIG.defaultPrizes),
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

    // Config đã đổi → xoá cache để process này đọc bản mới ngay.
    await globalConfigCache.invalidate();

    // Audit sau khi upsert thành công. Chỉ ghi giá trị MỚI của các nhóm đã đổi
    // (`changed`) — muốn biết giá trị cũ thì trace ngược record version trước.
    // Fire-and-forget: không chặn response.
    auditUpdateGameConfig({
      actor: input.actor,
      version: updated.version,
      changed: cleanMerged,
    });

    return {
      config: updated,
      version: updated.version,
    };
  }
}
