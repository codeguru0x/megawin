/**
 * Lotto 5/35 – Global Game Configuration
 *
 * Collection: lotto535GameConfigs (scope = "global")
 *
 * 1 document duy nhất, chứa tất cả default config cho game.
 * Staff MegaWin quản lý trên backoffice UI.
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { VietlottPeriodAnchor } from "@megawin/game-core/types";

import type { FinancialRates, JackpotConfig, Lotto535OpsConfig, PlayRules, PrizeAmounts } from "./types";

/** Re-export type chung — cho phép import từ `@megawin/game-lotto535/entities` như các type khác. */
export type { VietlottPeriodAnchor };

/**
 * Cấu hình game toàn cục – staff MegaWin quản lý trên backoffice.
 *
 * Mọi field đều editable qua UI trừ scope.
 */
export interface GlobalConfigDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Luôn = "global". */
  scope: typeof GameConfigScope.Global;

  /** Null – global không thuộc tenant nào. */
  tenantId: null;

  // ───── Jackpot Configuration ─────

  /**
   * Cấu hình Jackpot – hiển thị mục "Jackpot Settings" trên UI backoffice.
   * Staff MegaWin có thể chỉnh sửa tất cả field trong section này.
   */
  jackpot: JackpotConfig;

  // ───── Financial Rates ─────

  /** Tỷ lệ tài chính – hiển thị mục "Cấu hình tài chính" trên UI. */
  rates: FinancialRates;

  // ───── Default Prize Amounts ─────

  /**
   * Giá trị giải thưởng cố định mặc định (VND).
   * Hiển thị mục "Cấu hình giải thưởng" trên UI backoffice.
   *
   * Không bao gồm Jackpot (giá trị Jackpot là tích luỹ, tối thiểu = seedAmount).
   *
   * Khi hiển thị bảng giải thưởng cho người chơi:
   * - Giải trúng Jackpot (5 chính + ĐB): ghi "Jackpot" (giá trị tích luỹ)
   * - Các giải khác: ghi giá trị cố định từ config này
   * - Tại kỳ "Chia Giải Độc Đắc": ghi "Jackpot + {bonusPerWinner}" cho tier1-5
   * - Giải Khuyến Khích: luôn giá trị cố định, KHÔNG nhận bonus từ chia Jackpot
   *
   * Khi chơi BAO, giải thưởng = tổng tất cả line trúng (không config riêng).
   */
  defaultPrizes: PrizeAmounts;

  // ───── Play Rules ─────

  /** Quy tắc chơi – hiển thị mục "Cấu hình luật chơi" trên UI. */
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

  // ───── Ops Config (vận hành & kiểm soát rủi ro) ─────

  /**
   * Cấu hình vận hành & kiểm soát rủi ro — ngưỡng alert + nhịp/top-K stats.
   * Staff sửa trên tab "Vận hành". KHÔNG expose cho player.
   *
   * Doc luôn có field này sau khi init/update config (seed đầy đủ qua backoffice).
   * Mapper KHÔNG merge default — chỉ phản ánh đúng DB. Doc cũ thiếu `ops` được
   * `GetGlobalConfigUseCase` lấp `DEFAULT_LOTTO535_CONFIG.ops` (tạm thời, chỉ đường BO).
   */
  ops: Lotto535OpsConfig;

  // ───── Metadata ─────

  /** Version config – tăng mỗi khi staff chỉnh sửa, dùng cho audit. */
  version: number;

  /** Thời điểm tạo config document (lần đầu seed). */
  createdAt: Date;
  /** Thời điểm chỉnh sửa config gần nhất. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
