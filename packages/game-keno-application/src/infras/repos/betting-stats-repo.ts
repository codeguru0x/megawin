/**
 * Keno – Draw Betting Stats Repository
 *
 * Collection: keno_draw_betting_stats — 1 doc/draw, pre-aggregated ops stats.
 *
 * ĐỌC: `findOne({ drawId })` → O(1) cho backoffice ops dashboard.
 * GHI: `applyDelta` — `$inc` theo path cố định + `$set lastEntryId` trong CÙNG 1 lệnh.
 *
 * ## Vì sao `$inc` theo path thay vì `$set` full snapshot? (p2-01 §3.5, B1)
 *
 * Trước đây worker cộng dồn full state trong RAM rồi `$set` toàn doc mỗi tick. Ba hệ quả:
 *
 * 1. **Write amplification ~35×** — doc ~33KB (config Zod max cho tới 60KB) bị ghi lại
 *    toàn bộ cho 1 delta ~1KB. Với D≈120 kỳ/ngày → ~36GB oplog/ngày.
 * 2. **Buộc đọc baseline** trước khi ghi (25MB/phút **kể cả khi không ai cược**) — và
 *    baseline chỉ chứa top-K nên phần rơi khỏi top-K mất lịch sử → **drift**.
 * 3. **Lost-update** nếu lock hết hạn giữa tick: 2 writer `$set` từ 2 baseline khác nhau.
 *
 * `$inc` sửa cả ba: không cần baseline (nên không drift), delta nhỏ, và 2 writer `$inc`
 * cộng dồn đúng thay vì ghi đè nhau.
 *
 * ## Idempotent: watermark nằm CHUNG lệnh với `$inc`
 *
 * `$inc` không idempotent → mọi update phải có filter `lastEntryId: { $lt: batchMaxId }`.
 * Batch đã áp rồi thì filter không khớp → no-op. Xem `DeltaAccumulatedDoc` (§8.6 mongodb.mdc).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi field update đi qua method typed ở đây.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import type {
  KenoDrawBettingStatsDoc,
  KenoDrawBettingStatsEntity,
  KenoPlayTypeStat,
  OpsStatsConfig,
} from "@megawin/game-keno/entities";
import { docPath, MIN_OBJECT_ID } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document, UpdateFilter } from "mongodb";
import { BaseRepo } from "./base-repo";
import { BettingStatsMapper } from "../mappers/betting-stats-mapper";
import type { DrawStatsCursor, DrawStatsDelta } from "./types";

const f = docPath<KenoDrawBettingStatsDoc>();

export class BettingStatsRepository extends BaseRepo<
  KenoDrawBettingStatsEntity,
  BettingStatsMapper
> {
  constructor() {
    super({
      collName: KenoCollections.BettingStats,
      dataMapper: new BettingStatsMapper(),
    });
  }

  /** Đọc stats 1 kỳ — O(1) theo unique index `{ drawId }`. */
  async getByDrawId(drawId: string): Promise<KenoDrawBettingStatsEntity | null> {
    return await this.findOne({ drawId });
  }

  /**
   * Hàng đợi công việc của worker: mọi kỳ có stats doc chưa `final`.
   *
   * ## Vì sao đây là nguồn điều phối DUY NHẤT (thay `getUnfinishedDraws(status)`)?
   *
   * Trước p2-01 worker chia 2 nhánh theo **status draw**: `SalesOpen` → cộng delta,
   * `POST_CLOSE_STATUSES` → recompute full. Cách đó phụ thuộc việc worker **bắt kịp một cửa
   * sổ status tạm thời** — draw nhảy `SalesClosed → Published → Settling` nhanh hơn nhịp tick
   * là **mất dữ liệu**. Lọc theo **trạng thái CÔNG VIỆC** (`final`) bền với mọi tốc độ chuyển
   * status (p2-01 §3.5.4, checklist #13).
   *
   * Projection **siêu mỏng** (`drawId` + `lastEntryId`): accumulator là delta-only nên không
   * cần số liệu cũ → không kéo doc 33KB × D kỳ mỗi tick (R7, mongodb.mdc §8.4).
   *
   * `limit` bắt buộc: `findMany` mặc định cắt 500 doc — im lặng bỏ sót nếu D > 500.
   *
   * @param limit - Trần số kỳ xử lý 1 tick. Vượt trần → kỳ còn lại chờ tick sau (sort
   *   `drawId` asc để kỳ cũ nhất — sắp settle — được ưu tiên, không bị bỏ rơi).
   */
  async findNotFinal(limit: number = 500): Promise<DrawStatsCursor[]> {
    const docs = await this.findManyAsDocuments(
      { final: false },
      { projection: { _id: 0, drawId: 1, lastEntryId: 1 }, sort: { drawId: 1 }, limit },
    );

    return docs.map((d) => ({
      drawId: d.drawId as string,
      // `ensureDocs` seed `lastEntryId = MIN_OBJECT_ID` → doc mới cũng có string hợp lệ;
      // `getEntriesForStatsAfter` thấy `_id > MIN` = mọi entry ⇒ đọc từ đầu. Guard `typeof`
      // giữ cho data cũ (nếu có doc thiếu field) vẫn về undefined = từ đầu.
      lastEntryId: typeof d.lastEntryId === "string" ? d.lastEntryId : undefined,
    }));
  }

  /**
   * Cộng delta counters của 1 tick vào stats doc — `$inc` theo path + tiến watermark.
   *
   * IDEMPOTENT: filter có `lastEntryId: { $lt: batchMaxId }` nên batch đã áp rồi → không
   * khớp → no-op. `$inc` và `$set lastEntryId` nằm trong CÙNG 1 lệnh trên CÙNG 1 doc nên
   * nguyên tử — không có khe hở "đã cộng nhưng chưa tiến watermark".
   *
   * KHÔNG dùng `upsert` ở đây: doc phải được tạo trước bởi {@link ensureDocs} (upsert cùng
   * filter `$lt` sẽ đâm vào unique index → lỗi 11000, xem `DeltaAccumulatedDoc`). Tách 2
   * bước giữ ngữ nghĩa rõ: tạo doc là việc 1 lần/kỳ, cộng delta là việc mỗi tick.
   *
   * `topPotential` KHÔNG `$inc` được (mảng cần sort+cắt K) → `$push` với `$sort`/`$slice`,
   * để **Mongo tự sort+cắt phía server** (app không đọc mảng cũ). An toàn với top-K vì
   * `potentialWin` là metric BẤT BIẾN per-entry — entry rớt khỏi top-K thì mãi mãi không
   * cần quay lại (khác `topAccounts`/`topCombos` tích luỹ, xem `betting-stats.ts`).
   *
   * @param drawId - Kỳ cần cộng.
   * @param delta - Lượng cộng thêm (KHÔNG phải giá trị tuyệt đối).
   * @param batchMaxId - ObjectId hex của entry lớn nhất trong batch → watermark mới.
   * @param config - `ops.stats` — lấy `topPotentialK` để `$slice`.
   * @returns `true` nếu doc được cập nhật; `false` nếu batch đã áp trước đó (no-op).
   */
  async applyDelta(
    drawId: string,
    delta: DrawStatsDelta,
    batchMaxId: string,
    config: OpsStatsConfig,
  ): Promise<boolean> {
    const inc: Record<string, number> = {};

    // ── totals ──
    incBy(inc, f("totals.revenue"), delta.totals.revenue);
    incBy(inc, f("totals.entries"), delta.totals.entries);
    incBy(inc, f("totals.sets"), delta.totals.sets);
    incBy(inc, f("totals.commission"), delta.totals.commission);
    incBy(inc, f("totals.largeBetCount"), delta.totals.largeBetCount);

    // ── byPlayType: partial 2 tầng (side bet tách hướng) ──
    // Chỉ ghi key CÓ delta — tránh $inc cho cả 15 slot khi tick chỉ chạm 1–2 cái.
    for (const [key, stat] of Object.entries(delta.byPlayType)) {
      if (!stat) {
        continue;
      }
      if (isPlayTypeStat(stat)) {
        incPlayTypeStat(inc, `byPlayType.${key}`, stat);
        continue;
      }
      // bigSmall / evenOdd — tầng trong là các hướng cược.
      for (const [dir, dirStat] of Object.entries(stat)) {
        if (dirStat) {
          incPlayTypeStat(inc, `byPlayType.${key}.${dir}`, dirStat);
        }
      }
    }

    // ── numberFreq: chỉ số xuất hiện trong tick (không phải cả 80) ──
    for (const [num, stat] of Object.entries(delta.numberFreq)) {
      incBy(inc, `numberFreq.${num}.sets`, stat.sets);
      incBy(inc, `numberFreq.${num}.amount`, stat.amount);
    }

    // ── byTenant: chỉ tenant có cược trong tick ──
    for (const [tenantId, stat] of Object.entries(delta.byTenant)) {
      incBy(inc, `byTenant.${tenantId}.amount`, stat.amount);
      incBy(inc, `byTenant.${tenantId}.entries`, stat.entries);
      incBy(inc, `byTenant.${tenantId}.commission`, stat.commission);
    }

    // ── exposure: lưu RAW (chưa cap) — cap áp lúc build response (analysis §3.4) ──
    for (const [playType, raw] of Object.entries(delta.worstCaseByPlayType)) {
      incBy(inc, `exposure.worstCaseByPlayType.${playType}`, raw);
    }
    incBy(inc, f("exposure.worstCaseTotal"), delta.worstCaseTotal);
    incBy(inc, f("exposure.capSets.pick8"), delta.capSets.pick8);
    incBy(inc, f("exposure.capSets.pick9"), delta.capSets.pick9);
    incBy(inc, f("exposure.capSets.pick10"), delta.capSets.pick10);

    // Build từng operator vào 1 object thường rồi cast 1 lần: type `PushOperator` của driver
    // không mô tả nổi modifier `$each/$sort/$slice` khi key là computed path (docPath) —
    // cú pháp dưới đây là chuẩn Mongo cho "bounded top-K array".
    const update: Record<string, unknown> = {
      $set: { [f("lastEntryId")]: batchMaxId, [f("updatedAt")]: new Date() },
    };

    if (Object.keys(inc).length > 0) {
      update.$inc = inc;
    }

    // topPotential: Mongo sort desc + cắt K ngay trong lệnh ghi → app không đọc mảng cũ.
    if (delta.topPotential.length > 0) {
      update.$push = {
        [f("topPotential")]: {
          $each: delta.topPotential,
          $sort: { potentialWin: -1 },
          $slice: config.topPotentialK,
        },
      };
    }

    // IDEMPOTENT theo watermark: `ensureDocs` seed `lastEntryId = MIN_OBJECT_ID` nên `$lt`
    // luôn khớp lần áp đầu (mọi ObjectId thật > MIN), các batch kế `$lt` bỏ batch đã áp.
    return await this.updateOne(
      { drawId, [f("lastEntryId")]: { $lt: batchMaxId } },
      update as UpdateFilter<Document>,
    );
  }

  /**
   * Kỳ có stats doc ĐỔI kể từ `since` — hàng đợi của worker ops-alerts.
   *
   * Trigger theo `updatedAt` (bump bởi applyDelta/stampFinal): kỳ không có cược mới
   * thì đứng yên → 0 lần đánh giá lại. Trả FULL entity (evaluator cần totals + exposure
   * + byPlayType + topPotential — gần cả doc) — chi phí này trước đây nằm trong sync
   * worker (`getByDrawId` mỗi kỳ có delta), giờ chỉ trả cho doc thật sự đổi.
   *
   * Sort `updatedAt` ASC để cursor tiến tuần tự; `limit` chặn tick bận đột biến.
   * Index: `{ updatedAt: 1 }` (`idx_updatedAt`).
   *
   * Dùng `$gt` (KHÔNG `$gte`): doc trùng ms với cursor bị BỎ QUA, không phải đánh giá lại —
   * đúng ý (doc đó đã được đánh giá ở lần đọc trước, cursor mới bằng chính `updatedAt` của
   * nó). Khe hở lý thuyết: doc KHÁC đổi đúng ms = cursor giữa 2 lần đọc sẽ bị sót tới lần
   * bump kế tiếp của chính nó — mọi kỳ đều còn 1 lần bump cuối (`stampFinal`) nên không sót
   * vĩnh viễn (quyết định p0-02 §3.2, rủi ro #4).
   *
   * @param since - Cursor `updatedAt` lớn nhất đã đánh giá.
   * @param limit - Trần doc đánh giá 1 tick.
   */
  async findChangedSince(since: Date, limit: number): Promise<KenoDrawBettingStatsEntity[]> {
    return await this.findMany({ updatedAt: { $gt: since } }, { sort: { updatedAt: 1 }, limit });
  }

  /**
   * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent, no-op với kỳ đã tồn tại).
   *
   * Seed 3 field: `final` (trạng thái hàng đợi — phải tồn tại từ lúc enroll để
   * `findNotFinal`/`stampFinal` filter được) + `updatedAt` (cursor worker ops-alerts) +
   * `lastEntryId = MIN_OBJECT_ID` (watermark "từ đầu").
   * KHÔNG seed skeleton totals/byPlayType/exposure — `$inc` của applyDelta tự tạo mọi
   * path lồng còn thiếu; shape đầy đủ cho reader do {@link BettingStatsMapper} normalize
   * bảo đảm PHÍA ĐỌC (analysis keno-stats-worker-simplification §5.5: default 1 nơi duy
   * nhất, schema evolution không cần migration).
   *
   * Gom 1 bulkWrite (mongodb.mdc §8.8). `lastEntryId = MIN_OBJECT_ID` (không để field vắng):
   * `getEntriesForStatsAfter` thấy `_id > MIN` = mọi entry ⇒ đọc từ đầu; `applyDelta` `$lt`
   * khớp batch ĐẦU (Mongo `$lt: <string>` KHÔNG khớp field thiếu do type-bracketing — nên
   * PHẢI seed sentinel thay vì bỏ trống).
   *
   * @param drawIds - Các kỳ chưa hoàn thành cần có mặt trong hàng đợi `final: false`.
   */
  async ensureDocs(drawIds: string[]): Promise<void> {
    if (drawIds.length === 0) {
      return;
    }

    const ops: AnyBulkWriteOperation<Document>[] = drawIds.map((drawId) => ({
      updateOne: {
        filter: { drawId },
        update: {
          $setOnInsert: {
            [f("final")]: false,
            [f("updatedAt")]: new Date(),
            [f("lastEntryId")]: MIN_OBJECT_ID,
          },
        },
        upsert: true,
      },
    }));

    await this.bulkWrite(ops, { ordered: false });
  }

  /**
   * Đóng dấu `final: true` — worker ngừng quét kỳ này.
   *
   * CHỈ gọi khi draw ở trạng thái **TERMINAL** (`Settled` | `Void`). KHÔNG gọi ở
   * `SalesClosed`: đó là trạng thái TẠM, kỳ có thể mở bán lại (`SalesClosed → SalesOpen`)
   * và phần cược sau đó sẽ không bao giờ được cộng (p2-01 §3.5.2, checklist #12).
   *
   * ## KHÔNG có `resetFinal` đối xứng — và ĐỪNG thêm lại
   *
   * Từng có `resetFinal(drawId)` (chỉ `$set final:false`) với ý "cho vận hành tính lại kỳ".
   * Đã xoá 02/08/2026: **0 caller, và không làm được việc nó tự nhận**. Kiến trúc `$inc` +
   * watermark khiến flip `final` trở thành no-op — `findNotFinal` trả kỳ đó kèm `lastEntryId`
   * vẫn ở mức cao nhất → `getEntriesForStatsAfter` trả 0 entry → `drained:true` → tick sau
   * `stampFinal` lại. Không có gì được tính lại.
   *
   * Cạm bẫy thật nằm ở bước "sửa" tiếp theo: thấy no-op nên reset luôn `lastEntryId` → counter
   * `$inc` chưa bị xoá nên **cộng đôi toàn bộ kỳ**. Recompute trong kiến trúc delta buộc phải
   * zero counter + reset watermark trong CÙNG 1 update (và xoá doc ở 3 collection phụ) — xem
   * `keno-stats-worker-simplification.analysis.md` §5.3.1. Thừa hưởng từ thời `$set` full
   * snapshot, nơi rescan-từ-đầu tự ghi đè nên `final:false` là đủ.
   */
  async stampFinal(drawId: string): Promise<void> {
    await this.updateOne(
      { drawId, [f("final")]: false },
      { $set: { [f("final")]: true, [f("updatedAt")]: new Date() } },
    );
  }
}

/** Chỉ thêm key vào `$inc` khi delta khác 0 — tránh ghi field rác/no-op. */
function incBy(inc: Record<string, number>, path: string, value: number): void {
  if (value !== 0) {
    inc[path] = (inc[path] ?? 0) + value;
  }
}

/** `$inc` 2 field của 1 `KenoPlayTypeStat` tại `basePath`. */
function incPlayTypeStat(
  inc: Record<string, number>,
  basePath: string,
  stat: KenoPlayTypeStat,
): void {
  incBy(inc, `${basePath}.amount`, stat.amount);
  incBy(inc, `${basePath}.sets`, stat.sets);
}

/**
 * Phân biệt slot lá (`pick1..pick10` → `KenoPlayTypeStat`) với slot lồng
 * (`bigSmall`/`evenOdd` → map hướng cược). Nhận diện bằng sự hiện diện của `amount`.
 */
function isPlayTypeStat(value: object): value is KenoPlayTypeStat {
  return typeof (value as KenoPlayTypeStat).amount === "number";
}
