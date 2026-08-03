import type { IndexDescription } from "mongodb";

/**
 * Index cho collection `worker_locks` (DB `megawin`).
 *
 * **KHÔNG có script tự tạo** — index tạo THỦ CÔNG qua Compass/Atlas/mongosh
 * (`mongodb.mdc` §7.4). File này là **source of truth** để DBA copy.
 *
 * ```js
 * use("megawin");
 * db.worker_locks.createIndexes([
 *   { key: { lockKey: 1 }, name: "lockKey_unique", unique: true },
 *   {
 *     key: { acquiredAt: 1 },
 *     name: "idx_acquiredAt_ttl_business",
 *     expireAfterSeconds: 7 * 24 * 60 * 60,
 *     partialFilterExpression: { kind: "business" },
 *   },
 * ]);
 * ```
 */
export const WORKER_LOCK_COLLECTION = "worker_locks";

export const WORKER_LOCK_INDEXES: readonly IndexDescription[] = [
  // Nền của toàn bộ cơ chế lock: 1 doc / lockKey. `tryAcquire` dựa vào E11000
  // của index này để 2 invocation không cùng tạo doc (worker-lock-repo.ts:24-27).
  { key: { lockKey: 1 }, name: "lockKey_unique", unique: true },
  // TTL CHỈ áp cho doc `kind: "business"` (DistributedMutex) — doc `kind: "worker"`
  // (SingleRunWorker) PHẢI sống vĩnh viễn để giữ cursor/isEnabled/stalledItems giữa các
  // lần chạy (xem worker-lock.ts JSDoc bảng `WorkerLockKind`). `partialFilterExpression` là
  // BẮT BUỘC — không có nó, TTL sẽ xoá nhầm worker doc mỗi khi nó rảnh quá 7 ngày (điều bình
  // thường với worker chạy cách nhật), làm mất toàn bộ lịch sử/checkpoint (mongodb.mdc §7.3).
  //
  // Dùng `acquiredAt` (KHÔNG dùng `expiresAt`): `expiresAt` mang ngữ nghĩa lock-expiry ngắn hạn
  // (= `ttlSeconds` của TỪNG business op, có thể chỉ vài trăm giây) — TTL theo nó sẽ xoá doc
  // gần như ngay sau khi release, không còn thời gian audit `lastError` khi op thất bại.
  // `acquiredAt` là mốc "lần hoạt động cuối" ổn định hơn, và tự làm mới nếu resource được
  // acquire lại (VD resettle retry) — retention 7 ngày tính từ lần đó.
  {
    key: { acquiredAt: 1 },
    name: "idx_acquiredAt_ttl_business",
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { kind: "business" },
  },
] as const;
