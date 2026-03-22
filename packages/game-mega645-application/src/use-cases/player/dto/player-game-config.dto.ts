/**
 * Mega 6/45 – Player Game Config DTOs
 */

export interface PlayerGameRules {
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). */
  minBetCount: number;
  /** Số lần cược tối đa per board. */
  maxBetCount: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerWeek: number;
  drawDaysOfWeek: number[];
  drawTime: string;
}

export interface PlayerPrizeAmounts {
  /** Giải Nhất: 5/6 số (VND). */
  tier1: number;
  /** Giải Nhì: 4/6 số (VND). */
  tier2: number;
  /** Giải Ba: 3/6 số (VND). */
  tier3: number;
}

export interface PlayerJackpotConfig {
  seedAmount: number;
}

export interface PlayerTenantGameConfig {
  isEnabled: boolean;
}

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizeAmounts;
  jackpot: PlayerJackpotConfig;
  tenant: PlayerTenantGameConfig;
}
