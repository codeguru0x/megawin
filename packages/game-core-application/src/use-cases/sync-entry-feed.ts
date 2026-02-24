/**
 * Base Use Case: Sync Entry Feed
 *
 * Template Method pattern: logic scan + upsert chung cho tất cả game.
 * Mỗi game extends và implement `mapEntryToFeedDoc()` + `getEntryRepo()`.
 *
 * DESIGN:
 * - Global entryChangeSeq: tất cả game dùng chung 1 counter.
 *   → version trên entryFeed luôn tăng monotonically xuyên suốt mọi game.
 *   → tenant poll 1 cursor duy nhất, nhận data tất cả game xen kẽ đúng thứ tự.
 *
 * - sourceEntryId = ObjectId hex: unique toàn cục (mỗi game collection riêng).
 *   → entryFeed có unique index trên sourceEntryId.
 *   → không thể trùng giữa Lotto535 và Keno.
 *
 * - Upsert idempotent: chỉ ghi nếu version mới > version cũ.
 *   → crash-safe: retry/re-run sẽ skip entries đã sync.
 *
 * USAGE (mỗi game):
 * ```ts
 * export class SyncEntryFeedUseCase extends BaseSyncEntryFeedUseCase {
 *   protected getGameProduct() { return GameProduct.Lotto535; }
 *   protected createEntryRepo() { return new EntryRepository(); }
 *   protected mapToFeedDoc(entry, now) { return { ... }; }
 * }
 * ```
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import type { EntryFeedDoc, GameProduct } from "@megawin/game-core/entities";
import { EntryFeedRepository } from "../infras/repos/entry-feed-repo";
import { Long } from "mongodb";

const DEFAULT_BATCH_SIZE = 200;

export interface SyncEntryFeedInput {
  /** Version cuối cùng đã sync. Lần đầu gửi "0". */
  afterVersion: string;
  batchSize?: number;
}

export interface SyncEntryFeedResult {
  /** true khi không còn entries mới cần sync. */
  done: boolean;
  /** Version cuối cùng đã sync trong batch này (string). */
  lastVersion: string;
  /** Số entries đã upsert vào feed. */
  upserted: number;
  /** Số entries skip (version cũ hơn). */
  skipped: number;
}

/**
 * Interface tối thiểu cho entry repo mà base use case cần.
 * Mỗi game repo (Lotto535, Keno) đều có method này.
 */
export interface FeedSyncableEntryRepo {
  getChangedEntries(afterVersion: Long, limit: number): Promise<unknown[]>;
}

/**
 * Base use case sync entry feed — Template Method pattern.
 * Subclass chỉ cần implement 3 abstract methods.
 */
export abstract class BaseSyncEntryFeedUseCase extends StepFunctionUseCase<
  SyncEntryFeedInput,
  SyncEntryFeedResult
> {
  private readonly feedRepo = new EntryFeedRepository();
  /** GameProduct enum value cho game này. */
  protected abstract getGameProduct(): GameProduct;

  /** Tạo instance entry repo của game. */
  protected abstract createEntryRepo(): FeedSyncableEntryRepo;

  /**
   * Map 1 entry entity (game-specific) → EntryFeedDoc.
   * Subclass biết structure cụ thể của entry để extract financial fields.
   */
  protected abstract mapToFeedDoc(
    entry: unknown,
    feedCreatedAt: Date,
  ): Omit<EntryFeedDoc, "_id">;

  /** Scan entries thay đổi, upsert vào entryFeed. */
  protected async execute(input: SyncEntryFeedInput): Promise<SyncEntryFeedResult> {
    const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
    const afterVersion = Long.fromString(input.afterVersion);

    const entryRepo = this.createEntryRepo();
    const entries = await entryRepo.getChangedEntries(afterVersion, batchSize);

    if (entries.length === 0) {
      return {
        done: true,
        lastVersion: input.afterVersion,
        upserted: 0,
        skipped: 0,
      };
    }

    const now = new Date();
    const feedDocs = entries.map((entry) => this.mapToFeedDoc(entry, now));
    const { upserted, skipped } = await this.feedRepo.batchUpsertFeedEntries(feedDocs);

    const lastEntry = entries[entries.length - 1] as any;
    const lastVersion = lastEntry?.version?.toString?.() ?? input.afterVersion;

    return {
      done: entries.length < batchSize,
      lastVersion,
      upserted,
      skipped,
    };
  }
}
