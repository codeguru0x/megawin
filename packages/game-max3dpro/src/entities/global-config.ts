/**
 * Max 3D Pro – Global Game Configuration
 *
 * Collection: max3d_pro_game_configs (scope = "global")
 *
 * Max 3D Pro không có Jackpot tích lũy (tất cả giải thưởng đều cố định).
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

import type { FinancialRates, Max3dproPrizeConfig, OpsConfig, PlayRules } from "./types";

export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  rates: FinancialRates;
  defaultPrizes: Max3dproPrizeConfig;
  play: PlayRules;

  /**
   * Cấu hình vận hành & kiểm soát rủi ro — ngưỡng alert + nhịp/top-K stats.
   * Staff sửa trên tab "Vận hành". KHÔNG expose cho player.
   */
  ops: OpsConfig;

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
