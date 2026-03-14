/**
 * Lotto 5/35 – Global Game Configuration
 *
 * Collection: lotto535GameConfigs (scope = "global")
 *
 * 1 document duy nhất, chứa tất cả default config cho game.
 * Staff MegaWin quản lý trên backoffice UI.
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "./types";

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
