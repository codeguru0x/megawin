/**
 * Power 6/55 – Global Config Entity
 *
 * Cấu hình game toàn hệ thống (scope = "global").
 * Chỉ có 1 document duy nhất trong collection.
 * Chứa: jackpot config, tỷ lệ tài chính, giải thưởng cố định, luật chơi.
 *
 * Staff backoffice có thể update partial qua UpdateGameConfig use case.
 * Mỗi lần update tăng version +1 (optimistic concurrency).
 *
 * Collection: power655GameConfigs (scope = "global", tenantId = null).
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "./types";

/**
 * MongoDB document cho global config.
 */
export interface GlobalConfigDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;
  /** Scope luôn = "global" cho document này. */
  scope: typeof GameConfigScope.Global;
  /** Luôn null cho global config (dùng tenantId để phân biệt global vs tenant). */
  tenantId: null;
  /** Cấu hình Jackpot: seed amounts, tỷ lệ phân bổ, overflow, split. */
  jackpot: JackpotConfig;
  /** Tỷ lệ tài chính: hoa hồng đại lý, công ty thu về. */
  rates: FinancialRates;
  /** Giải thưởng cố định: Nhất (40tr), Nhì (500k), Ba (50k). */
  defaultPrizes: PrizeAmounts;
  /** Luật chơi: giá vé, max boards, max draws, lịch quay. */
  play: PlayRules;
  /** Version tăng mỗi lần update (optimistic concurrency). */
  version: number;
  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;
}

/** Application layer entity. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}
