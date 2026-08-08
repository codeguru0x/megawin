/**
 * Power 6/55 – Draw Combo Stats Repository
 *
 * Collection: power655_draw_combo_stats — 1 doc/(draw × combo), MỌI play type.
 *
 * ĐỌC:
 * - `findByComboKey(drawId, comboKey)` → O(1) theo unique index (tra cứu staff/player).
 * - `findTopBySets(drawId, k)` → derive `topCombos` bằng `sort({sets:-1}).limit(k)` trên
 *   index — thay mảng top-K trong stats doc vốn bị drift.
 * - `findConcentrated(drawId, min, limit)` → rule combo_concentration, query counter
 *   `accountCount` (sargable) thay `$expr $size` (COLLSCAN).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, KHÔNG read-modify-write.
 *
 * Port nguyên kiến trúc từ Keno (`combo-stats-repo.ts`, xem JSDoc gốc cho lý giải đầy đủ
 * vì sao tách `accountCount` khỏi mảng account). KHÁC Keno: field `mainNumbers` (thay
 * `numbers`) — comboKey theo BOARD người chơi chọn (không expand lines), xem JSDoc
 * `Power655DrawComboStatsDoc`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `POWER655_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import type { Power655DrawComboStatsDoc, Power655DrawComboStatsEntity } from "@megawin/game-power655/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { ComboStatsMapper } from "../mappers/combo-stats-mapper";
import type { ComboStatsDelta } from "./types";

const f = docPath<Power655DrawComboStatsDoc>();

export class ComboStatsRepository extends BaseRepo<Power655DrawComboStatsEntity, ComboStatsMapper> {
  constructor() {
    super({
      collName: Power655Collections.DrawComboStats,
      dataMapper: new ComboStatsMapper(),
    });
  }

  /** Đọc 1 combo cụ thể — tra cứu staff/player, O(1) theo unique index. */
  async findByComboKey(drawId: string, comboKey: string): Promise<Power655DrawComboStatsEntity | null> {
    return await this.findOne({ drawId, comboKey });
  }

  /**
   * Top combo theo số bộ cược — nguồn `topCombos` cho ops snapshot.
   *
   * Derive lúc ĐỌC từ collection đầy đủ thay vì nuôi mảng top-K trong stats doc: mảng đó
   * phải seed lại mỗi tick nên combo rơi khỏi top-K mất lịch sử. Query này khớp
   * `idx_drawId_sets` → IXSCAN dừng đúng `k`.
   *
   * @param drawId - Kỳ cần lấy.
   * @param k - `ops.stats.topCombosK`.
   */
  async findTopBySets(drawId: string, k: number): Promise<Power655DrawComboStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { sets: -1 }, limit: k });
  }

  /**
   * Combo trong kỳ có ≥ `minAccounts` account distinct — nguồn rule combo_concentration.
   *
   * Query counter `accountCount` (index `idx_drawId_accountCount`) thay vì `$expr $size`
   * trên mảng: `$expr` KHÔNG sargable → COLLSCAN toàn bộ combo của kỳ mỗi tick.
   *
   * @param drawId - Kỳ cần soi.
   * @param minAccounts - Ngưỡng số người dồn cược (`ops.alerts.comboAccountsWarn`).
   * @param limit - Trần số alert combo xử lý 1 tick.
   */
  async findConcentrated(drawId: string, minAccounts: number, limit: number): Promise<Power655DrawComboStatsEntity[]> {
    return await this.findMany({ drawId, accountCount: { $gte: minAccounts } }, { sort: { accountCount: -1 }, limit });
  }

  /**
   * Cộng delta combo của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `playType`/`mainNumbers` chỉ ghi lúc insert (`$setOnInsert`) — bất biến theo combo.
   * `drawId`/`comboKey` KHÔNG lặp trong `$setOnInsert`: filter có equality clause nên Mongo
   * tự điền vào doc mới.
   *
   * `accountCount` KHÔNG cộng ở đây — nó là counter phái sinh từ
   * `power655_draw_combo_accounts`; worker gọi {@link syncAccountCounts} sau đó.
   *
   * @param deltas - Delta gom trong 1 tick.
   * @param batchMaxId - ObjectId hex của entry lớn nhất trong batch → watermark mới.
   */
  async bulkUpsertDelta(deltas: ComboStatsDelta[], batchMaxId: string): Promise<void> {
    if (deltas.length === 0) return;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = deltas.map((delta) => ({
      updateOne: {
        filter: {
          drawId: delta.drawId,
          comboKey: delta.comboKey,
          [f("lastEntryId")]: { $lt: batchMaxId },
        },
        update: {
          $inc: { [f("sets")]: delta.sets, [f("amount")]: delta.amount },
          $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: now },
          $setOnInsert: {
            [f("playType")]: delta.playType,
            [f("mainNumbers")]: delta.mainNumbers,
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
   * Ghi `accountCount` = số account distinct THẬT của từng combo (giá trị tuyệt đối).
   *
   * `$set` chứ KHÔNG `$inc`, và không có filter watermark — counter phái sinh, nguồn sự
   * thật là `power655_draw_combo_accounts`. Ghi tuyệt đối làm nó idempotent và tự hội tụ.
   *
   * @param drawId - Kỳ.
   * @param countsByCombo - comboKey → số account distinct (từ
   *   `ComboAccountsRepository.countAccountsByCombo`).
   */
  async syncAccountCounts(drawId: string, countsByCombo: Map<string, number>): Promise<void> {
    if (countsByCombo.size === 0) return;

    const ops: AnyBulkWriteOperation<Document>[] = [];
    for (const [comboKey, accounts] of countsByCombo) {
      ops.push({
        updateOne: {
          filter: { drawId, comboKey },
          update: { $set: { [f("accountCount")]: accounts } },
        },
      });
    }

    await this.bulkWrite(ops, { ordered: false });
  }
}
