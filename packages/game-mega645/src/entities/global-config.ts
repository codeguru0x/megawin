/**
 * Mega 6/45 – Global Game Configuration
 *
 * Collection: mega645GameConfigs (scope = "global")
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { JackpotConfig, FinancialRates, PrizeAmounts, PlayRules, Mega645OpsConfig } from "./types";

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
  /**
   * Cấu hình vận hành & kiểm soát rủi ro — ngưỡng alert + nhịp/top-K stats.
   * Staff sửa trên tab "Vận hành". KHÔNG expose cho player.
   *
   * Doc luôn có field này sau khi init/update config (seed đầy đủ qua backoffice).
   * Mapper KHÔNG merge default — chỉ phản ánh đúng DB. Doc cũ thiếu `ops` được
   * `GetGlobalConfigUseCase` lấp `DEFAULT_MEGA645_CONFIG.ops` (tạm thời, chỉ đường BO).
   */
  ops: Mega645OpsConfig;
  /** Số phiên bản cấu hình (tăng mỗi khi admin cập nhật). */
  version: number;
  /** Thời điểm tạo. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
