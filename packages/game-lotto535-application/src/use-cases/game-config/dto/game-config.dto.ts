import type { GlobalConfigDoc } from "@megawin/game-lotto535/entities";
import type { GlobalConfigEntity } from "../../../infras/mappers/game-config-mapper";

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

export interface UpdateGameConfigInput {
  jackpot?: Partial<GlobalConfigDoc["jackpot"]>;
  rates?: Partial<GlobalConfigDoc["rates"]>;
  defaultPrizes?: Partial<GlobalConfigDoc["defaultPrizes"]>;
  play?: Partial<GlobalConfigDoc["play"]>;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
