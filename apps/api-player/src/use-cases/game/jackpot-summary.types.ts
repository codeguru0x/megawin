/**
 * Response types cho endpoint gộp `GET /games/jackpots`.
 *
 * Đây là type cross-game (không thuộc package game nào) nên đặt tại tầng app.
 * Shape PHẢI mirror `JackpotSummary` trong `@megawin/player-sdk/game` — 2 package không
 * phụ thuộc lẫn nhau (SDK không import backend, backend không import SDK) nên KHÔNG có
 * compile-time check; khi sửa shape ở đây, cập nhật tay bên SDK tương ứng.
 *
 * Thiết kế hybrid: field CHUNG (đọc nhanh cho UI list) + `details` là discriminated
 * union theo `gameProduct` (phần đặc thù từng game, giữ đúng tên field như DTO
 * getJackpot riêng của mỗi game).
 *
 * `JackpotSummary` là DISCRIMINATED UNION theo `gameProduct` (không phải 1 interface
 * với `details: JackpotDetails`) — nhờ vậy `if (jp.gameProduct === ...Power655)` narrow
 * được luôn `jp.details`. Nếu gộp thành 1 interface, TS coi `gameProduct` và `details`
 * là 2 union ĐỘC LẬP → không narrow, consumer buộc phải cast.
 *
 * ⚠️ COMPLETENESS DO COMPILER CƯỠNG CHẾ: `details` KHÔNG khai báo tay từng field, mà
 * bằng `Omit<PlayerGetJackpotOutput, …>` trên DTO getJackpot của chính game đó. Nhờ vậy
 * endpoint gộp là SUPERSET thật của endpoint riêng: game thêm field vào DTO → `details`
 * tự phình → mapper trong `list-jackpots.ts` thiếu field sẽ KHÔNG COMPILE. Nếu khai báo
 * tay, TS im lặng và endpoint gộp âm thầm tụt hậu so với endpoint riêng.
 */

// biome-ignore lint/style/useImportType: typeof JackpotGameProduct.* trong interface cần value import — không thể import type-only.
import { JackpotGameProduct, type JackpotGameProduct as JackpotGameProductType } from "@megawin/game-core/entities";
import type { PlayerGetJackpotOutput as Lotto535JackpotOutput } from "@megawin/game-lotto535-application/use-cases/player";
import type { PlayerGetJackpotOutput as Mega645JackpotOutput } from "@megawin/game-mega645-application/use-cases/player";
import type { PlayerGetJackpotOutput as Power655JackpotOutput } from "@megawin/game-power655-application/use-cases/player";

/**
 * Key đã có sẵn ở {@link JackpotSummaryBase} — loại khỏi `details` để không trả trùng.
 * Field jackpot chính (`currentAmount` / `jackpot1CurrentAmount`) tên khác nhau theo
 * game nên loại riêng ở từng type bên dưới.
 */
type SharedSummaryKeys = "cycleNo" | "drawCount" | "startDrawId";

/**
 * Phần chi tiết đặc thù Lotto 5/35 (single jackpot + split cycle) — toàn bộ field của
 * `getJackpot` riêng trừ phần đã nằm ở base. Gồm `seedAmount`, `peakAmount`,
 * `totalContribution`, `progress` (`splitThreshold` / `percentage` /
 * `reachedSplitThreshold`).
 */
export type Lotto535JackpotDetails = Omit<Lotto535JackpotOutput, SharedSummaryKeys | "currentAmount">;

/**
 * Phần chi tiết đặc thù Mega 6/45 (single jackpot, KHÔNG có split) — gồm `seedAmount`,
 * `peakAmount`, `totalContribution`.
 */
export type Mega645JackpotDetails = Omit<Mega645JackpotOutput, SharedSummaryKeys | "currentAmount">;

/**
 * Phần chi tiết đặc thù Power 6/55 (dual jackpot JP1 + JP2 + overflow) — gồm
 * `jackpot2CurrentAmount`, `jackpot1SeedAmount`, `jackpot2SeedAmount`,
 * `jackpot1OverflowThreshold`, `jackpot2ResetCount`. JP1 nằm ở `primaryAmount`.
 */
export type Power655JackpotDetails = Omit<Power655JackpotOutput, SharedSummaryKeys | "jackpot1CurrentAmount">;

/**
 * Union chi tiết theo game. KHÔNG tự narrow được (không có discriminator riêng) —
 * luôn narrow qua {@link JackpotSummary.gameProduct} ở tầng ngoài, TypeScript tự
 * suy ra `details` đúng type con tương ứng.
 */
export type JackpotDetails = Lotto535JackpotDetails | Mega645JackpotDetails | Power655JackpotDetails;

/**
 * Field CHUNG của mọi mục jackpot — đủ để UI list hiển thị nhanh, không cần narrow.
 *
 * Không export ra SDK dưới dạng riêng: consumer luôn dùng {@link JackpotSummary}.
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

/** Mục jackpot của Lotto 5/35 trong response gộp. */
export interface Lotto535JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Lotto535;
  /** Phần đặc thù Lotto 5/35. */
  details: Lotto535JackpotDetails;
}

/** Mục jackpot của Mega 6/45 trong response gộp. */
export interface Mega645JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Mega645;
  /** Phần đặc thù Mega 6/45. */
  details: Mega645JackpotDetails;
}

/** Mục jackpot của Power 6/55 trong response gộp. */
export interface Power655JackpotSummary extends JackpotSummaryBase {
  /** Discriminator. */
  gameProduct: typeof JackpotGameProduct.Power655;
  /** Phần đặc thù Power 6/55. */
  details: Power655JackpotDetails;
}

/**
 * 1 mục jackpot của 1 game trong response gộp — discriminated union theo `gameProduct`.
 *
 * Field common (`primaryAmount`, `cycleNo`, `drawCount`, `startDrawId`) đọc trực tiếp
 * không cần narrow. Cần dữ liệu đặc thù → so sánh `gameProduct` với
 * {@link JackpotGameProductType} là narrow được `details`.
 */
export type JackpotSummary = Lotto535JackpotSummary | Mega645JackpotSummary | Power655JackpotSummary;

/** Response của `GET /games/jackpots`. */
export interface JackpotSummaryListResponse {
  /** Danh sách jackpot — chỉ game có active cycle. Game chưa có cycle bị bỏ qua. */
  jackpots: JackpotSummary[];
}
