/**
 * Bingo 18 – Player Game Config DTOs
 */

export interface PlayerGameRules {
  unitPrice: number;
  maxBasicBoardsPerTicket: number;
  maxDrawCount: number;
  drawIntervalMinutes: number;
  firstDrawTime: string;
  lastDrawTime: string;
}

export interface PlayerSingleNumPrizes {
  match1: number;
  match2: number;
  match3: number;
}

export interface PlayerDoubleMatchPrizes {
  win: number;
}

export interface PlayerTripleMatchPrizes {
  specific: number;
  any: number;
}

/** Key: tổng (3-18) → tiền thưởng (VND). */
export type PlayerSumTotalPrizes = Record<number, number>;

export interface PlayerBigSmallDrawPrizes {
  big: number;
  draw: number;
  small: number;
}

export interface PlayerPrizes {
  singleNum: PlayerSingleNumPrizes;
  doubleMatch: PlayerDoubleMatchPrizes;
  tripleMatch: PlayerTripleMatchPrizes;
  sumTotal: PlayerSumTotalPrizes;
  bigSmallDraw: PlayerBigSmallDrawPrizes;
}

export interface PlayerTenantGameConfig {
  isEnabled: boolean;
}

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizes;
  tenant: PlayerTenantGameConfig;
}
