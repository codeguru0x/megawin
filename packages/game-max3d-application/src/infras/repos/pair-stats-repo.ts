/**
 * Max 3D – Draw Pair Stats Repository
 *
 * Collection: max3d_draw_pair_stats — 1 doc/(draw × pairKey).
 *
 * ĐỌC:
 * - `getTopPairs(drawId, k)` → derive `topPairs` bằng `sort({units:-1}).limit(k)`.
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark.
 *
 * ## Vì sao không nuôi mảng `topPairs` trong stats doc? (p0-03)
 *
 * `units`/`amount` là metric **TÍCH LUỸ**. Mảng top-K phải seed lại mỗi tick, nên cặp rơi
 * khỏi top-K sẽ **mất toàn bộ lịch sử** và lần cược sau tính lại từ 0 → tổng hụt, xếp hạng
 * sai — đúng lỗ hổng sinh ra band-aid `Math.max(baselineAccounts, accountIds.size)` cũ.
 *
 * Nguyên tắc: **top-K theo metric bất biến per-item thì an toàn; top-K theo metric tích luỹ
 * thì phải nuôi từ nguồn đầy đủ rồi lấy top-K lúc đọc** (mongodb.mdc §8).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { Max3dDrawPairStatsDoc, Max3dDrawPairStatsEntity } from "@megawin/game-max3d/entities";
import { Max3dCollections } from "@megawin/game-max3d/entities";
import type { AnyBulkWriteOperation, Document } from "mongodb";

import { PairStatsMapper } from "../mappers/pair-stats-mapper";
import { BaseRepo } from "./base-repo";
import type { PairStatsDelta } from "./types";

const f = docPath<Max3dDrawPairStatsDoc>();

export class PairStatsRepository extends BaseRepo<Max3dDrawPairStatsEntity, PairStatsMapper> {
  constructor() {
    super({
      collName: Max3dCollections.PairStats,
      dataMapper: new PairStatsMapper(),
    });
  }

  /**
   * Top cặp plus theo units — nguồn `topPairs` cho ops snapshot + evaluator.
   *
   * Khớp `idx_drawId_units` → IXSCAN dừng đúng `k`, chính xác tuyệt đối (không drift).
   *
   * @param drawId - Kỳ cần lấy.
   * @param k - `ops.stats.topCombosK`.
   */
  async getTopPairs(drawId: string, k: number): Promise<Max3dDrawPairStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { units: -1 }, limit: k });
  }

  /**
   * Cộng delta cặp của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `triplet1`/`triplet2` chỉ ghi lúc insert (`$setOnInsert`) — bất biến theo pairKey.
   * `accountCount` KHÔNG cộng ở đây — counter phái sinh từ `max3d_draw_pair_accounts`,
   * worker gọi {@link syncAccountCounts} sau đó.
   *
   * `ordered: false` + bỏ qua lỗi 11000: nghĩa là batch đã được áp (filter `$lt` không
   * khớp nên upsert cố insert trùng unique) → đúng là no-op mong muốn.
   *
   * @param deltas - Delta gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: PairStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = deltas.map((delta) => ({
      updateOne: {
        filter: {
          drawId: delta.drawId,
          pairKey: delta.pairKey,
          [f("lastEntryId")]: { $lt: batchMaxId },
        },
        update: {
          $inc: { [f("units")]: delta.units, [f("amount")]: delta.amount },
          $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: now },
          $setOnInsert: {
            [f("triplet1")]: delta.triplet1,
            [f("triplet2")]: delta.triplet2,
            [f("accountCount")]: 0,
            [f("createdAt")]: now,
          },
        },
        upsert: true,
      },
    }));

    await runDeltaBulkWrite(async () => await this.bulkWrite(ops, { ordered: false }));
  }

  /**
   * Ghi `accountCount` = số account distinct THẬT của từng cặp (giá trị tuyệt đối).
   *
   * `$set` chứ KHÔNG `$inc`, không có filter watermark — counter **phái sinh**, nguồn sự
   * thật là `max3d_draw_pair_accounts`. Ghi tuyệt đối làm nó idempotent và **tự hội tụ**:
   * chạy lại bao nhiêu lần cũng ra cùng kết quả (giống Keno `ComboStatsRepository.syncAccountCounts`).
   *
   * @param drawId - Kỳ.
   * @param countsByPair - pairKey → số account distinct (từ
   *   `PairAccountsRepository.countAccountsByPair`).
   */
  async syncAccountCounts(drawId: string, countsByPair: Map<string, number>): Promise<void> {
    if (countsByPair.size === 0) return;

    const ops: AnyBulkWriteOperation<Document>[] = [];
    for (const [pairKey, accounts] of countsByPair) {
      ops.push({
        updateOne: {
          filter: { drawId, pairKey },
          update: { $set: { [f("accountCount")]: accounts } },
        },
      });
    }

    await this.bulkWrite(ops, { ordered: false });
  }
}
