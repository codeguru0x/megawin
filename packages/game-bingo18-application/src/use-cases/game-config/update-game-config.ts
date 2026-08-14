import { UseCase } from "@megawin/app-core/use-cases";
import type { OpsConfig } from "@megawin/game-bingo18/entities";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { AppException } from "@megawin/shared/errors";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

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
export class UpdateGameConfigUseCase extends UseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      rates: input.rates ? { ...(existing?.rates ?? DEFAULT_BINGO18_CONFIG.rates), ...input.rates } : undefined,
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
      play: input.play ? { ...(existing?.play ?? DEFAULT_BINGO18_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.singleNumPrizes) cleanMerged.singleNumPrizes = merged.singleNumPrizes;
    if (merged.doubleMatchPrizes) cleanMerged.doubleMatchPrizes = merged.doubleMatchPrizes;
    if (merged.tripleMatchPrizes) cleanMerged.tripleMatchPrizes = merged.tripleMatchPrizes;
    if (merged.sumTotalPrizes) cleanMerged.sumTotalPrizes = merged.sumTotalPrizes;
    if (merged.bigSmallDrawPrizes) cleanMerged.bigSmallDrawPrizes = merged.bigSmallDrawPrizes;
    if (merged.play) cleanMerged.play = merged.play;
    if (merged.ops) cleanMerged.ops = merged.ops;

    const updated = await this.repo.upsertGlobalConfig(cleanMerged as any);

    if (!updated) {
      throw AppException.internal("Cập nhật Bingo18 GameConfig thất bại.");
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

  /**
   * Merge section `ops` per sub-section (alerts/stats) — chỉ set field gửi lên, giữ
   * phần còn lại từ existing (fallback default). `enabled` merge shallow để đổi 1 khoá
   * mà không phải gửi cả object.
   */
  private mergeOps(existing: OpsConfig | undefined, input: UpdateOpsInput): OpsConfig {
    const base = existing ?? DEFAULT_BINGO18_CONFIG.ops;

    const alerts = input.alerts
      ? {
          ...base.alerts,
          ...input.alerts,
          enabled: {
            ...base.alerts.enabled,
            ...input.alerts.enabled,
          },
        }
      : base.alerts;

    const stats = input.stats ? { ...base.stats, ...input.stats } : base.stats;

    return { alerts, stats };
  }
}
