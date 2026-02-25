import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "@megawin/game-lotto535/entities";
import type { GlobalConfigEntity } from "../../../infras/mappers/global-config-mapper";

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
  jackpot?: Partial<JackpotConfig>;
  rates?: Partial<FinancialRates>;
  defaultPrizes?: Partial<PrizeAmounts>;
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
