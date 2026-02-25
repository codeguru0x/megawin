import { GameConfigRepository } from "../../../src/infras/repos/global-config-repo";
import { DEFAULT_LOTTO535_CONFIG } from "@megawin/game-lotto535/rules";
import type { GlobalConfigEntity } from "../../../src/infras/mappers/global-config-mapper";

/**
 * Insert default global config vào database.
 * Idempotent: dùng upsert nên gọi nhiều lần vẫn an toàn.
 *
 * Dùng trong test setup (beforeAll) hoặc seed script.
 */
export async function insertDefaultGlobalConfig(): Promise<GlobalConfigEntity> {
  const repo = new GameConfigRepository();

  const result = await repo.upsertGlobalConfig({
    jackpot: DEFAULT_LOTTO535_CONFIG.jackpot,
    rates: DEFAULT_LOTTO535_CONFIG.rates,
    defaultPrizes: DEFAULT_LOTTO535_CONFIG.defaultPrizes,
    play: DEFAULT_LOTTO535_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default global config");
  }

  return result;
}
