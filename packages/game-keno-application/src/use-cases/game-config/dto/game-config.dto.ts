import type {
  FinancialRates,
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  PayoutCaps,
  PlayRules,
} from "@megawin/game-keno/entities";
import type { GlobalConfigEntity } from "@megawin/game-keno/entities";;

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
  rates?: Partial<FinancialRates>;
  basicPrizes?: BasicPrizes;
  bigSmallPrizes?: Partial<BigSmallPrizes>;
  evenOddPrizes?: Partial<EvenOddPrizes>;
  payoutCaps?: Partial<PayoutCaps>;
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
