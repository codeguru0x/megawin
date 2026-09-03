/**
 * ResultFeed – Ops Alert
 *
 * Collection: `alerts`
 *
 * Bảng alert vận hành RIÊNG của ResultFeed — KHÔNG dùng chung `ops_alerts` của game
 * (`resultfeed` không import `@megawin/game-*`).
 */

import type { ResultFeedAlertSeverity, ResultFeedAlertStatus, ResultFeedAlertType } from "./enums";

export interface AlertDoc {
  _id: unknown;

  type: ResultFeedAlertType;
  severity: ResultFeedAlertSeverity;

  /** Payload tự do theo từng loại alert — VD `{ sourceId, gameKey, consecutiveFailures }`. */
  payload: Record<string, unknown>;

  /** Khoá dedupe — chống bắn trùng alert cùng nội dung. */
  dedupeKey: string;

  status: ResultFeedAlertStatus;

  createdAt: Date;

  ackBy: string | null;
  ackAt: Date | null;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface AlertEntity extends Omit<AlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
