import { GameConfigRepository } from "../../../src/infras/repos/game-config-repo";
import { DEFAULT_POWER655_CONFIG } from "@megawin/game-power655/rules";
import type { GlobalConfigEntity } from "@megawin/game-power655/entities";

/**
 * Insert default global config vào database.
 * Idempotent: dùng upsert nên gọi nhiều lần vẫn an toàn.
 *
 * Dùng trong test setup (beforeAll) hoặc seed script.
 */
export async function insertDefaultGlobalConfig(): Promise<GlobalConfigEntity> {
  const repo = new GameConfigRepository();

  const result = await repo.upsertGlobalConfig({
    jackpot: DEFAULT_POWER655_CONFIG.jackpot,
    rates: DEFAULT_POWER655_CONFIG.rates,
    defaultPrizes: DEFAULT_POWER655_CONFIG.defaultPrizes,
    play: DEFAULT_POWER655_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default global config");
  }

  return result;
}
