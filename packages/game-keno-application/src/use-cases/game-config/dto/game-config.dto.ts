import type { AuditActor } from "@megawin/audit/logger";
import type {
  BasicPrizes,
  BigSmallPrizes,
  ComboSetsWarn,
  EvenOddPrizes,
  FinancialRates,
  GlobalConfigEntity,
  KenoOpsAlertType,
  OpsStatsConfig,
  PayoutCaps,
  PlayRules,
} from "@megawin/game-keno/entities";

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

/**
 * Deep-partial input cho section `ops` khi update config. Chỉ gửi field cần đổi; merge
 * per sub-section (alerts/stats), `comboSetsWarn`/`enabled` merge shallow ở use-case.
 */
export interface UpdateOpsInput {
  alerts?: {
    largeBetAmount?: number;
    exposureWarnPct?: number;
    sidebetSkewPct?: number;
    comboSetsWarn?: Partial<ComboSetsWarn>;
    comboAccountsWarn?: number;
    enabled?: Partial<Record<KenoOpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfig>;
}

export interface UpdateGameConfigInput {
  rates?: Partial<FinancialRates>;
  basicPrizes?: BasicPrizes;
  bigSmallPrizes?: Partial<BigSmallPrizes>;
  evenOddPrizes?: Partial<EvenOddPrizes>;
  payoutCaps?: Partial<PayoutCaps>;
  play?: Partial<PlayRules>;
  /**
   * Cấu hình vận hành (§3.9). Deep-partial: chỉ gửi field cần đổi, merge per sub-section
   * (alerts/stats), `comboSetsWarn`/`enabled` merge shallow ở use-case.
   */
  ops?: UpdateOpsInput;
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
