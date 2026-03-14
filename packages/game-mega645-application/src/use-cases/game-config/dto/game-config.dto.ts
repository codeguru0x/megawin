import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "@megawin/game-mega645/entities";
import type { GlobalConfigEntity } from "@megawin/game-mega645/entities";;

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  /** Cấu hình toàn cục game Mega 6/45 (bao gồm jackpot, rates, prizes, play rules). */
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

export interface UpdateGameConfigInput {
  /**
   * Cấu hình jackpot (tuỳ chọn cập nhật một phần).
   * Mega 6/45 theo luật Vietlott: chỉ có seedAmount (không có splitThreshold/splitRatios).
   */
  jackpot?: Partial<JackpotConfig>;
  /**
   * Tỷ lệ tài chính (tuỳ chọn cập nhật một phần).
   * Bao gồm: companyRate, defaultCommissionRate.
   */
  rates?: Partial<FinancialRates>;
  /**
   * Giải thưởng cố định mặc định (tuỳ chọn cập nhật một phần).
   * Mega 6/45 có 4 hạng: tier1 (Jackpot), tier2 (5/6), tier3 (4/6), tier4 (3/6).
   */
  defaultPrizes?: Partial<PrizeAmounts>;
  /**
   * Luật chơi (tuỳ chọn cập nhật một phần).
   * Bao gồm: minNumbers, maxNumbers, numberRange, allowedPlayTypes.
   */
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình toàn cục sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản config mới (tăng dần sau mỗi lần cập nhật, dùng cho optimistic locking). */
  version: number;
}
