/**
 * Max 3D Pro – Draw Pair Stats Repository
 *
 * Collection: max3dpro_draw_pair_stats — 1 doc/(draw × pairKey ORDERED).
 *
 * ĐỌC:
 * - `getTopPairs(drawId, k)` → derive `topPairs` bằng `sort({units:-1}).limit(k)` trên
 *   index — **thay mảng top-K trong stats doc** vốn bị drift (p0-01 §1).
 * - `findConcentrated(drawId, min)` → rule combo_concentration, query counter `accountCount`
 *   (sargable) thay `$expr $size` (COLLSCAN).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * ## ⚠️ pairKey ORDERED — KHÔNG sort/normalize
 *
 * `pairKey = "first>second"`: (A,B) và (B,A) là 2 KEY KHÁC NHAU (ĐB vs phụ ĐB). Repo KHÔNG
 * sort/normalize ở bất kỳ đâu — tầng đọc cộng cả 2 key khi tính liability 1 outcome.
 *
 * ## Idempotent + Retention
 *
 * Filter luôn có `lastEntryId: { $lt: batchMaxId }` → 11000 = "đã áp rồi" = no-op
 * ({@link runDeltaBulkWrite}). TTL index `{ createdAt: 1 }` 90 ngày (tạo thủ công theo
 * `MAX3D_PRO_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type {
  Max3dproDrawPairStatsDoc,
  Max3dproDrawPairStatsEntity,
} from "@megawin/game-max3dpro/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { PairStatsMapper } from "../mappers/pair-stats-mapper";
import type { Max3dproPairStatsDelta } from "./types";

const f = docPath<Max3dproDrawPairStatsDoc>();

export class PairStatsRepository extends BaseRepo<Max3dproDrawPairStatsEntity, PairStatsMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.PairStats,
      dataMapper: new PairStatsMapper(),
    });
  }

  /**
   * Top cặp ORDERED theo units — nguồn `topPairs` cho ops snapshot/exposure/evaluate.
   *
   * Derive lúc ĐỌC từ collection đầy đủ thay vì nuôi mảng top-K trong stats doc (mảng đó
   * phải seed lại mỗi tick nên cặp rơi khỏi top-K **mất lịch sử** → drift). Query khớp
   * `idx_drawId_units` → IXSCAN dừng đúng `k`.
   *
   * @param drawId - Kỳ cần lấy.
   * @param k - `ops.stats.topCombosK`.
   */
  async getTopPairs(drawId: string, k: number): Promise<Max3dproDrawPairStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { units: -1 }, limit: k });
  }

  /**
   * Cặp trong kỳ có ≥ `minPlayers` account distinct — nguồn rule combo_concentration.
   *
   * Query counter `accountCount` (index `idx_drawId_accountCount`) thay vì `$expr $size`
   * trên mảng (không sargable → COLLSCAN mỗi tick).
   *
   * @param drawId - Kỳ cần soi.
   * @param minPlayers - Ngưỡng số người dồn cược.
   * @param limit - Trần số cặp xử lý 1 tick (chỉ cần các cặp nóng nhất).
   */
  async findConcentrated(
    drawId: string,
    minPlayers: number,
    limit: number,
  ): Promise<Max3dproDrawPairStatsEntity[]> {
    return await this.findMany(
      { drawId, accountCount: { $gte: minPlayers } },
      { sort: { accountCount: -1 }, limit },
    );
  }

  /**
   * Cộng delta pair của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `first`/`second` chỉ ghi lúc insert (`$setOnInsert`) — bất biến theo cặp.
   * `accountCount` KHÔNG cộng ở đây — counter phái sinh từ `max3dpro_draw_pair_accounts`;
   * worker gọi {@link syncAccountCounts} sau đó.
   *
   * @param deltas - Delta gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: Max3dproPairStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) {
      return;
    }

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
            [f("first")]: delta.first,
            [f("second")]: delta.second,
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
   * `$set` chứ KHÔNG `$inc`, không filter watermark — counter **phái sinh**, nguồn sự thật
   * là `max3dpro_draw_pair_accounts`. Ghi tuyệt đối làm nó idempotent và tự hội tụ sau mọi
   * crash (khác `$inc` "account mới trong tick" — mất là mất vĩnh viễn).
   *
   * @param drawId - Kỳ.
   * @param countsByPair - pairKey → số account distinct (từ
   *   `PairAccountsRepository.countAccountsByPair`).
   */
  async syncAccountCounts(drawId: string, countsByPair: Map<string, number>): Promise<void> {
    if (countsByPair.size === 0) {
      return;
    }

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
