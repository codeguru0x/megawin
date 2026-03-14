/**
 * Bingo 18 – Global Game Configuration
 *
 * Collection: bingo18_game_configs (scope = "global")
 *
 * 1 document duy nhất, chứa tất cả default config cho game.
 * Staff MegaWin quản lý trên backoffice UI.
 *
 * Bingo 18:
 * - Không có Jackpot tích luỹ (giải thưởng cố định theo bảng)
 * - Không có payout caps (giải cao nhất chỉ 1.200.000đ)
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
  PlayRules,
} from "./types";

export interface GlobalConfigDoc {
  _id: unknown;

  /** Luôn = "global". */
  scope: typeof GameConfigScope.Global;

  /** Null – global không thuộc tenant nào. */
  tenantId: null;

  // ───── Financial Rates ─────

  rates: FinancialRates;

  // ───── Prize Configuration ─────

  singleNumPrizes: SingleNumPrizes;
  doubleMatchPrizes: DoubleMatchPrizes;
  tripleMatchPrizes: TripleMatchPrizes;
  sumTotalPrizes: SumTotalPrizes;
  bigSmallDrawPrizes: BigSmallDrawPrizes;

  // ───── Play Rules ─────

  play: PlayRules;

  // ───── Metadata ─────

  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
