import { WorkerCoreCollections } from "../../entities";
import type { WorkerLockEntity } from "../../entities";
import { WorkerLockMapper } from "../mappers";
import { WorkerCoreBaseRepo } from "../base-repo";
import type { AcquireOptions } from "./types/worker-lock.types";

/**
 * Repository cho collection `worker_locks` — distributed lock + checkpoint store.
 *
 * Pipeline position: Infrastructure layer, không chứa business logic.
 * Consumer chuẩn là `LockedWorkerUseCase`.
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
   * `lastSuccessAt`, `lastError` = `null`.
   */
  async tryAcquire({ lockKey, ownerToken, ttlSeconds }: AcquireOptions): Promise<boolean> {
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
          },
          $setOnInsert: {
            lockKey,
            isEnabled: true,
            cursor: null,
            lastSuccessAt: null,
            lastError: null,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );
      return result != null;
    } catch (err: any) {
      // E11000 — doc tồn tại nhưng filter không match = owner khác đang giữ còn hiệu lực.
      if (err?.code === 11000) return false;
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
   * Dùng bởi `LockedWorkerUseCase.setCursor()` để worker flush checkpoint sau
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
   * Gộp `lastSuccessAt` + `lastError` + `ownerToken = null` vào cùng 1 `$set`:
   * - Atomic — không có window mà meta đã ghi nhưng lock vẫn held.
   * - Tiết kiệm round-trip (thay vì 2 query meta + release).
   * - Nếu update fail, lock sẽ tự được takeover qua `expiresAt <= now` ở lần sau.
   *
   * KHÔNG ghi `cursor` ở đây — cursor được persist liên tục qua `saveCursor`
   * trong quá trình `runLocked` (tránh mất checkpoint khi Lambda kill cứng).
   *
   * Rule từng meta field:
   * - `undefined` → skip, giữ nguyên giá trị cũ trong DB.
   * - `null` → ghi `null` vào DB (ghi đè giá trị cũ).
   * - `string` → ghi giá trị.
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
    },
  ): Promise<boolean> {
    const $set: {
      ownerToken: null;
      lastSuccessAt?: string | null;
      lastError?: string | null;
    } = { ownerToken: null };

    if (fields.lastSuccessAt !== undefined) {
      $set.lastSuccessAt = fields.lastSuccessAt;
    }

    if (fields.lastError !== undefined) {
      $set.lastError = fields.lastError;
    }

    return await this.updateOne({ lockKey, ownerToken }, { $set });
  }
}
