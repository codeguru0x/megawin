/**
 * Mega 6/45 – Global Game Configuration
 *
 * Collection: mega645GameConfigs (scope = "global")
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "./types";

/** Cấu hình game Mega 6/45 cấp toàn cục (scope = "global"). */
export interface GlobalConfigDoc {
  /** MongoDB document ID. */
  _id: unknown;
  /** Phạm vi cấu hình (luôn = "global"). */
  scope: typeof GameConfigScope.Global;
  /** Luôn null cho global config (không thuộc đại lý nào). */
  tenantId: null;
  /** Cấu hình Jackpot (seed, ngưỡng split, tỷ lệ chia). */
  jackpot: JackpotConfig;
  /** Tỷ lệ tài chính (hoa hồng mặc định, tỷ lệ công ty). */
  rates: FinancialRates;
  /** Giá trị giải thưởng cố định mặc định (tier1, tier2, tier3). */
  defaultPrizes: PrizeAmounts;
  /** Quy tắc chơi (giá vé, số board tối đa, lịch quay, v.v.). */
  play: PlayRules;
  /** Số phiên bản cấu hình (tăng mỗi khi admin cập nhật). */
  version: number;
  /** Thời điểm tạo. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}
