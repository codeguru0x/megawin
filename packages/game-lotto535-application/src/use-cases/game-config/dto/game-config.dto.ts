import type { AuditActor } from "@megawin/audit/logger";
import type {
  FinancialRates,
  GlobalConfigEntity,
  JackpotConfig,
  Lotto535OpsAlertType,
  OpsStatsConfig,
  PlayRules,
  PrizeAmounts,
} from "@megawin/game-lotto535/entities";

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
    coverHighStakeAmount?: number;
    specialSkewRatio?: number;
    specialSkewMinAmount?: number;
    enabled?: Partial<Record<Lotto535OpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfig>;
}

export interface UpdateGameConfigInput {
  /** Cấu hình Jackpot (seedAmount, splitThreshold, splitRatios). Partial update. */
  jackpot?: Partial<JackpotConfig>;
  /** Tỷ lệ tài chính (companyRate, defaultCommissionRate). Partial update. */
  rates?: Partial<FinancialRates>;
  /** Giải thưởng mặc định theo tier (VND). Partial update. */
  defaultPrizes?: Partial<PrizeAmounts>;
  /** Quy tắc chơi (unitPrice, maxBoardsPerTicket, maxDrawCount, ...). Partial update. */
  play?: Partial<PlayRules>;
  /**
   * Cấu hình vận hành (analysis §3.8). Deep-partial: chỉ gửi field cần đổi, merge
   * per sub-section (alerts/stats), `enabled` merge shallow ở use-case.
   */
  ops?: UpdateOpsInput;
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật (full entity). */
  config: GlobalConfigEntity;
  /** Phiên bản mới sau khi cập nhật (optimistic locking). */
  version: number;
}
