/**
 * `getDrawDetail` / `listDraws` — types dispatcher gộp 7 game (p1-03 §2.2/§2.3).
 *
 * KHÔNG gắn nhãn `ConfigItem` — DTO draw là dữ liệu SỰ KIỆN (trạng thái kỳ, doanh thu, kết quả),
 * field tự giải thích được qua tên; chỉ số CẤU HÌNH (`getGameConfig`/`getTenantGameConfig`) mới
 * cần nhãn `label`/`unit`. `draw`/`draws` giữ nguyên RAW DTO của package game tương ứng — mỗi game
 * có field hơi khác nhau (jackpot chỉ có ở 3 game), ép về 1 shape chung sẽ mất field hoặc phải
 * optional hoá toàn bộ, không đáng so với lợi ích.
 */

import type { DrawStatus, GameProduct } from "@megawin/game-core/entities";

/** `meta` chung cho cả `getDrawDetail` và `listDraws` — model biết đang xem game nào, lúc nào. */
export interface DrawDispatchMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** Thời điểm tool đọc (ISO). */
  fetchedAt: string;
}

export interface GetDrawSnapshotInput {
  game: GameProduct;
  /** Bỏ trống → trả kỳ hiện hành (đang mở/sắp mở gần nhất) thay vì 1 kỳ cụ thể. */
  drawId?: string;
}

export interface GetDrawSnapshotOutput {
  meta: DrawDispatchMeta & {
    /** `true` khi không truyền `drawId` — `draw` là kết quả của `GetCurrentDrawUseCase`. */
    isCurrent: boolean;
  };
  /**
   * RAW DTO — `GetDrawDetailOutput` (có `drawId`) hoặc `GetCurrentDrawOutput` (không có) của
   * đúng package `game-{game}-application`, KHÔNG map lại field.
   */
  draw: unknown;
}

export interface ListDrawsDispatchInput {
  game: GameProduct;
  status?: DrawStatus;
  /** YYYY-MM-DD, inclusive. */
  fromDate?: string;
  /** YYYY-MM-DD, inclusive. */
  toDate?: string;
  /** 1-based, mặc định 1. */
  page?: number;
  /** Mặc định 10, tối đa 30 (siết ở tool — trần thấp hơn route web). */
  size?: number;
}

export interface ListDrawsDispatchOutput {
  meta: DrawDispatchMeta;
  /** RAW `ListDrawsOutput` của package game tương ứng — `{ draws, nextCursor?/page?, size }`. */
  result: unknown;
}
