import type { ObjectId } from "mongodb";

/**
 * Phân loại doc trong `worker_locks` — 2 loại KHÁC BẢN CHẤT dùng chung collection.
 *
 * | | `worker` | `business` |
 * |---|---|---|
 * | Ghi bởi | `SingleRunWorker` | `DistributedMutex` |
 * | `lockKey` | TĨNH, 1 per worker (`"keno:stats-sync"`) | ĐỘNG per resource (`"keno:resettle:2026-08-03.042"`) |
 * | Số doc | Hằng số ~10–15 | Tăng theo nghiệp vụ |
 * | Vòng đời | Vĩnh viễn (giữ `cursor`/`isEnabled`/`stalledItems`) | 1 lần dùng rồi thành rác |
 * | `cursor`/`stalledItems`/kill-switch | Có nghĩa | KHÔNG bao giờ dùng |
 *
 * Trang BO Workers health CHỈ đọc `worker` — xem analysis §2.4/§5.7.
 */
export const WorkerLockKind = {
  Worker: "worker",
  Business: "business",
} as const;
export type WorkerLockKind = (typeof WorkerLockKind)[keyof typeof WorkerLockKind];

/**
 * 1 đơn vị công việc đang lỗi LẶP LẠI trong 1 worker — TRẠNG THÁI, không phải sự kiện.
 *
 * Tự biến mất khi item thành công (`clearStalledItem`) ⇒ KHÔNG cần ai "resolve"/"ack".
 * Đây là điểm khác căn bản với `ops_alerts` của game — xem analysis §5.1.
 */
export interface WorkerStalledItem {
  /**
   * Khoá đơn vị công việc — ngữ nghĩa do worker tự quyết.
   * Vd: `drawId` (`"2026-08-03.042"`) với worker stats/alert game; `tx` với tenant-dispatch.
   *
   * PHẢI dùng khoá **coarse-grained** (vd `drawId`), KHÔNG dùng khoá per-record
   * (vd `entryId`) — cardinality cao sẽ làm mảng cap `MAX_STALLED_ITEMS` cắt mất
   * item đáng điều tra.
   */
  itemKey: string;
  /**
   * Số lần lỗi LIÊN TIẾP, tích luỹ **qua nhiều invocation**.
   *
   * Reset về 0 (xoá khỏi mảng) ngay khi item xử lý thành công. Nhờ persist trên doc,
   * phân biệt được "lỗi thoáng qua 3 lần" với "kẹt cả ngày" — điều bản đếm-trong-RAM
   * trước đây không làm được (analysis §3 D4).
   */
  failCount: number;
  /** Thời điểm lỗi ĐẦU của streak hiện tại — cho phép tính "kẹt bao lâu". */
  firstFailedAt: Date;
  /** Thời điểm lỗi gần nhất. */
  lastFailedAt: Date;
  /**
   * Message lỗi gần nhất, đã cắt qua `truncateErrorMessage` (500 ký tự).
   * Message của lỗi Mongo có thể kèm cả doc dump → không cắt thì doc phình vô hạn.
   */
  lastError: string;
}

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

  /**
   * Thời điểm acquire thành công gần nhất — debug/observability.
   *
   * Với `kind: "business"`, field này cũng là ANCHOR cho TTL index
   * `idx_acquiredAt_ttl_business` (`../indexes/index.ts`) — doc business tự xoá sau 7 ngày kể
   * từ lần acquire cuối. Doc `kind: "worker"` KHÔNG bị ảnh hưởng nhờ `partialFilterExpression`.
   */
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

  /**
   * Các đơn vị công việc đang lỗi lặp lại trong worker này.
   *
   * ## Vì sao cần, khi đã có `lastError`?
   *
   * `lastError` chỉ được ghi khi `runLocked` THROW. Worker xử lý nhiều item/tick thường bắt
   * lỗi per-item (1 item bẩn không được làm chết cả tick) ⇒ `runLocked` return bình thường ⇒
   * `lastSuccessAt` vẫn tươi, `lastError = null`, dù 1 item kẹt vĩnh viễn. Field này lấp đúng
   * lỗ mù đó.
   *
   * Ghi bởi `finalizeAndRelease` (1 lệnh, cùng lượt với `lastSuccessAt`/`lastError` — không
   * thêm DB call). Mảng cap `MAX_STALLED_ITEMS`, giữ item `failCount` cao nhất.
   *
   * Mảng RỖNG = không item nào đang kẹt. Doc cũ (trước plan này) thiếu field → mapper
   * normalize về `[]`.
   */
  stalledItems: WorkerStalledItem[];

  /**
   * Mô tả worker làm gì — cho trang BO "Workers health" hiển thị thay `lockKey` kỹ thuật.
   *
   * Nguồn: `SingleRunWorker.description` (worker tự khai về chính nó). Optional vì
   * business lock (xem `kind`) không khai, và doc tạo trước khi có field này chưa có.
   *
   * Tầng ĐỌC fallback `description ?? lockKey` — KHÔNG fallback ở mapper, xem
   * `worker-lock-mapper.ts`.
   */
  description?: string;

  /**
   * Loại lock — xem {@link WorkerLockKind}.
   *
   * BẮT BUỘC trên mọi doc — `tryAcquire` luôn `$set` field này (không dùng `$setOnInsert`),
   * và DB đã được backfill để không còn doc thiếu field (migration thủ công 03/08/2026).
   * `listByKind` filter thẳng `{ kind }`, KHÔNG cần xử lý `undefined`/`null`.
   */
  kind: WorkerLockKind;
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
