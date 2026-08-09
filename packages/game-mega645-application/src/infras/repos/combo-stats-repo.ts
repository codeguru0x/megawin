/**
 * Mega 6/45 – Draw Combo Stats Repository
 *
 * Collection: mega645_draw_combo_stats — 1 doc/(draw × combo), MỌI play type.
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
 * Port nguyên kiến trúc từ Power 6/55 (`combo-stats-repo.ts`) — vì sao tách `accountCount`
 * khỏi mảng account. Field `numbers` (comboKey theo BOARD người chơi chọn, không expand
 * lines), xem JSDoc `Mega645DrawComboStatsDoc`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `mega645Indexes`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { Mega645DrawComboStatsDoc, Mega645DrawComboStatsEntity } from "@megawin/game-mega645/entities";
import { Mega645Collections, PlayType } from "@megawin/game-mega645/entities";
import { buildComboKey, calculateLineCount } from "@megawin/game-mega645/rules";
import type { AnyBulkWriteOperation, Document } from "mongodb";

import { ComboStatsMapper } from "../mappers/combo-stats-mapper";
import { BaseRepo } from "./base-repo";
import type { ComboStatsDelta } from "./types";

const f = docPath<Mega645DrawComboStatsDoc>();

/** PlayType Bao tổ hợp C(N,6) (bao7..bao18) — phủ bộ 6 số S ⟺ `numbers ⊇ S`. */
const BAO_SUPERSET_PLAY_TYPES: PlayType[] = [
  PlayType.Bao7,
  PlayType.Bao8,
  PlayType.Bao9,
  PlayType.Bao10,
  PlayType.Bao11,
  PlayType.Bao12,
  PlayType.Bao13,
  PlayType.Bao14,
  PlayType.Bao15,
  PlayType.Bao18,
];

export class ComboStatsRepository extends BaseRepo<Mega645DrawComboStatsEntity, ComboStatsMapper> {
  constructor() {
    super({
      collName: Mega645Collections.DrawComboStats,
      dataMapper: new ComboStatsMapper(),
    });
  }

  /** Đọc 1 combo cụ thể — tra cứu staff/player, O(1) theo unique index. */
  async findByComboKey(drawId: string, comboKey: string): Promise<Mega645DrawComboStatsEntity | null> {
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
  async findTopBySets(drawId: string, k: number): Promise<Mega645DrawComboStatsEntity[]> {
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
  async findConcentrated(drawId: string, minAccounts: number, limit: number): Promise<Mega645DrawComboStatsEntity[]> {
    return await this.findMany({ drawId, accountCount: { $gte: minAccounts } }, { sort: { accountCount: -1 }, limit });
  }

  /**
   * Tổng betUnits chia jackpot khi bộ 6 số standard `S` trúng — con số minh bạch cho player
   * (`GetComboPopularityPlayerUseCase`, p1-01). Bằng ĐÚNG mẫu số `totalBetUnits` của
   * `patch-jackpot-prize.ts` (SAU fix Q3): `jackpotPerUnit = floor(pool / totalBetUnits)`.
   *
   * Mỗi board phủ `S` đóng góp đúng 1 line == S khi trúng → `jackpotUnits(S) = Σ betCount`
   * các board phủ S (chứng minh analysis §3.10 mục "Xác minh"). 3 nguồn phủ S:
   * - `standard`: đúng board `numbers == S` — 1 exact lookup `comboKey = "standard:S"`.
   * - `bao5`: có line == S ⟺ 5 số chọn ⊂ S (line = 5 số + phần tử còn lại của S) → 6 tập con
   *   size-5 của S (C(6,5) = 6). Gộp cùng query `$in` với standard (7 key).
   * - `bao7..bao18` (C(N,6)): có line == S ⟺ `numbers ⊇ S` → 1 query `$all: S` trên index
   *   `{drawId, playType, numbers}` (p0-01), bound theo playType (KHÔNG quét combo standard).
   *
   * Mỗi doc: `betUnits = sets / expandedLines[playType]` (app-side). `sets` accumulator ghi
   * `Σ(expandedLines × betCount)` → thương LUÔN nguyên (`expandedLines` hằng theo playType).
   *
   * @param drawId - Kỳ cần tính.
   * @param numbers6 - Bộ 6 số standard S ("01".."45"), thứ tự bất kỳ (buildComboKey tự sort).
   * @returns Tổng betUnits (mẫu số chia jackpot). 0 nếu chưa ai cược bộ phủ S.
   */
  async sumJackpotUnitsForStandardSet(drawId: string, numbers6: string[]): Promise<number> {
    const sorted = [...numbers6].sort();

    // Nhánh standard + bao5: gom 7 comboKey exact (1 standard + 6 tập con size-5), 1 query $in.
    const exactKeys = [buildComboKey(PlayType.Standard, sorted)];
    for (let i = 0; i < sorted.length; i++) {
      const subset = sorted.filter((_, idx) => idx !== i);
      exactKeys.push(buildComboKey(PlayType.Bao5, subset));
    }

    const [exactDocs, supersetDocs] = await Promise.all([
      this.findMany({ drawId, comboKey: { $in: exactKeys } }),
      this.findMany({
        drawId,
        playType: { $in: BAO_SUPERSET_PLAY_TYPES },
        numbers: { $all: sorted },
      }),
    ]);

    let units = 0;
    for (const doc of [...exactDocs, ...supersetDocs]) {
      const expanded = calculateLineCount(doc.playType as PlayType);
      // Guard chia 0 (expanded luôn ≥ 1 theo bảng) — thương nguyên vì sets = Σ(expanded × betCount).
      if (expanded > 0) {
        units += doc.sets / expanded;
      }
    }
    return units;
  }

  /**
   * Cộng delta combo của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `playType`/`numbers` chỉ ghi lúc insert (`$setOnInsert`) — bất biến theo combo.
   * `drawId`/`comboKey` KHÔNG lặp trong `$setOnInsert`: filter có equality clause nên Mongo
   * tự điền vào doc mới.
   *
   * `accountCount` KHÔNG cộng ở đây — nó là counter phái sinh từ
   * `mega645_draw_combo_accounts`; worker gọi {@link syncAccountCounts} sau đó.
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
   * `$set` chứ KHÔNG `$inc`, và không có filter watermark — counter phái sinh, nguồn sự
   * thật là `mega645_draw_combo_accounts`. Ghi tuyệt đối làm nó idempotent và tự hội tụ.
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
