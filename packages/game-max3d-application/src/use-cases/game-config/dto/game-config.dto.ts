import type {
  FinancialRates,
  Max3dPrizeConfig,
  PlayRules,
} from "@megawin/game-max3d/entities";
import type { GlobalConfigEntity } from "../../../infras/mappers/global-config-mapper";

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
  /** Tỷ lệ tài chính (companyRate, defaultCommissionRate, …). */
  rates?: Partial<FinancialRates>;
  /** Bảng giải thưởng mặc định (basic / combo / plus). DeepPartial cho phép cập nhật từng phần. */
  defaultPrizes?: DeepPartial<Max3dPrizeConfig>;
  /** Quy tắc chơi (playModes, playTypes, pricing, …). */
  play?: Partial<PlayRules>;
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Phiên bản config sau khi cập nhật (optimistic locking). */
  version: number;
}
