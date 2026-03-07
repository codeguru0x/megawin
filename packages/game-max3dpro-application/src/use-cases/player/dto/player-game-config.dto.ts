/**
 * Max 3D Pro – Player Game Config DTOs
 */

export interface PlayerGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  drawDaysOfWeek: number[];
  multiNumberMin: number;
  multiNumberMax: number;
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
