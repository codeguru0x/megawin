import { GameConfigRepository } from "../../../src/infras/repos/game-config-repo";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import type { GlobalConfigEntity } from "@megawin/game-bingo18/entities";

/**
 * Insert default Bingo18 global config vào database.
 * Idempotent: dùng upsert nên gọi nhiều lần vẫn an toàn.
 *
 * Dùng trong test setup (beforeAll) hoặc seed script.
 */
export async function insertDefaultGlobalConfig(): Promise<GlobalConfigEntity> {
  const repo = new GameConfigRepository();

  const result = await repo.upsertGlobalConfig({
    rates: DEFAULT_BINGO18_CONFIG.rates,
    singleNumPrizes: DEFAULT_BINGO18_CONFIG.singleNumPrizes,
    doubleMatchPrizes: DEFAULT_BINGO18_CONFIG.doubleMatchPrizes,
    tripleMatchPrizes: DEFAULT_BINGO18_CONFIG.tripleMatchPrizes,
    sumTotalPrizes: DEFAULT_BINGO18_CONFIG.sumTotalPrizes,
    bigSmallDrawPrizes: DEFAULT_BINGO18_CONFIG.bigSmallDrawPrizes,
    play: DEFAULT_BINGO18_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default Bingo18 global config");
  }

  return result;
}
