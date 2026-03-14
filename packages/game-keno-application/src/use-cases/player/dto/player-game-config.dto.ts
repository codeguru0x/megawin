/**
 * Keno – Player Game Config DTOs
 *
 * Dữ liệu cấu hình game trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần để render UI — loại bỏ dữ liệu tài chính nội bộ.
 */

// ─── Play Rules ───

export interface PlayerGameRules {
  /** Mệnh giá 1 lần tham gia (VND). */
  unitPrice: number;
  /** Số panel cơ bản tối đa / vé. */
  maxBasicBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. */
  maxDrawCount: number;
  /** Khoảng cách giữa các kỳ quay (phút). */
  drawIntervalMinutes: number;
  /** Giờ bắt đầu quay trong ngày. VD: "06:00". */
  firstDrawTime: string;
  /** Giờ kết thúc quay trong ngày. VD: "21:52". */
  lastDrawTime: string;
}

// ─── Prize Tables ───

/** Bảng giải thưởng cơ bản: basicPrizes[pickCount][matchCount] = VND. */
export type PlayerBasicPrizes = Record<number, Record<number, number>>;

export interface PlayerBigSmallPrizes {
  /** >= 13 số lớn (41-80) → VND. */
  big13Plus: number;
  /** 11 hoặc 12 số lớn → VND. */
  big1112: number;
  /** Hòa (10-10) → VND. */
  draw: number;
  /** 11 hoặc 12 số nhỏ → VND. */
  small1112: number;
  /** >= 13 số nhỏ (1-40) → VND. */
  small13Plus: number;
}

export interface PlayerEvenOddPrizes {
  /** >= 15 số chẵn → VND. */
  even15Plus: number;
  /** 13 hoặc 14 số chẵn → VND. */
  even1314: number;
  /** 11 hoặc 12 số chẵn → VND. */
  even1112: number;
  /** Hòa (10 chẵn + 10 lẻ) → VND. */
  draw: number;
  /** 11 hoặc 12 số lẻ → VND. */
  odd1112: number;
  /** 13 hoặc 14 số lẻ → VND. */
  odd1314: number;
  /** >= 15 số lẻ → VND. */
  odd15Plus: number;
}

export interface PlayerPrizes {
  basic: PlayerBasicPrizes;
  bigSmall: PlayerBigSmallPrizes;
  evenOdd: PlayerEvenOddPrizes;
}

// ─── Payout Caps ───

export interface PlayerPayoutCaps {
  /** Pick 8: giới hạn tổng trả thưởng / kỳ (VND). */
  pick8MaxPerDraw: number;
  /** Pick 8: số bộ tối đa được trả cố định. */
  pick8MaxSetsForFixed: number;
  /** Pick 9: giới hạn tổng trả thưởng / kỳ (VND). */
  pick9MaxPerDraw: number;
  /** Pick 9: số bộ tối đa được trả cố định. */
  pick9MaxSetsForFixed: number;
  /** Pick 10: giới hạn tổng trả thưởng / kỳ (VND). */
  pick10MaxPerDraw: number;
  /** Pick 10: số bộ tối đa được trả cố định. */
  pick10MaxSetsForFixed: number;
}

// ─── Tenant Config ───

export interface PlayerTenantGameConfig {
  /** Tenant này có được phép chơi game Keno không. */
  isEnabled: boolean;
}

// ─── Output ───

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizes;
  payoutCaps: PlayerPayoutCaps;
  tenant: PlayerTenantGameConfig;
}
