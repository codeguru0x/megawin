import { GameConfigRepository } from "../../../src/infras/repos/game-config-repo";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import type { GlobalConfigEntity } from "../../../src/infras/mappers/global-config-mapper";

/**
 * Insert default global config cho Max 3D Pro vào database.
 * Idempotent: dùng upsert nên gọi nhiều lần vẫn an toàn.
 */
export async function insertDefaultGlobalConfig(): Promise<GlobalConfigEntity> {
  const repo = new GameConfigRepository();

  const result = await repo.upsertGlobalConfig({
    rates: DEFAULT_MAX3D_PRO_CONFIG.rates,
    defaultPrizes: DEFAULT_MAX3D_PRO_CONFIG.defaultPrizes,
    play: DEFAULT_MAX3D_PRO_CONFIG.play,
  });

  if (!result) {
    throw new Error("Failed to insert default global config");
  }

  return result;
}
