/**
 * Base Use Case: Sync Entry Feed (Self-Contained Loop)
 *
 * Mỗi game extends và implement `fetchNextBatch()` duy nhất.
 * Base class chỉ orchestrate: acquireLock → loop → bulkUpsert → saveAndExtendLock → releaseLock.
 *
 * DESIGN:
 * - Global entryChangeSeq: tất cả game dùng chung 1 counter.
 *   → version trên entryFeed luôn tăng monotonically xuyên suốt mọi game.
 *   → tenant poll 1 cursor duy nhất, nhận data tất cả game xen kẽ đúng thứ tự.
 *
 * - entryId = ObjectId hex: unique toàn cục (mỗi game collection riêng).
 *   → entryFeed có unique index trên entryId.
 *   → không thể trùng giữa Lotto535 và Keno.
 *
 * - Upsert idempotent: chỉ ghi nếu version mới > version cũ.
 *   → crash-safe: retry/re-run sẽ skip entries đã sync.
 *
 * CONCURRENCY GUARD (Distributed Lock):
 * - acquireLock() ngay khi khởi động — atomic với TTL 3 phút.
 * - Nếu Lambda khác đang giữ lock → log rõ lý do → return { skipped: true }.
 * - Mỗi batch xong → saveAndExtendLock(): save cursor + gia hạn lock 3 phút.
 * - Kết thúc (done hoặc timeout) → releaseLock() để Lambda tiếp theo chạy ngay.
 * - Nếu crash → lock tự expire sau 3 phút → Lambda kế tiếp acquire và tiếp tục.
 *
 * TIMEOUT:
 * - MAX_EXECUTION_MS = 10 phút.
 * - Vượt quá → log rõ lý do → releaseLock() → return { done: false }.
 * - Lambda tiếp theo (1 phút sau) sẽ tiếp tục từ cursor đã save.
 *
 * CRASH RECOVERY:
 * - Cursor được save sau MỖI batch (500 entries).
 * - Crash → mất tối đa 500 entries (1 batch chưa save).
 * - Idempotent upsert → không sai data khi re-process.
 *
 * USAGE (mỗi game):
 * ```ts
 * export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
 *   private readonly entryRepo = new EntryRepository();
 *
 *   constructor() { super(GameProduct.Lotto535); }
 *
 *   protected async fetchNextBatch(afterVersion, batchSize) {
 *     const entries = await this.entryRepo.getChangedEntries(Long.fromString(afterVersion), batchSize);
 *     return entries.map((e) => mapToFeedDoc(e));
 *   }
 * }
 * ```
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { longToString } from "@megawin/data/mongo";
import type { EntryFeedDoc, GameProduct } from "@megawin/game-core/entities";

import { EntryFeedRepository } from "../infras/repos/entry-feed-repo";
import { FeedSyncCursorRepository } from "../infras/repos/feed-sync-cursor-repo";

/** Batch size mặc định nếu không truyền vào. */
const DEFAULT_BATCH_SIZE = 500;

/**
 * Thời gian tối đa cho 1 Lambda invocation.
 * Bình thường < 1 phút. Settle spike (1M entries) ~5-8 phút.
 * 10 phút = buffer an toàn; Lambda sau sẽ tiếp tục từ cursor đã save.
 */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

/**
 * Input cho SyncEntryFeedUseCase.
 * Chỉ cần batchSize — afterVersion được đọc từ cursor trong lock.
 */
export interface SyncEntryFeedInput {
  /** Số entries mỗi batch. Default: 500. */
  batchSize?: number;
}

/**
 * Kết quả trả về sau khi sync loop kết thúc.
 */
export interface SyncEntryFeedResult {
  /**
   * true = đã xử lý hết tất cả entries mới (không còn gì để sync).
   * false = timeout (vượt MAX_EXECUTION_MS) hoặc skipped.
   */
  done: boolean;

  /**
   * true = lock đang bị giữ bởi Lambda khác → bỏ qua lần này.
   * Chỉ có ý nghĩa khi done = false.
   */
  skipped: boolean;

  /** Version cuối cùng đã sync thành công (string từ BSON Long). */
  lastVersion: string;

  /** Số batches đã xử lý trong lần chạy này. */
  batchesProcessed: number;

  /** Tổng số entries đã upsert vào feed. */
  totalUpserted: number;

  /** Tổng số entries bị skip (version cũ hơn trong feed). */
  totalSkipped: number;

  /** Thời gian thực tế chạy (ms). */
  elapsedMs: number;
}

/**
 * Base use case sync entry feed.
 *
 * Tự quản lý toàn bộ lifecycle: acquireLock → loop → saveAndExtendLock → releaseLock.
 * Subclass implement `fetchNextBatch()` — tự fetch entries từ game repo, map typed entity
 * sang EntryFeedDoc[], trả về mảng rỗng khi hết data.
 *
 * CRASH-SAFE: cursor save sau mỗi batch. Mất tối đa 500 entries khi crash.
 * IDEMPOTENT: upsert với version guard — re-run an toàn.
 */
export abstract class BaseSyncEntryFeedUseCase extends InternalUseCase<SyncEntryFeedInput, SyncEntryFeedResult> {
  private readonly feedRepo = new EntryFeedRepository();
  private readonly cursorRepo = new FeedSyncCursorRepository();

  /**
   * @param gameProduct GameProduct enum value cho game này.
   */
  constructor(protected readonly gameProduct: GameProduct) {
    super();
  }

  /**
   * Fetch batch entries từ game repo và map sang EntryFeedDoc[].
   *
   * Subclass tự gọi entryRepo.getChangedEntries() với typed TicketEntryEntity,
   * map sang EntryFeedDoc[] (type-safe, không dùng unknown/Record).
   * Trả về mảng rỗng khi không còn entries mới.
   *
   * @param afterVersion Version cursor hiện tại (string, convert sang Long khi query).
   * @param batchSize    Số entries tối đa mỗi batch.
   */
  protected abstract fetchNextBatch(afterVersion: string, batchSize: number): Promise<Omit<EntryFeedDoc, "_id">[]>;

  /**
   * Sync loop tự chứa: acquireLock → loop batches → releaseLock.
   *
   * Bước 1: acquireLock() — nếu lock đang bị giữ → log + return skipped.
   * Bước 2: Loop đến khi hết data hoặc vượt MAX_EXECUTION_MS:
   *   - fetchNextBatch(afterVersion, batchSize) — subclass tự fetch + map
   *   - bulkUpsertFeedEntries (1 MongoDB bulkWrite cho cả batch)
   *   - saveAndExtendLock (save cursor + gia hạn lock)
   *   - Timeout check ở cuối iteration — batch hiện tại luôn hoàn thành trước khi dừng
   * Bước 3: releaseLock() khi done hoặc timeout.
   */
  protected async execute(input?: SyncEntryFeedInput): Promise<SyncEntryFeedResult> {
    const batchSize = input?.batchSize ?? DEFAULT_BATCH_SIZE;
    const startTime = Date.now();

    // ── Bước 1: Acquire distributed lock ─────────────────────────────────────
    // Lock TTL = 3 phút. Nếu Lambda khác đang giữ → skip lần này.
    const lockResult = await this.cursorRepo.acquireLock(this.gameProduct);

    if (!lockResult.acquired) {
      console.log(
        `[${this.gameProduct}] Feed sync lock đang bị giữ — skip lần này. ` +
          `Lambda đang chạy sẽ tự release khi hoàn tất hoặc lock tự expire sau 3 phút.`,
      );

      return {
        done: false,
        skipped: true,
        lastVersion: lockResult.afterVersion,
        batchesProcessed: 0,
        totalUpserted: 0,
        totalSkipped: 0,
        elapsedMs: Date.now() - startTime,
      } as SyncEntryFeedResult;
    }

    // ── Bước 2: Sync loop ─────────────────────────────────────────────────────
    let lastVersion = lockResult.afterVersion;
    let batchesProcessed = 0;
    let totalUpserted = 0;
    let totalSkipped = 0;
    let done = false;

    try {
      // Loop đến khi hết data hoặc vượt MAX_EXECUTION_MS.
      // Timeout check ở cuối mỗi iteration — đảm bảo batch hiện tại luôn hoàn thành
      // trước khi quyết định dừng, tránh fetch entries xong nhưng không process.
      while (Date.now() - startTime < MAX_EXECUTION_MS) {
        // Subclass tự fetch entries từ game repo + map sang EntryFeedDoc[]
        const feedDocs = await this.fetchNextBatch(lastVersion, batchSize);

        if (feedDocs.length === 0) {
          // Không còn entries mới — sync hoàn tất
          done = true;
          break;
        }

        // Bulk upsert — 1 MongoDB bulkWrite cho cả batch
        const { upserted, skipped } = await this.feedRepo.bulkUpsertFeedEntries(feedDocs);
        totalUpserted += upserted;
        totalSkipped += skipped;
        batchesProcessed++;

        // Lấy version của doc cuối trong batch làm cursor mới
        // feedDocs đã sorted theo version ASC (từ getChangedEntries)
        // feedDocs.length > 0 đã check ở trên → lastDoc luôn tồn tại
        const lastDoc = feedDocs[feedDocs.length - 1]!;
        lastVersion = longToString(lastDoc.version);

        // Save cursor + gia hạn lock ngay sau mỗi batch
        // → crash chỉ mất tối đa 1 batch (500 entries)
        await this.cursorRepo.saveAndExtendLock(this.gameProduct, lastVersion);

        // Nếu batch trả về ít hơn batchSize → đã hết data
        if (feedDocs.length < batchSize) {
          done = true;
          break;
        }
      }

      // Nếu thoát vòng lặp vì timeout (done vẫn = false) → log rõ lý do
      if (!done) {
        const elapsed = Date.now() - startTime;
        console.log(
          `[${this.gameProduct}] Feed sync vượt quá ${MAX_EXECUTION_MS / 60_000} phút ` +
            `(${Math.round(elapsed / 1000)}s). ` +
            `Đã xử lý ${batchesProcessed} batches, cursor tại version ${lastVersion}. ` +
            `Lambda tiếp theo sẽ tiếp tục từ đây.`,
        );
      }
    } finally {
      // ── Bước 3: Release lock ────────────────────────────────────────────────
      // Luôn release khi kết thúc (done hoặc timeout) để Lambda tiếp theo
      // có thể acquire ngay thay vì chờ lock expire.
      await this.cursorRepo.releaseLock(this.gameProduct);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[${this.gameProduct}] Feed sync kết thúc: done=${done}, ` +
        `batches=${batchesProcessed}, upserted=${totalUpserted}, ` +
        `skipped=${totalSkipped}, elapsed=${Math.round(elapsedMs / 1000)}s, ` +
        `lastVersion=${lastVersion}`,
    );

    return {
      done,
      skipped: false,
      lastVersion,
      batchesProcessed,
      totalUpserted,
      totalSkipped,
      elapsedMs,
    };
  }
}
