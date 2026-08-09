/**
 * Lotto 5/35 – Draw Number Stats Repository
 *
 * Collection: lotto535_draw_number_stats — 1 doc/(draw × kind × số).
 *
 * ĐỌC: `findByDrawId(drawId)` → toàn bộ heatmap 2 lưới (≤47 doc: 35 main + 12 special) cho
 * backoffice betting-analysis + player combo-lookup (p1-01 sau này).
 * GHI: `bulkUpsertDelta` — `$inc` upsert, idempotent theo watermark `lastEntryId`.
 *
 * Port từ Power 6/55 (`number-stats-repo.ts`) — KHÁC: thêm chiều `kind` (main/special) vào
 * filter/update, vì Lotto 5/35 có 2 không gian số (xem JSDoc `Lotto535DrawNumberStatsDoc`).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `LOTTO535_INDEXES`).
 * KHÔNG cleanup batch trong app.
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type {
  Lotto535DrawNumberStatsDoc,
  Lotto535DrawNumberStatsEntity,
  Lotto535NumberKind,
} from "@megawin/game-lotto535/entities";
import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import type { AnyBulkWriteOperation, Document } from "mongodb";

import { NumberStatsMapper } from "../mappers/number-stats-mapper";
import { BaseRepo } from "./base-repo";
import type { NumberStatsDelta } from "./types";

const f = docPath<Lotto535DrawNumberStatsDoc>();

export class NumberStatsRepository extends BaseRepo<Lotto535DrawNumberStatsEntity, NumberStatsMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.DrawNumberStats,
      dataMapper: new NumberStatsMapper(),
    });
  }

  /**
   * Toàn bộ heatmap tần suất số của 1 kỳ (2 lưới main + special) — ≤47 doc, khớp unique
   * index `{drawId, kind, number}` (equality prefix, IXSCAN toàn bộ range).
   *
   * Dùng cho backoffice betting-analysis (heatmap 2 lưới) + player/backoffice combo-lookup
   * (p1-01) khi cần đối chiếu số riêng lẻ.
   */
  async findByDrawId(drawId: string): Promise<Lotto535DrawNumberStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { kind: 1, number: 1 } });
  }

  /**
   * Cộng delta tần suất số của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * Filter có `lastEntryId: { $lt: batchMaxId }` → idempotent; batch đã áp thì upsert đâm
   * unique index → 11000 = no-op (xem {@link runDeltaBulkWrite}).
   *
   * @param deltas - Delta số gom trong 1 tick (cả main + special).
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: NumberStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = deltas.map((delta) => ({
      updateOne: {
        filter: {
          drawId: delta.drawId,
          kind: delta.kind satisfies Lotto535NumberKind,
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
