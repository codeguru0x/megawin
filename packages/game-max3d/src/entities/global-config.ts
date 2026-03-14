/**
 * Max 3D – Global Game Configuration
 *
 * Collection: max3d_game_configs (scope = "global")
 *
 * Max 3D không có Jackpot tích lũy (tất cả giải thưởng đều cố định).
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { FinancialRates, Max3dPrizeConfig, PlayRules } from "./types";

export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  rates: FinancialRates;
  defaultPrizes: Max3dPrizeConfig;
  play: PlayRules;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
