/**
 * Max 3D Pro – Player Game Config DTOs
 */

export interface PlayerGameRules {
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). */
  minBetCount: number;
  /** Số lần cược tối đa per board. */
  maxBetCount: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  drawDaysOfWeek: number[];
}

export interface PlayerPrizeAmounts {
  special: number;
  specialSub: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface PlayerTenantGameConfig {
  isEnabled: boolean;
}

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizeAmounts;
  tenant: PlayerTenantGameConfig;
}
