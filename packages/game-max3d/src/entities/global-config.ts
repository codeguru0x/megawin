/**
 * Max 3D – Global Game Configuration
 *
 * Collection: max3d_game_configs (scope = "global")
 *
 * Max 3D không có Jackpot tích lũy (tất cả giải thưởng đều cố định).
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { VietlottPeriodAnchor } from "@megawin/game-core/types";

import type { FinancialRates, Max3dPrizeConfig, OpsConfig, PlayRules } from "./types";

/** Re-export type chung — cho phép import từ `@megawin/game-max3d/entities` như các type khác. */
export type { VietlottPeriodAnchor };

export interface GlobalConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Global;
  tenantId: null;

  rates: FinancialRates;
  defaultPrizes: Max3dPrizeConfig;
  play: PlayRules;

  // ───── Vietlott Period Suggestion ─────

  /**
   * Neo suy mã kỳ Vietlott (`drawPeriod`) cho dialog công bố kết quả — gợi ý dựa TRỰC TIẾP vào
   * `play` (lịch quay) + `vietlott` (neo), KHÔNG dùng dữ liệu vận hành (`vietlottRef` kỳ khác)
   * để tránh lan truyền sai số (xem `vietlott-period-suggestion/00-overview.md` §4.4).
   *
   * `undefined` = chưa cấu hình = chưa bật gợi ý (KHÔNG có giá trị mặc định hardcode).
   */
  vietlott?: VietlottPeriodAnchor;

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
