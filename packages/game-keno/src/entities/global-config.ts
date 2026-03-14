/**
 * Keno – Global Game Configuration
 *
 * Collection: kenoGameConfigs (scope = "global")
 *
 * 1 document duy nhất, chứa tất cả default config cho game.
 * Staff MegaWin quản lý trên backoffice UI.
 *
 * Keno Vietlott:
 * - Không có Jackpot tích luỹ (giải thưởng cố định theo bảng)
 * - Giải thưởng tối đa: 2 tỷ (pick10, trùng 10/10)
 * - Giới hạn trả thưởng cho bậc 8/9/10 không vượt 10 tỷ / kỳ
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  PayoutCaps,
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

  // ───── Financial Rates ─────

  /** Tỷ lệ tài chính – hiển thị mục "Cấu hình tài chính" trên UI. */
  rates: FinancialRates;

  // ───── Prize Configuration ─────

  /**
   * Bảng giải thưởng cách chơi cơ bản.
   * Key: "pick{N}" (N = 1-10)
   * Value: map từ số trùng (matchCount) → giá trị thưởng (VND).
   */
  basicPrizes: BasicPrizes;

  /** Bảng giải thưởng cách chơi bổ sung Lớn/Nhỏ. */
  bigSmallPrizes: BigSmallPrizes;

  /** Bảng giải thưởng cách chơi bổ sung Chẵn/Lẻ. */
  evenOddPrizes: EvenOddPrizes;

  // ───── Payout Caps ─────

  /**
   * Giới hạn trả thưởng mỗi kỳ quay.
   * Keno có quy định không vượt 10 tỷ / kỳ cho bậc 8, 9, 10.
   */
  payoutCaps: PayoutCaps;

  // ───── Play Rules ─────

  /** Quy tắc chơi – hiển thị mục "Cấu hình luật chơi" trên UI. */
  play: PlayRules;

  // ───── Metadata ─────

  /** Version config – tăng mỗi khi staff chỉnh sửa, dùng cho audit. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface GlobalConfigEntity extends Omit<GlobalConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
