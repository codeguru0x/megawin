import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "@megawin/game-lotto535/entities";
import type { GlobalConfigEntity } from "../../../infras/mappers/global-config-mapper";

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  /** Cấu hình toàn cục hiện tại (full entity từ DB). */
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

export interface UpdateGameConfigInput {
  /** Cấu hình Jackpot (seedAmount, splitThreshold, splitRatios). Partial update. */
  jackpot?: Partial<JackpotConfig>;
  /** Tỷ lệ tài chính (companyRate, defaultCommissionRate). Partial update. */
  rates?: Partial<FinancialRates>;
  /** Giải thưởng mặc định theo tier (VND). Partial update. */
  defaultPrizes?: Partial<PrizeAmounts>;
  /** Quy tắc chơi (unitPrice, maxBoardsPerTicket, maxDrawCount, ...). Partial update. */
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật (full entity). */
  config: GlobalConfigEntity;
  /** Phiên bản mới sau khi cập nhật (optimistic locking). */
  version: number;
}
