import type { Lotto535GlobalConfigDoc } from "@megawin/game-lotto535/entities";
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
  jackpot?: Partial<Lotto535GlobalConfigDoc["jackpot"]>;
  rates?: Partial<Lotto535GlobalConfigDoc["rates"]>;
  defaultPrizes?: Partial<Lotto535GlobalConfigDoc["defaultPrizes"]>;
  play?: Partial<Lotto535GlobalConfigDoc["play"]>;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
