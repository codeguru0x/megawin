/**
 * ResultFeed – Source Registry
 *
 * Collection: `sources`
 *
 * Registry + config nguồn thu thập — sửa được qua backoffice, KHÔNG cần deploy.
 * "Đánh giá ưu tiên lựa chọn" (role/trustWeight) là DỮ LIỆU, không phải hằng số hardcode.
 */

import type { ResultFeedGameKey, ResultFeedProviderId, ResultFeedSourceId, SourceRole } from "./enums";

export interface SourceDoc {
  _id: unknown;

  /** Khoá ổn định, dùng trong tên lock/log/observation. Xem {@link ResultFeedSourceId}. */
  sourceId: ResultFeedSourceId;

  /** Tên hiển thị cho vận hành. */
  name: string;

  /** Host gốc — chỉ để hiển thị/nhóm, KHÔNG dùng để build URL (adapter lo). */
  baseUrl: string;

  /** Vai trò trong đồng thuận. Đổi giá trị này là quyết định VẬN HÀNH ⇒ phải audit. */
  role: SourceRole;

  /**
   * Trọng số tin cậy 0–100, dùng cho `ConflictPolicy.WeightedQuorum`.
   * KHÔNG có ý nghĩa với `HumanOnly`. Trọng số cao KHÔNG biến `Confirming` thành
   * `Authoritative` — hai thứ độc lập.
   */
  trustWeight: number;

  /** Game mà nguồn này cung cấp. Nguồn có thể chỉ phục vụ 1 game. */
  gameKeys: ResultFeedGameKey[];

  /** Tắt nguồn ⇒ worker bỏ qua, consensus không tính. Kill-switch per source. */
  isEnabled: boolean;

  /** Provider dùng để lấy dữ liệu nguồn này. Xem {@link ResultFeedProviderId}. */
  providerId: ResultFeedProviderId;

  /** Version parser đang chạy cho nguồn này. Bump khi HTML nguồn đổi. */
  parserVersion: string;

  /** Có cần vendor render JS không. Mặc định false — đo trước khi bật. */
  requiresRender: boolean;

  /** Khoảng nghỉ tối thiểu giữa 2 request tới nguồn này (ms) — lịch sự + tránh bị chặn. */
  minIntervalMs: number;

  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface SourceEntity extends Omit<SourceDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
