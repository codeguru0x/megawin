/**
 * Mega 6/45 – Draw Number Stats Repository
 *
 * Collection: mega645_draw_number_stats — 1 doc/(draw × số). Tách riêng ngay từ đầu (không
 * nhúng `numberFreq` trong stats doc), xem JSDoc `Mega645DrawNumberStatsDoc` cho lý do.
 *
 * ĐỌC: `findByDrawId(drawId)` → toàn bộ heatmap 45 số (≤45 doc, O(1) thực tế) cho backoffice
 * betting-analysis + player/backoffice combo-lookup (p1-01 cần tra cứu số riêng lẻ).
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * Port nguyên kiến trúc từ Power 6/55 (`number-stats-repo.ts`).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `mega645Indexes`).
 * KHÔNG cleanup batch trong app.
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Mega645Collections } from "@megawin/game-mega645/entities";
import type { Mega645DrawNumberStatsDoc, Mega645DrawNumberStatsEntity } from "@megawin/game-mega645/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { NumberStatsMapper } from "../mappers/number-stats-mapper";
import type { NumberStatsDelta } from "./types";

const f = docPath<Mega645DrawNumberStatsDoc>();

export class NumberStatsRepository extends BaseRepo<Mega645DrawNumberStatsEntity, NumberStatsMapper> {
  constructor() {
    super({
      collName: Mega645Collections.DrawNumberStats,
      dataMapper: new NumberStatsMapper(),
    });
  }

  /**
   * Toàn bộ heatmap tần suất số của 1 kỳ — tối đa 45 doc, khớp unique index
   * `{drawId, number}` (equality prefix, IXSCAN toàn bộ range).
   *
   * Dùng cho backoffice betting-analysis (heatmap 45 số) + player/backoffice combo-lookup
   * (p1-01) khi cần đối chiếu số riêng lẻ.
   */
  async findByDrawId(drawId: string): Promise<Mega645DrawNumberStatsEntity[]> {
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
