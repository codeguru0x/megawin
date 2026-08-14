import type { AuditActor } from "@megawin/audit/logger";
import type {
  FinancialRates,
  GlobalConfigEntity,
  Max3dproOpsAlertType,
  Max3dproPrizeConfig,
  OpsStatsConfig,
  PlayRules,
} from "@megawin/game-max3dpro/entities";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

/**
 * Deep-partial input cho section `ops` khi update config. Chỉ gửi field cần đổi; merge
 * per sub-section (alerts/stats), `enabled` merge shallow ở use-case.
 * Interface tường minh — KHÔNG indexed-access `OpsConfig["alerts"]` (rule §5.4, Keno Risk #8).
 */
export interface UpdateOpsInput {
  alerts?: {
    largeBetAmount?: number;
    exposureWarnAmount?: number;
    pairLiabilityWarnAmount?: number;
    comboAccountsWarn?: number;
    enabled?: Partial<Record<Max3dproOpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfig>;
}

export interface UpdateGameConfigInput {
  /** Tỷ lệ tài chính (defaultCommissionRate, …). */
  rates?: Partial<FinancialRates>;
  /** Bảng giải thưởng mặc định (standard). DeepPartial cho phép cập nhật từng phần. */
  defaultPrizes?: DeepPartial<Max3dproPrizeConfig>;
  /** Quy tắc chơi (playModes, playTypes, pricing, …). */
  play?: Partial<PlayRules>;
  /**
   * Cấu hình vận hành. Deep-partial: chỉ gửi field cần đổi, merge per sub-section
   * (alerts/stats), `enabled` merge shallow ở use-case.
   */
  ops?: UpdateOpsInput;
  /** Chủ thể thực hiện — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản config sau khi cập nhật (optimistic locking). */
  version: number;
}
