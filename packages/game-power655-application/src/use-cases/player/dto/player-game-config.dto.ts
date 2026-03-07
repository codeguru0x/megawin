/**
 * Power 6/55 – Player Game Config DTOs
 */

export interface PlayerGameRules {
  unitPrice: number;
  maxBoardsPerTicket: number;
  maxDrawCount: number;
  drawsPerDay: number;
  drawTimes: string[];
  drawDaysOfWeek: number[];
}

export interface PlayerPrizeAmounts {
  /** Giải Nhất: 5/6 số (không trùng bonus) (VND). */
  tier1: number;
  /** Giải Nhì: 4/6 số (VND). */
  tier2: number;
  /** Giải Ba: 3/6 số (VND). */
  tier3: number;
}

export interface PlayerJackpotConfig {
  /** Số tiền khởi điểm Jackpot 1 (trùng 6/6) khi mở vòng mới (VND). */
  jackpot1SeedAmount: number;
  /** Số tiền khởi điểm Jackpot 2 (trùng 5/6 + bonus) khi mở vòng mới (VND). */
  jackpot2SeedAmount: number;
  /** Ngưỡng kích hoạt chia giải (JP1 + JP2 >= threshold) (VND). */
  splitThreshold: number;
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
