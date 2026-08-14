import type { AuditActor } from "@megawin/audit/logger";
import type {
  FinancialRates,
  GlobalConfigEntity,
  JackpotConfig,
  Mega645OpsAlertType,
  OpsStatsConfig,
  PlayRules,
  PrizeAmounts,
} from "@megawin/game-mega645/entities";

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

/**
 * Input cập nhật section `ops` — deep-partial: chỉ gửi field cần đổi, merge
 * per sub-section (`alerts`/`stats`) ở use-case; `enabled` merge shallow để đổi
 * 1 khoá alert type mà không phải gửi cả object (analysis §3.8, p0-03).
 */
export interface UpdateOpsInput {
  alerts?: {
    largeBetAmount?: number;
    fixedExposureWarnAmount?: number;
    comboAccountsWarn?: number;
    baoHighStakeAmount?: number;
    enabled?: Partial<Record<Mega645OpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfig>;
}

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
  /**
   * Cấu hình vận hành (analysis §3.8). Deep-partial: chỉ gửi field cần đổi, merge
   * per sub-section (alerts/stats), `enabled` merge shallow ở use-case.
   */
  ops?: UpdateOpsInput;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình toàn cục sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản config mới (tăng dần sau mỗi lần cập nhật, dùng cho optimistic locking). */
  version: number;
}
