import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "@megawin/game-power655/entities";
import type { GlobalConfigEntity } from "@megawin/game-power655/entities";

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

export interface UpdateGameConfigInput {
  /** Cấu hình Jackpot: dual JP (JP1/JP2 seed, contribution ratios, overflow, split). */
  jackpot?: Partial<JackpotConfig>;
  /** Tỷ lệ tài chính: commission, company rate. */
  rates?: Partial<FinancialRates>;
  /** Giải thưởng cố định: Nhất, Nhì, Ba. */
  defaultPrizes?: Partial<PrizeAmounts>;
  /** Luật chơi: giá vé, max boards, max draws, lịch quay. */
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  config: GlobalConfigEntity;
  version: number;
}
