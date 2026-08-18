/**
 * `getOpsSnapshot` / `getOpsAlerts` — types dispatcher gộp 7 game (p1-03 §2.4/§2.5).
 *
 * KHÔNG gắn nhãn `ConfigItem` — snapshot/alert là dữ liệu vận hành REALTIME, field tự giải thích
 * (`stats`, `alertCounts`, `items`…), khác với config tĩnh.
 */

import type { GameProduct } from "@megawin/game-core/entities";
import type { OpsAlertStatus } from "@megawin/game-core/types";

/** `meta` chung cho cả `getOpsSnapshot` và `getOpsAlerts`. */
export interface OpsDispatchMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** Kỳ đang đọc snapshot/alert. */
  drawId: string;
  /** Thời điểm tool đọc (ISO) — số REALTIME, không cache giữa các lượt. */
  fetchedAt: string;
}

export interface GetOpsSnapshotDispatchInput {
  game: GameProduct;
  drawId: string;
}

export interface GetOpsSnapshotDispatchOutput {
  meta: OpsDispatchMeta;
  /** RAW `GetOpsSnapshotOutput` của package game tương ứng — stats, top combo/account, alertCounts. */
  snapshot: unknown;
}

export interface GetOpsAlertsDispatchInput {
  game: GameProduct;
  drawId: string;
  /** Mặc định `new` — đúng cái staff cần xử lý. Truyền rõ để lấy status khác. */
  status?: OpsAlertStatus;
}

export interface GetOpsAlertsDispatchOutput {
  meta: OpsDispatchMeta;
  /** RAW `ListAlertsOutput` (luôn `grouped: true`) của package game tương ứng. */
  result: unknown;
}
