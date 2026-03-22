/**
 * Max 3D – Player Game Config DTOs
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

export interface PlayerBasicPrizeAmounts {
  /** Giải Đặc Biệt (straight). */
  special: number;
  /** Giải Nhất (straight). */
  first: number;
  /** Giải Nhì (straight). */
  second: number;
  /** Giải Ba (straight). */
  third: number;
}

export interface PlayerComboPrizeAmounts {
  combo3: PlayerBasicPrizeAmounts;
  combo6: PlayerBasicPrizeAmounts;
}

export interface PlayerPlusPrizeAmounts {
  special: number;
  first: number;
  second: number;
  third: number;
  fourth: number;
  fifth: number;
  sixth: number;
}

export interface PlayerPrizes {
  basic: PlayerBasicPrizeAmounts;
  combo: PlayerComboPrizeAmounts;
  plus: PlayerPlusPrizeAmounts;
}

export interface PlayerTenantGameConfig {
  isEnabled: boolean;
}

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizes;
  tenant: PlayerTenantGameConfig;
}
