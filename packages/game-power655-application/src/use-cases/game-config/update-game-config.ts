import type { Power655OpsConfig } from "@megawin/game-power655/entities";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";

import { globalConfigCache } from "../../caches/global-config.cache";
import { GameConfigRepository } from "../../infras/repos/game-config-repo";
import { auditUpdateGameConfig } from "../../services/audit-log";
import type { UpdateGameConfigInput, UpdateGameConfigOutput, UpdateOpsInput } from "./dto/game-config.dto";

/**
 * Cập nhật cấu hình game Power 6/55 toàn cục (upsert).
 *
 * Staff MegaWin gọi use case này từ backoffice UI để chỉnh sửa:
 * - Jackpot settings (JP1/JP2 seed, contribution ratios, overflow threshold)
 * - Financial rates (commission, company rate)
 * - Prize amounts (tier1-3)
 * - Play rules (unit price, draw times, draw days, etc.)
 * - Vận hành & kiểm soát rủi ro (ngưỡng alert + nhịp/top-K stats — analysis §3.8)
 *
 * Partial update: chỉ field nào gửi lên mới update.
 * Version tự động increment.
 */
export class UpdateGameConfigUseCase extends NextApiUseCase<UpdateGameConfigInput, UpdateGameConfigOutput> {
  private readonly repo = new GameConfigRepository();

  /** @inheritdoc */
  protected async execute(input: UpdateGameConfigInput): Promise<UpdateGameConfigOutput> {
    const existing = await this.repo.getGlobalConfig();

    const merged = {
      jackpot: input.jackpot
        ? {
            ...(existing?.jackpot ?? DEFAULT_POWER655_CONFIG.jackpot),
            ...input.jackpot,
          }
        : undefined,
      rates: input.rates
        ? {
            ...(existing?.rates ?? DEFAULT_POWER655_CONFIG.rates),
            ...input.rates,
          }
        : undefined,
      defaultPrizes: input.defaultPrizes
        ? {
            ...(existing?.defaultPrizes ?? DEFAULT_POWER655_CONFIG.defaultPrizes),
            ...input.defaultPrizes,
          }
        : undefined,
      play: input.play ? { ...(existing?.play ?? DEFAULT_POWER655_CONFIG.play), ...input.play } : undefined,
      ops: input.ops ? this.mergeOps(existing?.ops, input.ops) : undefined,
    };

    const cleanMerged: Record<string, unknown> = {};
    if (merged.jackpot) cleanMerged.jackpot = merged.jackpot;
    if (merged.rates) cleanMerged.rates = merged.rates;
    if (merged.defaultPrizes) cleanMerged.defaultPrizes = merged.defaultPrizes;
    if (merged.play) cleanMerged.play = merged.play;
    if (merged.ops) cleanMerged.ops = merged.ops;

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

  /**
   * Merge section `ops` per sub-section (alerts/stats) — chỉ set field gửi lên, giữ
   * phần còn lại từ existing (fallback default). `enabled` merge shallow để đổi 1
   * khoá alert type mà không phải gửi cả object.
   */
  private mergeOps(existing: Power655OpsConfig | undefined, input: UpdateOpsInput): Power655OpsConfig {
    const base = existing ?? DEFAULT_POWER655_CONFIG.ops;

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
