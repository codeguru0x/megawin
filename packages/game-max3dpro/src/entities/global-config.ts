/**
 * Max 3D Pro – Global Game Configuration
 *
 * Collection: max3d_pro_game_configs (scope = "global")
 *
 * Max 3D Pro không có Jackpot tích lũy (tất cả giải thưởng đều cố định).
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { FinancialRates, Max3dproPrizeConfig, PlayRules } from "./types";

export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  rates: FinancialRates;
  defaultPrizes: Max3dproPrizeConfig;
  play: PlayRules;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}
