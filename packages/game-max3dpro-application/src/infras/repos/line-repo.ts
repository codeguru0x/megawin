import type { TicketLineDoc } from "@megawin/game-max3dpro/entities";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { chunk } from "@megawin/shared/utils";

import { BaseRepo } from "./base-repo";

/** Số lượng ops mỗi chunk khi bulk upsert lines. */
const BULK_CHUNK_SIZE = 500;

/**
 * Repository quản lý TicketLine — Max 3D Pro.
 *
 * Mỗi line là 1 cặp TripletPair. Upsert idempotent theo (entryId, lineIndex).
 */
export class LineRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: Max3dproCollections.TicketLines });
  }

  /**
   * Upsert nhiều lines, chunk theo BULK_CHUNK_SIZE để tránh quá tải MongoDB.
   *
   * Filter: `(entryId, lineIndex)` — unique key, đảm bảo idempotent.
   *
   * **Strategy lai `$set` + `$setOnInsert`**:
   *   - `$set` cho mọi business field (matchResult, triplets, payout, ...)
   *     → resettle ghi đè được payout/tier mới khi drawResult thay đổi.
   *   - `$setOnInsert` cho `createdAt` → giữ thời điểm insert lần đầu, không
   *     bị refresh khi settle retry hoặc khi resettle ghi đè business fields.
   *
   * **Tại sao không dùng `$setOnInsert` cho toàn bộ doc**: workflow Resettle
   * re-settle entries → re-build lines theo drawResult mới (tier,
   * payoutAmount). Nếu chỉ `$setOnInsert` thì khi resettle, line cũ vẫn giữ
   * payout cũ → stale data → dispatch sai.
   *
   * **Tại sao tách `createdAt` riêng**: trong settle pipeline, nếu crash giữa
   * `upsertLines` và `bulkSettleEntries`, retry sẽ gọi `upsertLines` lần 2 với
   * `createdAt = now2` (≠ now1). Dùng `$setOnInsert` để `createdAt` giữ
   * timestamp lần đầu — đảm bảo tính immutable của field audit-only này.
   *
   * **Pattern này áp dụng cho mọi game**: `(entryId, lineIndex)` filter,
   * `$set` cho business fields, `$setOnInsert` cho `createdAt`.
   *
   * Idempotent: settle lần đầu insert mới; resettle overwrite business fields
   * cùng filter `(entryId, lineIndex)` → kết quả deterministic theo input cuối.
   */
  async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
    if (lines.length === 0) return;

    const ops = lines.map((doc) => {
      // Tách createdAt khỏi $set: chỉ ghi khi insert mới.
      const { createdAt, ...rest } = doc;
      return {
        updateOne: {
          filter: {
            entryId: doc.entryId,
            lineIndex: doc.lineIndex,
          },
          update: {
            $set: rest,
            $setOnInsert: { createdAt },
          },
          upsert: true,
        },
      };
    });

    // Chunk để tránh quá tải batch size limit của MongoDB
    for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
      await this.bulkWrite(batch, { ordered: false });
    }
  }

  /**
   * Lấy lines của 1 entry, cursor-based pagination theo lineIndex.
   *
   * @param options.size - Số lines mỗi trang (default: 50).
   * @param options.cursor - lineIndex của dòng cuối trang trước (exclusive).
   * @returns lines + hasMore flag.
   */
  async getLinesByEntryId(
    entryId: string,
    options: { size?: number; cursor?: number } = {},
  ): Promise<{ lines: TicketLineDoc[]; hasMore: boolean }> {
    const { size = 50, cursor } = options;
    // entryId lưu dạng hex string (settle-entries ghi `entry.id`), KHÔNG phải ObjectId.
    // Query bằng string để khớp — dùng ObjectId sẽ không match → trả rỗng.
    const filter: Record<string, unknown> = { entryId };

    if (cursor != null) {
      filter.lineIndex = { $gt: cursor };
    }

    const lines = await this.findManyAsDocuments(filter, {
      sort: { lineIndex: 1 },
      limit: size + 1,
    });

    // Lấy thêm 1 để detect hasMore mà không cần count query riêng
    const hasMore = lines.length > size;
    const slice = hasMore ? lines.slice(0, size) : lines;

    return { lines: slice as unknown as TicketLineDoc[], hasMore };
  }

  /** Đếm số lines của 1 entry. */
  async countByEntryId(entryId: string): Promise<number> {
    return await this.count({ entryId });
  }
}
