/**
 * Power 6/55 – Draw Number Stats Repository
 *
 * Collection: power655_draw_number_stats — 1 doc/(draw × số). KHÔNG có ở Keno (Keno nhúng
 * `numberFreq` trong stats doc) — Power655 tách riêng ngay từ đầu, xem JSDoc
 * `Power655DrawNumberStatsDoc` cho lý do.
 *
 * ĐỌC: `listByDrawId(drawId)` → toàn bộ heatmap 55 số (≤55 doc, O(1) thực tế) cho backoffice
 * betting-analysis + player combo-lookup (p1-01 sau này cần tra cứu số riêng lẻ).
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * ## Vì sao không nuôi mảng `numberFreq` trong stats doc (khác Keno)?
 *
 * Quyết định user 05/08/2026: chừa đường thêm chỉ số UNBOUNDED per số trong tương lai
 * (drill-down account cược nhiều vào 1 số, time-series theo giờ) mà KHÔNG cần refactor
 * stats doc — dù hiện tại chỉ 55 số (bounded), pattern nhất quán với combo/account stats.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `POWER655_INDEXES`).
 * KHÔNG cleanup batch trong app.
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type { Power655DrawNumberStatsDoc, Power655DrawNumberStatsEntity } from "@megawin/game-power655/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { NumberStatsMapper } from "../mappers/number-stats-mapper";
import type { NumberStatsDelta } from "./types";

const f = docPath<Power655DrawNumberStatsDoc>();

export class NumberStatsRepository extends BaseRepo<Power655DrawNumberStatsEntity, NumberStatsMapper> {
  constructor() {
    super({
      collName: Power655Collections.DrawNumberStats,
      dataMapper: new NumberStatsMapper(),
    });
  }

  /**
   * Toàn bộ heatmap tần suất số của 1 kỳ — tối đa 55 doc, khớp unique index
   * `{drawId, number}` (equality prefix, IXSCAN toàn bộ range).
   *
   * Dùng cho backoffice betting-analysis (heatmap 55 số) + player/backoffice combo-lookup
   * (p1-01) khi cần đối chiếu số riêng lẻ.
   */
  async findByDrawId(drawId: string): Promise<Power655DrawNumberStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { number: 1 } });
  }

  /**
   * Cộng delta tần suất số của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * Filter có `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì upsert đâm
   * unique index → 11000 = no-op (xem {@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta số gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: NumberStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = deltas.map((delta) => ({
      updateOne: {
        filter: {
          drawId: delta.drawId,
          number: delta.number,
          [f("lastEntryId")]: { $lt: batchMaxId },
        },
        update: {
          $inc: {
            [f("sets")]: delta.sets,
            [f("amount")]: delta.amount,
            [f("boards")]: delta.boards,
          },
          $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: now },
          $setOnInsert: { [f("createdAt")]: now },
        },
        upsert: true,
      },
    }));

    await runDeltaBulkWrite(async () => await this.bulkWrite(ops, { ordered: false }));
  }
}
