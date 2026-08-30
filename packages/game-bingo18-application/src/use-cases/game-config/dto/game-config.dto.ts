import type { AuditActor } from "@megawin/audit/logger";
import type {
  BigSmallDrawPrizes,
  Bingo18OpsAlertType,
  DoubleMatchPrizes,
  FinancialRates,
  GlobalConfigEntity,
  PlayRules,
  SingleNumPrizes,
  SumTotalPrizes,
  TripleMatchPrizes,
  VietlottPeriodAnchor,
} from "@megawin/game-bingo18/entities";
import type { OpsStatsConfigBase } from "@megawin/game-core/types";

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
    exposureWarnRevenuePct?: number;
    exposureWarnMinAmount?: number;
    sidebetSkewPct?: number;
    bucketConcentrationAmount?: number;
    enabled?: Partial<Record<Bingo18OpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfigBase>;
}

export interface UpdateGameConfigInput {
  /** Tỷ lệ tài chính (defaultCommissionRate). */
  rates?: Partial<FinancialRates>;
  /** Bảng giải cho loại chơi Đơn (match 1/2/3 số). */
  singleNumPrizes?: Partial<SingleNumPrizes>;
  /** Bảng giải cho loại chơi Đúp (≥2 số trùng). */
  doubleMatchPrizes?: Partial<DoubleMatchPrizes>;
  /** Bảng giải cho loại chơi Ba (specific/any triple). */
  tripleMatchPrizes?: Partial<TripleMatchPrizes>;
  /** Bảng giải cho loại chơi Tổng (đoán tổng 3 số). */
  sumTotalPrizes?: Partial<SumTotalPrizes>;
  /** Bảng giải cho loại chơi Tài/Xỉu/Hoà. */
  bigSmallDrawPrizes?: Partial<BigSmallDrawPrizes>;
  /** Cấu hình luật chơi (drawInterval, salesDuration, …). */
  play?: Partial<PlayRules>;
  /**
   * Cấu hình vận hành. Deep-partial: chỉ gửi field cần đổi, merge per sub-section
   * (alerts/stats), `enabled` merge shallow ở use-case.
   */
  ops?: UpdateOpsInput;
  /** Neo suy mã kỳ Vietlott (`vietlottRef.drawPeriod`) — deep-partial, merge với config hiện có. */
  vietlott?: Partial<VietlottPeriodAnchor>;
  /** Chủ thể thực hiện (staff BO) — dùng cho audit. */
  actor: AuditActor;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Version tự increment mỗi lần update. */
  version: number;
}
