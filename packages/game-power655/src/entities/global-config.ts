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
import type { VietlottPeriodAnchor } from "@megawin/game-core/types";

import type { FinancialRates, JackpotConfig, PlayRules, Power655OpsConfig, PrizeAmounts } from "./types";

/** Re-export type chung — cho phép import từ `@megawin/game-power655/entities` như các type khác. */
export type { VietlottPeriodAnchor };

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
  /** Cấu hình Jackpot: seed amounts, tỷ lệ phân bổ, overflow. */
  jackpot: JackpotConfig;
  /** Tỷ lệ tài chính: hoa hồng đại lý, công ty thu về. */
  rates: FinancialRates;
  /** Giải thưởng cố định: Nhất (40tr), Nhì (500k), Ba (50k). */
  defaultPrizes: PrizeAmounts;
  /** Luật chơi: giá vé, max boards, max draws, lịch quay. */
  play: PlayRules;

  // ───── Vietlott Period Suggestion ─────

  /**
   * Neo suy mã kỳ Vietlott (`drawPeriod`) cho dialog công bố kết quả — gợi ý dựa TRỰC TIẾP vào
   * `play` (lịch quay) + `vietlott` (neo), KHÔNG dùng dữ liệu vận hành (`vietlottRef` kỳ khác)
   * để tránh lan truyền sai số (xem `vietlott-period-suggestion/00-overview.md` §4.4).
   *
   * `undefined` = chưa cấu hình = chưa bật gợi ý (KHÔNG có giá trị mặc định hardcode).
   */
  vietlott?: VietlottPeriodAnchor;

  /**
   * Cấu hình vận hành & kiểm soát rủi ro — ngưỡng alert + nhịp/top-K stats.
   * Staff sửa trên tab "Vận hành". KHÔNG expose cho player.
   *
   * Doc luôn có field này sau khi init/update config (seed đầy đủ qua backoffice).
   * Mapper KHÔNG merge default — chỉ phản ánh đúng DB. Khi doc CHƯA TỪNG tồn tại,
   * `GetGlobalConfigUseCase` trả `DEFAULT_POWER655_CONFIG` cho staff xem/lưu lần đầu.
   */
  ops: Power655OpsConfig;
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
