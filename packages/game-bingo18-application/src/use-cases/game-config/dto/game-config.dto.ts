import type {
  FinancialRates,
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
  PlayRules,
} from "@megawin/game-bingo18/entities";
import type { GlobalConfigEntity } from "../../../infras/mappers/game-config-mapper";

// ─────────────────────────────────────────────
// GetGameConfig
// ─────────────────────────────────────────────

export interface GetGameConfigOutput {
  /** Cấu hình toàn cục game Bingo 18. */
  config: GlobalConfigEntity;
}

// ─────────────────────────────────────────────
// UpdateGameConfig
// ─────────────────────────────────────────────

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
}

export interface UpdateGameConfigOutput {
  /** Cấu hình sau khi cập nhật. */
  config: GlobalConfigEntity;
  /** Version tự increment mỗi lần update. */
  version: number;
}
