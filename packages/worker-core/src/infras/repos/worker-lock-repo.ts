import { isDuplicateKeyError } from "@megawin/data/mongo";
import { WorkerCoreCollections } from "../../entities";
import type { WorkerLockEntity, WorkerLockKind, WorkerStalledItem } from "../../entities";
import { WorkerLockMapper } from "../mappers";
import { WorkerCoreBaseRepo } from "../base-repo";
import type { AcquireOptions } from "./types/worker-lock.types";

/**
 * Repository cho collection `worker_locks` — distributed lock + checkpoint store.
 *
 * Pipeline position: Infrastructure layer, không chứa business logic.
 * Consumer chuẩn là `SingleRunWorker`.
 *
 * ## Document lifecycle
 *
 * Doc được tạo lần đầu khi `tryAcquire` upsert và **tồn tại vĩnh viễn** —
 * không có TTL auto-delete. `release` chỉ clear `ownerToken = null`, giữ nguyên
 * `cursor`, `lastSuccessAt`, `lastError`, `isEnabled` cho lần chạy sau.
 *
 * ## Crash recovery
 *
 * Worker crash không release → `ownerToken` vẫn còn (non-null) và `expiresAt <= now`.
 * Invocation kế tiếp match qua filter takeover condition trong `tryAcquire`.
 *
 * ## Index BẮT BUỘC
 *
 * `{ lockKey: 1 }` unique — 1 doc per lockKey, enforce atomic acquire qua E11000.
 * Xem `@megawin/worker-core/indexes` để setup.
 *
 * Tất cả method dùng public API từ `MongoRepository` — không access `_collection`.
 */
export class WorkerLockRepository extends WorkerCoreBaseRepo<WorkerLockEntity, WorkerLockMapper> {
  constructor() {
    super({
      collName: WorkerCoreCollections.WorkerLocks,
      dataMapper: new WorkerLockMapper(),
    });
  }

  /**
   * Atomic acquire trong 1 MongoDB round-trip.
   *
   * Match thành công (→ UPDATE, acquire) khi một trong các điều kiện:
   * - `ownerToken: null` — lock idle, tái acquire.
   * - `ownerToken: <same>` — reentrant, refresh TTL.
   * - `expiresAt <= now` — owner cũ crash, takeover.
   *
   * Match thất bại (doc tồn tại nhưng không match) → MongoDB thử INSERT (vì upsert)
   * → bị unique index chặn → E11000 → trả `false`.
   *
   * `$setOnInsert` chỉ chạy khi INSERT lần đầu — init `isEnabled: true`, `cursor`,
   * `lastSuccessAt`, `lastError`, `stalledItems` = giá trị rỗng mặc định.
   *
   * `description`/`kind` dùng `$set` (KHÔNG `$setOnInsert`): sửa text trong code PHẢI
   * propagate lên doc đã tồn tại. `$setOnInsert` sẽ đóng băng mô tả của lần acquire
   * đầu tiên vĩnh viễn — đây là bẫy copy-paste dễ mắc nhất của method này.
   */
  async tryAcquire({ lockKey, ownerToken, ttlSeconds, description, kind }: AcquireOptions): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    try {
      const result = await this.findOneAndUpdate(
        {
          lockKey,
          $or: [{ ownerToken: null }, { ownerToken }, { expiresAt: { $lte: now } }],
        },
        {
          $set: {
            ownerToken,
            expiresAt,
            acquiredAt: now,
            // description/kind dùng $set (KHÔNG $setOnInsert): sửa text trong code PHẢI
            // propagate lên doc đã tồn tại. $setOnInsert sẽ đóng băng mô tả của lần
            // acquire đầu tiên vĩnh viễn.
            ...(description !== undefined && { description }),
            kind,
          },
          $setOnInsert: {
            lockKey,
            isEnabled: true,
            cursor: null,
            lastSuccessAt: null,
            lastError: null,
            stalledItems: [],
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );
      return result != null;
    } catch (err) {
      // E11000 — doc tồn tại nhưng filter không match = owner khác đang giữ còn hiệu lực.
      if (isDuplicateKeyError(err)) return false;
      throw err;
    }
  }

  /**
   * Gia hạn TTL cho lock đang held.
   *
   * Trả `false` khi:
   * - Lock đã expire (bị takeover bởi invocation khác).
   * - `ownerToken` không match (lock đã được release + re-acquired bởi owner khác).
   *
   * Caller nhận `false` PHẢI abort để tránh collision.
   */
  async extend(lockKey: string, ownerToken: string, ttlSeconds: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    return await this.updateOne(
      {
        lockKey,
        ownerToken,
        expiresAt: { $gt: now },
      },
      {
        $set: { expiresAt },
      },
    );
  }

  /**
   * Đọc lock document hiện tại theo `lockKey`.
   *
   * Dùng để check `isEnabled` trước khi acquire, hoặc đọc `cursor` khi resume.
   * Trả `null` nếu worker chưa từng chạy (doc chưa tồn tại).
   */
  async findByKey(lockKey: string): Promise<WorkerLockEntity | null> {
    return await this.findOne({ lockKey });
  }

  /**
   * Persist checkpoint cursor ngay lập tức — KHÔNG release lock.
   *
   * Dùng bởi `SingleRunWorker.setCursor()` để worker flush checkpoint sau
   * mỗi batch. Chỉ update khi đúng `ownerToken` — tránh ghi đè lên lock đã
   * bị takeover.
   *
   * Trả `false` nếu lock không còn thuộc owner này (đã bị takeover) — caller
   * nên abort công việc.
   */
  async saveCursor(lockKey: string, ownerToken: string, cursor: string | null): Promise<boolean> {
    return await this.updateOne({ lockKey, ownerToken }, { $set: { cursor } });
  }

  /**
   * Finalize 1 lần chạy: ghi meta + release lock trong **1 MongoDB update** duy nhất.
   *
   * Gộp `lastSuccessAt` + `lastError` + `stalledItems` + `ownerToken = null` vào cùng 1
   * `$set`:
   * - Atomic — không có window mà meta đã ghi nhưng lock vẫn held.
   * - Tiết kiệm round-trip (thay vì nhiều query meta + release).
   * - Nếu update fail, lock sẽ tự được takeover qua `expiresAt <= now` ở lần sau.
   *
   * KHÔNG ghi `cursor` ở đây — cursor được persist liên tục qua `saveCursor`
   * trong quá trình `runLocked` (tránh mất checkpoint khi Lambda kill cứng).
   *
   * Rule từng meta field:
   * - `undefined` → skip, giữ nguyên giá trị cũ trong DB.
   * - `null` → ghi `null` vào DB (ghi đè giá trị cũ).
   * - `string`/mảng → ghi giá trị.
   *
   * `stalledItems`: caller (`SingleRunWorker`) LUÔN truyền mảng (kể cả `[]`) —
   * KHÔNG truyền `undefined` khi rỗng, nếu không mảng cũ sẽ sống mãi trên DB (đúng
   * defect D1 mà field này sinh ra để diệt). `undefined` chỉ hợp lệ cho caller khác
   * không quản `stalledItems` (VD `DistributedMutex`).
   *
   * `ownerToken` LUÔN được set về `null` — caller KHÔNG còn giữ lock sau khi
   * method này return. IDEMPOTENT.
   */
  async finalizeAndRelease(
    lockKey: string,
    ownerToken: string,
    fields: {
      lastSuccessAt?: string | null;
      lastError?: string | null;
      stalledItems?: WorkerStalledItem[];
    },
  ): Promise<boolean> {
    const $set: {
      ownerToken: null;
      lastSuccessAt?: string | null;
      lastError?: string | null;
      stalledItems?: WorkerStalledItem[];
    } = { ownerToken: null };

    if (fields.lastSuccessAt !== undefined) {
      $set.lastSuccessAt = fields.lastSuccessAt;
    }

    if (fields.lastError !== undefined) {
      $set.lastError = fields.lastError;
    }

    if (fields.stalledItems !== undefined) {
      $set.stalledItems = fields.stalledItems;
    }

    return await this.updateOne({ lockKey, ownerToken }, { $set });
  }

  /**
   * Liệt kê lock theo loại, sort `lockKey` tăng dần.
   *
   * KHÔNG phân trang: với `kind = Worker` số doc là hằng số nhỏ (~10–15, tăng theo số
   * worker chứ không theo dữ liệu). Với `kind = Business` số doc tăng theo nghiệp vụ —
   * caller PHẢI tự giới hạn nếu dùng (hiện chưa có caller nào).
   *
   * Filter `{ kind }` thuần — MỌI doc trong collection đã có field `kind` (backfill
   * 03/08/2026, xem `WorkerLockDoc.kind`), không còn doc thiếu field cần xử lý `null`.
   *
   * Index: CỐ Ý không có index riêng cho query này (COLLSCAN trên ~15 doc `worker` +
   * hiện 0 doc `business` rẻ hơn chi phí bảo trì 1 index nữa). Mốc đảo quyết định: khi
   * số doc `kind: business` vượt ~1000 (resettle đã chạy production một thời gian) →
   * thêm index `{ kind: 1, lockKey: 1 }` (cover được cả filter và sort).
   *
   * Projection: CỐ Ý không có — query không theo chu kỳ (chỉ khi staff mở trang BO) và
   * use-case cần gần như toàn bộ field để derive `WorkerRunState`.
   */
  async listByKind(kind: WorkerLockKind): Promise<WorkerLockEntity[]> {
    return await this.findMany({ kind }, { sort: { lockKey: 1 } });
  }

  /**
   * Bật/tắt kill-switch cho 1 worker — dùng bởi trang BO "Sức khoẻ worker" (PATCH).
   *
   * KHÔNG đụng `ownerToken`/`cursor`/`stalledItems` — chỉ set `isEnabled`. Worker đang
   * chạy giữa lượt (`ownerToken != null`) vẫn hoàn tất lượt hiện tại; kill-switch chỉ
   * chặn invocation KẾ TIẾP ở bước 1 của `SingleRunWorker.execute`.
   *
   * Trả `null` nếu `lockKey` chưa từng ghi doc (worker chưa chạy lần nào) — caller
   * (use-case) tự quyết định coi đây là lỗi "không tìm thấy" hay no-op.
   */
  async setEnabled(lockKey: string, isEnabled: boolean): Promise<WorkerLockEntity | null> {
    return await this.findOneAndUpdate({ lockKey }, { $set: { isEnabled } }, { returnDocument: "after" });
  }
}
