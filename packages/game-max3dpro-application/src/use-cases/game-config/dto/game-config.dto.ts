import type {
  FinancialRates,
  Max3dproPrizeConfig,
  PlayRules,
} from "@megawin/game-max3dpro/entities";
import type { GlobalConfigEntity } from "@megawin/game-max3dpro/entities";;

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  /** Cấu hình game toàn cục hiện tại. */
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

export interface UpdateGameConfigInput {
  /** Tỷ lệ tài chính (defaultCommissionRate, …). */
  rates?: Partial<FinancialRates>;
  /** Bảng giải thưởng mặc định (standard). DeepPartial cho phép cập nhật từng phần. */
  defaultPrizes?: DeepPartial<Max3dproPrizeConfig>;
  /** Quy tắc chơi (playModes, playTypes, pricing, …). */
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản config sau khi cập nhật (optimistic locking). */
  version: number;
}
