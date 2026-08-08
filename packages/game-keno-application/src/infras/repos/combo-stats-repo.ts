/**
 * Keno – Draw Combo Stats Repository
 *
 * Collection: keno_draw_combo_stats — 1 doc/(draw × combo), MỌI play type.
 *
 * ĐỌC:
 * - `getByCombo(drawId, comboKey)` → O(1) theo unique index (tra cứu staff/player).
 * - `getTopCombos(drawId, k)` → derive `topCombos` bằng `sort({sets:-1}).limit(k)` trên
 *   index — **thay mảng top-K trong stats doc** vốn bị drift (p2-01 §3.5).
 * - `findConcentrated(drawId, min)` → rule combo_concentration, query counter
 *   `accountCount` (sargable) thay `$expr $size` (COLLSCAN).
 *
 * GHI: `bulkUpsertDelta` — `$inc` upsert, KHÔNG read-modify-write.
 *
 * ## Vì sao `$inc` được, trong khi trước đây phải merge trong app?
 *
 * Trước p2-01 doc chứa mảng `accounts[]` (object per người chơi) — mảng object không `$inc`
 * mù được nên buộc đọc doc → merge → `$set` full array. Ba hệ quả: doc phình theo số người
 * chơi (chạm BSON 16MB), 1 query đọc thừa mỗi tick, và lost-update nếu mất lock.
 *
 * p2-01 tách chi tiết per-account sang `keno_draw_combo_accounts` (1 doc/account) →
 * doc combo chỉ còn **counter vô hướng** (`sets`/`amount`/`accountCount`) → `$inc` thuần,
 * không đọc trước, kích thước cố định. Xem `KenoDrawComboStatsDoc`.
 *
 * ## Idempotent
 *
 * `$inc` không idempotent → filter luôn có `lastEntryId: { $lt: batchMaxId }`. Batch đã áp
 * → filter không khớp → upsert cố insert → **lỗi 11000 = "đã áp rồi" = no-op** (bulkWrite
 * `ordered: false` nên các op khác vẫn chạy). Xem `DeltaAccumulatedDoc` + mongodb.mdc §8.6.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo `KENO_INDEXES`).
 * KHÔNG cleanup batch trong app.
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import type { KenoDrawComboStatsDoc, KenoDrawComboStatsEntity } from "@megawin/game-keno/entities";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { ComboStatsMapper } from "../mappers/combo-stats-mapper";
import type { ComboStatsDelta } from "./types";

const f = docPath<KenoDrawComboStatsDoc>();

export class ComboStatsRepository extends BaseRepo<KenoDrawComboStatsEntity, ComboStatsMapper> {
  constructor() {
    super({
      collName: KenoCollections.ComboStats,
      dataMapper: new ComboStatsMapper(),
    });
  }

  /** Đọc 1 combo cụ thể — tra cứu staff/player, O(1) theo unique index. */
  async getByCombo(drawId: string, comboKey: string): Promise<KenoDrawComboStatsEntity | null> {
    return await this.findOne({ drawId, comboKey });
  }

  /**
   * Top combo theo số bộ cược — nguồn `topCombos` cho ops snapshot.
   *
   * Derive lúc ĐỌC từ collection đầy đủ thay vì nuôi mảng top-K trong stats doc: mảng đó
   * phải seed lại mỗi tick nên combo rơi khỏi top-K **mất lịch sử** rồi tính lại từ 0 →
   * drift không tự sửa (p2-01 R5). Query này khớp `idx_drawId_sets` → IXSCAN dừng đúng `k`.
   *
   * @param drawId - Kỳ cần lấy.
   * @param k - `ops.stats.topCombosK`.
   */
  async getTopCombos(drawId: string, k: number): Promise<KenoDrawComboStatsEntity[]> {
    return await this.findMany({ drawId }, { sort: { sets: -1 }, limit: k });
  }

  /**
   * Combo trong kỳ có ≥ `minPlayers` account distinct — nguồn rule combo_concentration.
   *
   * Query counter `accountCount` (index `idx_drawId_accountCount`) thay vì `$expr $size`
   * trên mảng: `$expr` KHÔNG sargable → COLLSCAN toàn bộ combo của kỳ **mỗi tick**
   * (p2-01 R2, mongodb.mdc §8.2).
   *
   * @param drawId - Kỳ cần soi.
   * @param minPlayers - Ngưỡng số người dồn cược.
   * @param limit - Trần số alert combo xử lý 1 tick (evaluator chỉ cần các combo nóng nhất).
   */
  async findConcentrated(drawId: string, minPlayers: number, limit: number): Promise<KenoDrawComboStatsEntity[]> {
    return await this.findMany({ drawId, accountCount: { $gte: minPlayers } }, { sort: { accountCount: -1 }, limit });
  }

  /**
   * Cộng delta combo của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `playType`/`numbers` chỉ ghi lúc insert (`$setOnInsert`) — bất biến theo combo.
   * `drawId`/`comboKey` KHÔNG lặp trong `$setOnInsert`: filter có equality clause nên Mongo
   * tự điền vào doc mới (mongodb.mdc).
   *
   * `accountCount` KHÔNG cộng ở đây — nó là counter phái sinh từ
   * `keno_draw_combo_accounts`; worker gọi {@link syncAccountCounts} sau đó.
   *
   * `ordered: false` + bỏ qua lỗi 11000: 11000 nghĩa là batch đã được áp (filter `$lt`
   * không khớp nên upsert cố insert trùng unique) → đúng là no-op mong muốn.
   *
   * @param deltas - Delta gom trong 1 tick.
   * @param batchMaxId - ObjectId hex entry lớn nhất trong batch → watermark mới.
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
            [f("numbers")]: delta.numbers,
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
   * `$set` chứ KHÔNG `$inc`, và không có filter watermark — đây là counter **phái sinh**,
   * nguồn sự thật là `keno_draw_combo_accounts`. Ghi tuyệt đối làm nó idempotent và **tự
   * hội tụ**: chạy lại bao nhiêu lần cũng ra cùng kết quả, và mọi lần crash trước đó (dù
   * counter đang thiếu hay thừa) đều được sửa ở lần ghi kế tiếp.
   *
   * Bản trước dùng `$inc` theo "số account mới trong tick" (`upsertedIds`) — có lỗ hổng
   * không vá được: crash giữa lệnh ghi combo_accounts và lệnh cộng counter thì lần retry
   * không còn thấy account nào là mới → counter thiếu VĨNH VIỄN (p2-01 §3.5.7).
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
