/**
 * Cross-game shared types — dùng chung cho nhiều game.
 *
 * Chứa type cho các API gộp (aggregate) không gắn với 1 game cụ thể, truy cập qua
 * `client.game.*`. Hiện có: danh sách jackpot gộp (`client.game.jackpots.list()`).
 *
 * @module
 */

/**
 * Các game CÓ jackpot cycle — discriminator cho {@link JackpotSummary}.
 *
 * Chỉ 3/7 game hiện có jackpot: Lotto 5/35, Mega 6/45, Power 6/55.
 *
 * @example
 * ```ts
 * import { JackpotGameProduct } from "@megawin/player-sdk/game";
 *
 * if (jp.gameProduct === JackpotGameProduct.Power655) {
 *   // TS narrow: jp.details là Power655JackpotDetails
 * }
 * ```
 */
export const JackpotGameProduct = {
  /** Lotto 5/35 — single jackpot + cơ chế chia giải (split cycle). */
  Lotto535: "lotto535",
  /** Mega 6/45 — single jackpot, tích luỹ vô hạn tới khi có winner. */
  Mega645: "mega645",
  /** Power 6/55 — dual jackpot (JP1 + JP2) + overflow. */
  Power655: "power655",
} as const;
export type JackpotGameProduct = (typeof JackpotGameProduct)[keyof typeof JackpotGameProduct];

/**
 * Chi tiết jackpot đặc thù Lotto 5/35 (single jackpot + split cycle).
 *
 * @see {@link JackpotSummary}
 */
// ⚠️ MAINTAINER NOTE (không lên TypeDoc — dòng `//` không phải JSDoc): field ở đây PHẢI
// khớp với `Lotto535JackpotResponse` (trừ `cycleNo`/`drawCount`/`startDrawId` đã nằm ở
// tầng chung `JackpotSummary`, và `currentAmount` đã đổi tên thành `primaryAmount`). Sửa
// `Lotto535JackpotResponse` (thêm/xoá/đổi field) → PHẢI sửa type này cùng lúc + ghi
// CHANGELOG. Không có compile-time check giữa 2 type này — xem `player-sdk-jsdoc.mdc`
// mục MANDATORY.
export interface Lotto535JackpotDetails {
  /** Số tiền khởi điểm (seed) khi bắt đầu cycle mới (VND). */
  seedAmount: number;
  /** Số tiền Jackpot cao nhất đạt được trong cycle hiện tại (VND). */
  peakAmount: number;
  /** Tổng tiền đã tích luỹ vào Jackpot từ đầu cycle (VND). */
  totalContribution: number;
  /** Tiến trình tích luỹ hướng tới ngưỡng chia (split). */
  progress: {
    /** Ngưỡng kích hoạt chia Jackpot (VND). */
    splitThreshold: number;
    /** Phần trăm tiến trình (0–100) = `primaryAmount / splitThreshold × 100`. */
    percentage: number;
    /**
     * Jackpot đã chạm ngưỡng chia chưa (`primaryAmount >= splitThreshold`).
     * CHỈ phản ánh vế "đủ tiền" — kỳ CHIA thực tế còn cần kỳ 21h và không ai trúng Jackpot.
     */
    reachedSplitThreshold: boolean;
  };
}

/**
 * Chi tiết jackpot đặc thù Mega 6/45 (single jackpot, KHÔNG có split cycle).
 *
 * @see {@link JackpotSummary}
 */
// ⚠️ MAINTAINER NOTE (không lên TypeDoc): field ở đây PHẢI khớp với
// `Mega645JackpotResponse` (trừ `cycleNo`/`drawCount`/`startDrawId` đã nằm ở tầng chung
// `JackpotSummary`, và `currentAmount` đã đổi tên thành `primaryAmount`). Sửa
// `Mega645JackpotResponse` (thêm/xoá/đổi field) → PHẢI sửa type này cùng lúc + ghi
// CHANGELOG. Không có compile-time check giữa 2 type này.
export interface Mega645JackpotDetails {
  /** Số tiền khởi điểm (seed) khi bắt đầu cycle mới (VND). */
  seedAmount: number;
  /** Số tiền Jackpot cao nhất đạt được trong cycle hiện tại (VND). */
  peakAmount: number;
  /** Tổng tiền đã tích luỹ vào Jackpot từ đầu cycle (VND). */
  totalContribution: number;
}

/**
 * Chi tiết jackpot đặc thù Power 6/55 (dual jackpot JP1 + JP2 + overflow).
 *
 * JP1 (giải chính 6/6) nằm ở {@link JackpotSummary.primaryAmount}; JP2 và các
 * thông tin cycle nằm ở đây.
 *
 * @see {@link JackpotSummary}
 */
// ⚠️ MAINTAINER NOTE (không lên TypeDoc): field ở đây PHẢI khớp với
// `Power655JackpotResponse` (trừ `cycleNo`/`drawCount`/`startDrawId` đã nằm ở tầng chung
// `JackpotSummary`, và `jackpot1CurrentAmount` đã đổi tên thành `primaryAmount`). Sửa
// `Power655JackpotResponse` (thêm/xoá/đổi field) → PHẢI sửa type này cùng lúc + ghi
// CHANGELOG. Không có compile-time check giữa 2 type này.
export interface Power655JackpotDetails {
  /** Số tiền Jackpot 2 hiện tại (VND) — trùng 5/6 + bonus. */
  jackpot2CurrentAmount: number;
  /** Giá trị khởi tạo Jackpot 1 khi bắt đầu cycle mới (VND). */
  jackpot1SeedAmount: number;
  /** Giá trị khởi tạo Jackpot 2 khi bắt đầu cycle mới (VND). */
  jackpot2SeedAmount: number;
  /** Ngưỡng tràn Jackpot 1 (VND) — vượt ngưỡng + có JP2 winner thì phần vượt chuyển sang JP2. */
  jackpot1OverflowThreshold: number;
  /** Số lần JP2 đã trúng và reset trong cycle hiện tại. 0 = JP2 chưa ai trúng. */
  jackpot2ResetCount: number;
}

/**
 * Union chi tiết jackpot theo game. KHÔNG tự narrow được (không có discriminator riêng) —
 * luôn narrow qua {@link JackpotSummary.gameProduct} ở tầng ngoài, TypeScript tự suy ra
 * `details` đúng type con tương ứng.
 */
export type JackpotDetails = Lotto535JackpotDetails | Mega645JackpotDetails | Power655JackpotDetails;

/**
 * Field CHUNG của mọi mục jackpot — render danh sách không cần narrow.
 *
 * Không dùng trực tiếp: consumer luôn dùng {@link JackpotSummary}.
 */
interface JackpotSummaryBase {
  /** Tên hiển thị game. VD: `"Lotto 5/35"`. */
  displayName: string;
  /**
   * Jackpot chính đang tích luỹ (VND).
   * lotto535/mega645 = `currentAmount`; power655 = `jackpot1CurrentAmount` (JP1).
   */
  primaryAmount: number;
  /** Số thứ tự cycle Jackpot (tăng dần). */
  cycleNo: number;
  /** Số kỳ quay đã settle trong cycle hiện tại. */
  drawCount: number;
  /** DrawId của kỳ đầu tiên trong cycle. Format: `YYYY-MM-DD.NNN`. */
  startDrawId: string;
}

/**
 * Mục jackpot của Lotto 5/35 trong response gộp.
 *
 * @see {@link JackpotSummary}
 */
export interface Lotto535JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Lotto535;
  /** Phần đặc thù Lotto 5/35 (seed/peak/contribution + tiến trình split). */
  details: Lotto535JackpotDetails;
}

/**
 * Mục jackpot của Mega 6/45 trong response gộp.
 *
 * @see {@link JackpotSummary}
 */
export interface Mega645JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Mega645;
  /** Phần đặc thù Mega 6/45 (seed/peak/contribution). */
  details: Mega645JackpotDetails;
}

/**
 * Mục jackpot của Power 6/55 trong response gộp.
 *
 * @see {@link JackpotSummary}
 */
export interface Power655JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Power655;
  /** Phần đặc thù Power 6/55 (JP2 + seed JP1/JP2 + overflow threshold). */
  details: Power655JackpotDetails;
}

/**
 * 1 mục jackpot của 1 game trong response gộp {@link GameApi.jackpots} —
 * **discriminated union** theo `gameProduct`.
 *
 * Thiết kế hybrid: field CHUNG (`primaryAmount`, `cycleNo`, `drawCount`, `startDrawId`)
 * đủ để render danh sách nhanh; cần dữ liệu đặc thù thì so sánh `gameProduct` — TypeScript
 * tự narrow luôn `details` sang đúng type của game đó.
 *
 * @example
 * ```ts
 * import { JackpotGameProduct } from "@megawin/player-sdk/game";
 *
 * const { jackpots } = await client.game.jackpots.list();
 *
 * for (const jp of jackpots) {
 *   console.log(`${jp.displayName}: ${jp.primaryAmount.toLocaleString()} VND`);
 *
 *   if (jp.gameProduct === JackpotGameProduct.Power655) {
 *     // jp.details: Power655JackpotDetails
 *     console.log(`  JP2: ${jp.details.jackpot2CurrentAmount.toLocaleString()} VND`);
 *   } else if (jp.gameProduct === JackpotGameProduct.Lotto535) {
 *     // jp.details: Lotto535JackpotDetails
 *     console.log(`  Tiến trình chia: ${jp.details.progress.percentage}%`);
 *   }
 * }
 * ```
 */
export type JackpotSummary = Lotto535JackpotSummary | Mega645JackpotSummary | Power655JackpotSummary;

/**
 * Response của {@link GameApi.jackpots} `.list()`.
 */
export interface JackpotSummaryListResponse {
  /**
   * Danh sách jackpot hiện tại — CHỈ game đang có active cycle.
   * Game chưa có cycle (chưa mở jackpot) bị bỏ qua, không xuất hiện trong mảng.
   */
  jackpots: JackpotSummary[];
}
