/**
 * Mega 6/45 – Global Game Configuration
 *
 * Collection: mega645GameConfigs (scope = "global")
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "./types";

export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;
  jackpot: JackpotConfig;
  rates: FinancialRates;
  defaultPrizes: PrizeAmounts;
  play: PlayRules;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
