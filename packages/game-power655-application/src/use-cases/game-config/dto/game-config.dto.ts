import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
  OpsStatsConfig,
  Power655OpsAlertType,
} from "@megawin/game-power655/entities";
import type { GlobalConfigEntity } from "@megawin/game-power655/entities";
import type { AuditActor } from "@megawin/audit/logger";

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  /** Toàn bộ cấu hình global của game Power 6/55. */
  config: GlobalConfigEntity;
}

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
    enabled?: Partial<Record<Power655OpsAlertType, boolean>>;
  };
  stats?: Partial<OpsStatsConfig>;
}

export interface UpdateGameConfigInput {
  /**
   * Cấu hình Jackpot: dual JP (JP1/JP2 seed, contribution ratios, overflow threshold).
   * - jackpot1.seedAmount: giá trị khởi tạo JP1 khi bắt đầu cycle mới
   * - jackpot2.seedAmount: giá trị khởi tạo JP2 khi bắt đầu cycle mới
   * - jp1ContributionRatio: tỷ lệ doanh thu đóng góp vào JP1
   * - jp2ContributionRatio: tỷ lệ doanh thu đóng góp vào JP2
   * - jp1OverflowThreshold: ngưỡng tràn JP1 (VND), phần vượt chuyển sang JP2
   *
   * Theo luật Vietlott, Power 6/55 KHÔNG CÓ Split Cycle.
   */
  jackpot?: Partial<JackpotConfig>;
  /**
   * Tỷ lệ tài chính: commission, company rate.
   * - defaultCommissionRate: tỷ lệ hoa hồng đại lý mặc định
   * - companyRate: tỷ lệ phần trăm doanh thu cho công ty
   */
  rates?: Partial<FinancialRates>;
  /**
   * Giải thưởng cố định cho các tier (VND).
   * - tier1 (4/6): giải tư
   * - tier2 (3/6): giải năm
   * - tier3 (5/6): giải ba
   */
  defaultPrizes?: Partial<PrizeAmounts>;
  /**
   * Luật chơi: giá vé, max boards, max draws, lịch quay.
   * - unitPrice: giá 1 dòng cược (VND)
   * - maxBoards: số board tối đa mỗi vé
   * - maxDraws: số kỳ tối đa mỗi vé
   * - schedule: lịch quay trong tuần
   */
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
  /** Cấu hình global sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản mới của cấu hình (tăng dần mỗi lần update). */
  version: number;
}
