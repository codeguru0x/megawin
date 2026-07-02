import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type {
  UpdateGameConfigInput,
  UpdateGameConfigOutput,
} from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Bingo 18 toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Financial rates (commission, company rate)
 * - Single number prizes (match1/2/3)
 * - Double match prizes
 * - Triple match prizes (specific/any)
 * - Sum total prizes (3-18)
 * - Big/Small/Draw prizes
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
        ? { ...(existing?.rates ?? DEFAULT_BINGO18_CONFIG.rates), ...input.rates }
        : undefined,
      singleNumPrizes: input.singleNumPrizes
        ? {
            ...(existing?.singleNumPrizes ?? DEFAULT_BINGO18_CONFIG.singleNumPrizes),
            ...input.singleNumPrizes,
          }
        : undefined,
      doubleMatchPrizes: input.doubleMatchPrizes
        ? {
            ...(existing?.doubleMatchPrizes ?? DEFAULT_BINGO18_CONFIG.doubleMatchPrizes),
            ...input.doubleMatchPrizes,
          }
        : undefined,
      tripleMatchPrizes: input.tripleMatchPrizes
        ? {
            ...(existing?.tripleMatchPrizes ?? DEFAULT_BINGO18_CONFIG.tripleMatchPrizes),
            ...input.tripleMatchPrizes,
          }
        : undefined,
      sumTotalPrizes: input.sumTotalPrizes
        ? {
            ...(existing?.sumTotalPrizes ?? DEFAULT_BINGO18_CONFIG.sumTotalPrizes),
            ...input.sumTotalPrizes,
          }
        : undefined,
      bigSmallDrawPrizes: input.bigSmallDrawPrizes
        ? {
            ...(existing?.bigSmallDrawPrizes ?? DEFAULT_BINGO18_CONFIG.bigSmallDrawPrizes),
            ...input.bigSmallDrawPrizes,
          }
        : undefined,
      play: input.play
        ? { ...(existing?.play ?? DEFAULT_BINGO18_CONFIG.play), ...input.play }
        : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.singleNumPrizes) cleanMerged.singleNumPrizes = merged.singleNumPrizes;
    if (merged.doubleMatchPrizes) cleanMerged.doubleMatchPrizes = merged.doubleMatchPrizes;
    if (merged.tripleMatchPrizes) cleanMerged.tripleMatchPrizes = merged.tripleMatchPrizes;
    if (merged.sumTotalPrizes) cleanMerged.sumTotalPrizes = merged.sumTotalPrizes;
    if (merged.bigSmallDrawPrizes) cleanMerged.bigSmallDrawPrizes = merged.bigSmallDrawPrizes;
    if (merged.play) cleanMerged.play = merged.play;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật Bingo18 GameConfig thất bại.");
    }

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

  private validateInput(input: UpdateGameConfigInput): void {
    if (input.rates) {
      const { defaultCommissionRate } = input.rates;

      if (
        defaultCommissionRate !== undefined &&
        (defaultCommissionRate < 0 || defaultCommissionRate > 1)
      ) {
        throw AppException.badRequest(
          "defaultCommissionRate phải trong range [0, 1]."
        );
      }
    }

    if (input.singleNumPrizes) {
      for (const [key, value] of Object.entries(input.singleNumPrizes)) {
        if (typeof value !== "number" || value < 0) {
          throw AppException.badRequest(
            `Giải thưởng singleNumPrizes.${key} phải là số dương.`
          );
        }
      }
    }

    if (input.sumTotalPrizes) {
      for (const [sumStr, value] of Object.entries(input.sumTotalPrizes)) {
        if (typeof value !== "number" || value < 0) {
          throw AppException.badRequest(
            `Giải thưởng sumTotalPrizes[${sumStr}] phải là số dương.`
          );
        }
      }
    }
  }
}
