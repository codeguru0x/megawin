/**
 * Lotto 5/35 – Draw Combo Stats Repository
 *
 * Collection: lotto535_draw_combo_stats — 1 doc/(draw × combo), MỌI play type.
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
 * Port từ Power 6/55 (`combo-stats-repo.ts`) — KHÁC: `mainNumbers`/`specialNumbers` tách
 * 2 field (Lotto 5/35 luôn có 2 chiều số, xem JSDoc `Lotto535DrawComboStatsDoc`).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong `LOTTO535_INDEXES`).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi update đi qua method typed ở đây.
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import type {
  Lotto535DrawComboStatsDoc,
  Lotto535DrawComboStatsEntity,
} from "@megawin/game-lotto535/entities";
import { PlayType } from "@megawin/game-lotto535/entities";
import { buildComboKey, calculateLineCount } from "@megawin/game-lotto535/rules";
import { docPath, runDeltaBulkWrite } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { ComboStatsMapper } from "../mappers/combo-stats-mapper";
import type { ComboStatsDelta } from "./types";

const f = docPath<Lotto535DrawComboStatsDoc>();

export class ComboStatsRepository extends BaseRepo<Lotto535DrawComboStatsEntity, ComboStatsMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.DrawComboStats,
      dataMapper: new ComboStatsMapper(),
    });
  }

  /** Đọc 1 combo cụ thể — tra cứu staff/player, O(1) theo unique index. */
  async findByComboKey(
    drawId: string,
    comboKey: string,
  ): Promise<Lotto535DrawComboStatsEntity | null> {
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
  async findTopBySets(drawId: string, k: number): Promise<Lotto535DrawComboStatsEntity[]> {
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
  async findConcentrated(
    drawId: string,
    minAccounts: number,
    limit: number,
  ): Promise<Lotto535DrawComboStatsEntity[]> {
    return await this.findMany(
      { drawId, accountCount: { $gte: minAccounts } },
      { sort: { accountCount: -1 }, limit },
    );
  }

  /**
   * Cộng delta combo của 1 tick — `$inc` upsert, 1 bulkWrite cho cả batch.
   *
   * `playType`/`mainNumbers`/`specialNumbers` chỉ ghi lúc insert (`$setOnInsert`) — bất
   * biến theo combo. `drawId`/`comboKey` KHÔNG lặp trong `$setOnInsert`: filter có equality
   * clause nên Mongo tự điền vào doc mới.
   *
   * `accountCount` KHÔNG cộng ở đây — nó là counter phái sinh từ
   * `lotto535_draw_combo_accounts`; worker gọi {@link syncAccountCounts} sau đó.
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
            [f("specialNumbers")]: delta.specialNumbers,
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
   * thật là `lotto535_draw_combo_accounts`. Ghi tuyệt đối làm nó idempotent và tự hội tụ.
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

  /**
   * Tổng đơn vị cược phủ bộ CHUẨN (5 chính M + 1 ĐB s) — mẫu số CHIA Jackpot khi (M, s)
   * trúng (minh bạch player, p1-01).
   *
   * ## Chứng minh (đối chiếu `patch-jackpot-prize.ts` khi settle)
   *
   * Mẫu số thật lúc chia JP = `totalBetUnits` = Σ(betCount) mọi LINE == (M, s). Mỗi board
   * phủ (M, s) đóng góp ĐÚNG 1 line == (M, s) (xem `rules/play-types.ts` cách expand từng
   * playType):
   * - `standard` (M, s) — chính nó, 1 line.
   * - `mainCover4` (4 số ⊂ M, s) — ghép nốt phần tử còn lại của M → line = (M, s), đúng 1.
   * - `mainCover` (mainNumbers ⊇ M, s) — chọn đúng tập con M trong C(N,5) tổ hợp, đúng 1.
   * - `specialCover` (mainNumbers = M, s ∈ specialNumbers) — line với ĐB = s, đúng 1.
   * → Tổng betCount 4 nhánh dưới = `totalBetUnits`. ✓
   *
   * ## 4 nhánh truy vấn (KHÔNG dùng `$all` cho mainCover4 — phủ `⊂` phải enumerate)
   *
   * 1. `standard` — 1 exact lookup comboKey (chính nó).
   * 2. `mainCover4` — C(5,4)=5 exact lookup key con 4/5 số của M (bỏ lần lượt 1 số).
   * 3. `mainCover` (N=6-15) — 1 query `$all` M, bound `playType` trên index
   *    `idx_drawId_playType_mainNumbers`.
   * 4. `specialCover` — 1 query `mainNumbers` exact M + `specialNumbers` membership s.
   *
   * Nhánh 1+2 gộp `$in` — 1 round-trip cho 6 key.
   *
   * `betCount` mỗi doc = `sets / expandedLines` — `expandedLines` tính lại từ CHÍNH doc
   * qua `calculateLineCount` (domain rule), KHÔNG tra bảng tĩnh (đọc từ doc, không lệch
   * nếu domain rule đổi).
   *
   * @param drawId - Kỳ cần tính.
   * @param mainNumbers - 5 số chính bộ chuẩn (M), zero-padded "01"-"35".
   * @param specialNumbers - 1 số đặc biệt bộ chuẩn (s), mảng 1 phần tử "01"-"12".
   */
  async sumJackpotUnitsForStandardSet(
    drawId: string,
    mainNumbers: string[],
    specialNumbers: string[],
  ): Promise<number> {
    const [special] = specialNumbers;
    // Doc lưu `mainNumbers` ĐÃ SORT (accumulator sort trước buildComboKey). Nhánh 4
    // (specialCover) so `mainNumbers` bằng ARRAY-EQUALITY order-sensitive của Mongo →
    // PHẢI sort input trước, nếu không caller truyền thứ tự CSV (`inferPlayType` không
    // sort) sẽ MISS mọi board specialCover → `jackpotUnits` (mẫu số chia JP) thiếu.
    // `buildComboKey`/`$all` tự order-independent nên dùng bản sort cho cả 4 nhánh là an toàn.
    const sortedMain = [...mainNumbers].sort();

    // Nhánh 1+2: standard + 5 subset mainCover4 (bỏ lần lượt 1/5 số) — batch 6 exact key.
    const mainCover4Keys = sortedMain.map((_, i) =>
      buildComboKey(
        PlayType.MainCover4,
        sortedMain.filter((_, j) => j !== i),
        specialNumbers,
      ),
    );
    const exactKeys = [
      buildComboKey(PlayType.Standard, sortedMain, specialNumbers),
      ...mainCover4Keys,
    ];

    const [exactDocs, mainCoverDocs, specialCoverDocs] = await Promise.all([
      this.findMany({ drawId, comboKey: { $in: exactKeys } }),
      this.findMany({
        drawId,
        playType: PlayType.MainCover,
        mainNumbers: { $all: sortedMain },
        specialNumbers,
      }),
      this.findMany({
        drawId,
        playType: PlayType.SpecialCover,
        mainNumbers: sortedMain,
        specialNumbers: special,
      }),
    ]);

    let units = 0;
    for (const doc of [...exactDocs, ...mainCoverDocs, ...specialCoverDocs]) {
      const expandedLines = calculateLineCount(doc.playType, {
        mainNumbers: doc.mainNumbers,
        specialNumbers: doc.specialNumbers,
      });
      units += doc.sets / expandedLines;
    }
    return units;
  }
}
