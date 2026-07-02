import type { IndexDescription } from "mongodb";

/**
 * Định nghĩa index cho collection `audit_logs` (DB `megawin-audit`).
 *
 * **KHÔNG có script tự tạo** — index được tạo THỦ CÔNG qua DB tools (Compass /
 * Atlas UI / mongosh). File này chỉ là **source of truth** liệt kê đầy đủ key +
 * option để copy sang DB tool, và để code khác (test, doc) tham chiếu thống nhất.
 *
 * ## Vì sao tách TTL khỏi sort index
 *
 * TTL yêu cầu single-field **ascending** (`{ ts: 1 }`). Index sort cursor
 * (`{ ts: -1, _id: -1 }`) KHÔNG dùng được cho TTL → phải có 2 index riêng cho `ts`.
 *
 * ## Cách tạo bằng mongosh (tham khảo)
 *
 * ```js
 * use("megawin-audit");
 * db.audit_logs.createIndexes([
 *   { key: { ts: -1, _id: -1 }, name: "ts_id_desc" },
 *   { key: { ts: 1 }, name: "ts_ttl", expireAfterSeconds: 7776000 },
 *   { key: { actorId: 1, ts: -1 }, name: "actor_ts" },
 *   { key: { targetType: 1, targetId: 1, ts: -1 }, name: "target_ts" },
 *   { key: { game: 1, action: 1, ts: -1 }, name: "game_action_ts" },
 *   { key: { category: 1, ts: -1 }, name: "category_ts" },
 *   { key: { tenantId: 1, ts: -1 }, name: "tenant_ts" },
 * ]);
 * ```
 */
export const AUDIT_LOG_COLLECTION = "audit_logs";

/** TTL 90 ngày tính bằng giây — record quá hạn bị Mongo background task tự xoá (~60s/lần). */
export const AUDIT_TTL_SECONDS = 90 * 86_400;

/**
 * Danh sách index cho `audit_logs`.
 *
 * Thứ tự khai báo phản ánh độ ưu tiên query (sort mặc định trước, TTL, rồi các
 * chiều filter). Mỗi entry có `name` cố định để tránh Mongo tự đặt tên khác khi
 * tạo thủ công.
 */
export const AUDIT_LOG_INDEXES: readonly IndexDescription[] = [
  // Sort mặc định + nền cursor pagination `(ts, _id)` desc.
  { key: { ts: -1, _id: -1 }, name: "ts_id_desc" },
  // TTL 90 ngày — bắt buộc single-field ascending.
  { key: { ts: 1 }, name: "ts_ttl", expireAfterSeconds: AUDIT_TTL_SECONDS },
  // "theo tài khoản" — mọi hành động của 1 actor, newest-first.
  { key: { actorId: 1, ts: -1 }, name: "actor_ts" },
  // "theo đối tượng" — mọi hành động trên 1 kỳ / player / config.
  { key: { targetType: 1, targetId: 1, ts: -1 }, name: "target_ts" },
  // "theo game + loại hành động".
  { key: { game: 1, action: 1, ts: -1 }, name: "game_action_ts" },
  // "theo mục đích" (category).
  { key: { category: 1, ts: -1 }, name: "category_ts" },
  // "theo tenant".
  { key: { tenantId: 1, ts: -1 }, name: "tenant_ts" },
] as const;
