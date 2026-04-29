import type { ObjectId } from "mongodb";

/**
 * MongoDB document shape cho collection `worker_locks`.
 *
 * 1 doc = 1 worker (1 lockKey). Doc tồn tại vĩnh viễn sau lần acquire đầu —
 * KHÔNG tự xoá qua TTL, giữ lại `cursor`, `lastSuccessAt`, `lastError`,
 * `isEnabled` giữa các lần chạy.
 *
 * ## Indexes (BẮT BUỘC tạo trước khi deploy — xem `@megawin/worker-core/indexes`)
 *
 * - `{ lockKey: 1 }` unique — 1 doc per lockKey, enforce atomic acquire.
 *
 * ## Trạng thái lock
 *
 * | ownerToken  | expiresAt | Ý nghĩa                             |
 * |-------------|-----------|-------------------------------------|
 * | null        | (bỏ qua)  | Idle — có thể acquire                |
 * | <token>     | > now     | Held — owner `<token>` đang chạy     |
 * | <token>     | <= now    | Crashed — worker crash, có thể takeover |
 *
 * KHÔNG dùng `WorkerLockDoc` trực tiếp trong business logic — dùng
 * `WorkerLockEntity` (đã map `_id → id`).
 */
export interface WorkerLockDoc {
  _id: ObjectId;

  /**
   * Lock key — domain-specific, unique toàn hệ thống.
   * Convention: `"{worker-name}:{lane}"`. VD: `"tenant-dispatch:main"`.
   */
  lockKey: string;

  /**
   * Token random per acquire — `crypto.randomUUID()` do base class sinh.
   * Dùng để verify ownership trong `extend` / `finalizeRun` / `release`.
   *
   * - `null` = lock idle (không ai giữ, có thể acquire).
   * - `string` = lock đang được held bởi owner có token này.
   */
  ownerToken: string | null;

  /**
   * Thời điểm lock hết hạn — CHỈ có ý nghĩa khi `ownerToken != null` (đang held).
   *
   * Worker dùng giá trị này để:
   * - Invocation kế tiếp check `expiresAt <= now` → crash recovery (takeover).
   *
   * Khi lock idle (`ownerToken = null`), giá trị `expiresAt` không còn tác dụng.
   */
  expiresAt: Date;

  /** Thời điểm acquire thành công gần nhất — debug/observability. */
  acquiredAt: Date;

  /**
   * Kill-switch — `false` = base class skip worker (không acquire, không chạy).
   *
   * Ops set trực tiếp trên DB để disable worker mà không cần deploy lại code:
   * ```
   * db.worker_locks.updateOne({ lockKey: "..." }, { $set: { isEnabled: false } })
   * ```
   *
   * Default `true` khi doc được tạo mới (qua `$setOnInsert`).
   */
  isEnabled: boolean;

  /**
   * Checkpoint cursor — worker tự encode format (string | null).
   *
   * Worker dùng để resume ở lần chạy sau. Base class KHÔNG đụng đến — worker
   * gọi `setCursor()` trong `runLocked()` để buffer, base class ghi 1 lần khi
   * finalize cùng với `lastSuccessAt` / `lastError`.
   *
   * Ví dụ giá trị hợp lệ:
   * - BSON Long sequence: `"9007199254740993"` (dùng `Long.fromString`).
   * - ISO 8601 timestamp: `"2026-04-27T10:00:00Z"`.
   * - Opaque ID: `"order:abc123"`.
   *
   * `null` = worker chưa từng set cursor.
   */
  cursor: string | null;

  /**
   * ISO 8601 timestamp lần `runLocked` chạy thành công gần nhất.
   * Ops dùng để detect stuck worker ("lần cuối thành công cách đây bao lâu?").
   *
   * Set bởi base class sau khi `runLocked` return không throw.
   * `null` = worker chưa từng chạy thành công.
   */
  lastSuccessAt: string | null;

  /**
   * Error message ngắn gọn (từ `Error.message`) lần `runLocked` thất bại gần nhất.
   *
   * Reset về `null` khi `runLocked` success → luôn phản ánh trạng thái hiện tại.
   * Set bởi base class khi `runLocked` throw.
   */
  lastError: string | null;
}

/**
 * Domain entity cho worker lock — dùng trong business logic.
 *
 * Khác với `WorkerLockDoc`: `_id: ObjectId` được map sang `id: string` qua
 * `WorkerLockMapper`.
 */
export interface WorkerLockEntity extends Omit<WorkerLockDoc, "_id"> {
  /** Hex string representation của MongoDB ObjectId. */
  id: string;
}
