import { GameConfigRepository } from "../../../src/infras/repos/game-config-repo";
import { DEFAULT_KENO_CONFIG } from "@megawin/game-keno/rules";
import type { GlobalConfigEntity } from "../../../src/infras/mappers/game-config-mapper";

/**
 * Insert default Keno global config vào database.
 * Idempotent: dùng upsert nên gọi nhiều lần vẫn an toàn.
 *
 * Dùng trong test setup (beforeAll) hoặc seed script.
 */
export async function insertDefaultGlobalConfig(): Promise<GlobalConfigEntity> {
  const repo = new GameConfigRepository();

  const result = await repo.upsertGlobalConfig({
    rates: DEFAULT_KENO_CONFIG.rates,
    basicPrizes: DEFAULT_KENO_CONFIG.basicPrizes,
    bigSmallPrizes: DEFAULT_KENO_CONFIG.bigSmallPrizes,
    evenOddPrizes: DEFAULT_KENO_CONFIG.evenOddPrizes,
    payoutCaps: DEFAULT_KENO_CONFIG.payoutCaps,
    play: DEFAULT_KENO_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default Keno global config");
  }

  return result;
}
