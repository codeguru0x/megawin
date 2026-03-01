import { GameConfigRepository } from "../../../src/infras/repos/game-config-repo";
import { DEFAULT_MEGA645_CONFIG } from "@megawin/game-mega645/rules";
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
    jackpot: DEFAULT_MEGA645_CONFIG.jackpot,
    rates: DEFAULT_MEGA645_CONFIG.rates,
    defaultPrizes: DEFAULT_MEGA645_CONFIG.defaultPrizes,
    play: DEFAULT_MEGA645_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default global config for Mega 6/45");
  }

  return result;
}
