/**
 * Max 3D – Draw Betting Stats Repository
 *
 * Collection: max3d_draw_betting_stats — 1 doc/draw, pre-aggregated ops stats.
 *
 * ĐỌC: `findOne({ drawId })` → O(1) cho backoffice ops dashboard.
 * GHI: `applyDelta` — `$inc` theo path cố định + `$set lastEntryId` trong CÙNG 1 lệnh.
 *
 * ## Vì sao `$inc` theo path thay vì `$set` full snapshot? (p0-01, gộp p2-01 Keno)
 *
 * Trước đây worker cộng dồn full state trong RAM rồi `$set` toàn doc mỗi tick. Ba hệ quả:
 *
 * 1. **Write amplification lớn** — `tripletStakes` sparse ≤1000 key ≈ 80KB bị ghi lại
 *    TOÀN BỘ mỗi 30s dù chỉ 1 triplet đổi.
 * 2. **Buộc đọc baseline** trước khi ghi — và baseline chỉ chứa top-K (`topPairs`/`topAccounts`)
 *    nên phần rơi khỏi top-K mất lịch sử → **drift**.
 * 3. **Lost-update** nếu lock hết hạn giữa tick: 2 writer `$set` từ 2 baseline khác nhau.
 *
 * `$inc` sửa cả ba: không cần baseline (nên không drift), delta nhỏ (chỉ triplet có delta),
 * và 2 writer `$inc` cộng dồn đúng thay vì ghi đè nhau.
 *
 * ## Idempotent: watermark nằm CHUNG lệnh với `$inc`
 *
 * `$inc` không idempotent → mọi update phải có filter `lastEntryId: { $lt: batchMaxId }`.
 * Batch đã áp rồi thì filter không khớp → no-op. Xem `DeltaAccumulatedDoc` (§8.6 mongodb.mdc).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi field update đi qua method typed ở đây.
 */

import { docPath, MIN_OBJECT_ID } from "@megawin/data/mongo";
import type {
  Max3dDrawBettingStatsDoc,
  Max3dDrawBettingStatsEntity,
  Max3dPlayTypeStat,
  OpsStatsConfig,
} from "@megawin/game-max3d/entities";
import { Max3dCollections } from "@megawin/game-max3d/entities";
import type { AnyBulkWriteOperation, Document, UpdateFilter } from "mongodb";

import { BettingStatsMapper } from "../mappers/betting-stats-mapper";
import { BaseRepo } from "./base-repo";
import type { DrawStatsCursor, DrawStatsDelta } from "./types";

const f = docPath<Max3dDrawBettingStatsDoc>();

export class BettingStatsRepository extends BaseRepo<Max3dDrawBettingStatsEntity, BettingStatsMapper> {
  constructor() {
    super({
      collName: Max3dCollections.BettingStats,
      dataMapper: new BettingStatsMapper(),
    });
  }

  /** Đọc stats 1 kỳ — O(1) theo unique index `{ drawId }`. */
  async getByDrawId(drawId: string): Promise<Max3dDrawBettingStatsEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Đọc stats nhiều kỳ 1 lần — dùng bởi reader cần nhiều draw 1 lượt (VD ops snapshot). */
  async getManyByDrawIds(drawIds: string[]): Promise<Max3dDrawBettingStatsEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany({ drawId: { $in: drawIds } });
  }

  /**
   * Hàng đợi công việc của worker: mọi kỳ có stats doc chưa `final`.
   *
   * ## Vì sao đây là nguồn điều phối DUY NHẤT (thay chia nhánh theo status draw)?
   *
   * Trước p0-01 worker chia 2 nhánh theo **status draw**: `SalesOpen` → cộng delta,
   * `POST_CLOSE_STATUSES` → recompute full. Cách đó phụ thuộc việc worker **bắt kịp một cửa
   * sổ status tạm thời** — draw nhảy `SalesClosed → Published → Settling` nhanh hơn nhịp tick
   * là **mất dữ liệu**. Lọc theo **trạng thái CÔNG VIỆC** (`final`) bền với mọi tốc độ chuyển
   * status.
   *
   * Projection **siêu mỏng** (`drawId` + `lastEntryId`): accumulator là delta-only nên không
   * cần số liệu cũ → không kéo doc nặng × D kỳ mỗi tick (mongodb.mdc §8.4).
   *
   * `limit` bắt buộc: `findMany` mặc định cắt 500 doc — im lặng bỏ sót nếu D > 500.
   *
   * @param limit - Trần số kỳ xử lý 1 tick. Vượt trần → kỳ còn lại chờ tick sau (sort
   *   `drawId` asc để kỳ cũ nhất — sắp settle — được ưu tiên, không bị bỏ rơi).
   */
  async findNotFinal(limit = 500): Promise<DrawStatsCursor[]> {
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
   * cần quay lại.
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

    // ── byPlayType: 4 nhóm PHẲNG (basicStraight/basicCombo3/basicCombo6/plus) ──
    // Chỉ ghi nhóm CÓ delta — tránh $inc cho cả 4 slot khi tick chỉ chạm 1–2 cái.
    for (const [key, stat] of Object.entries(delta.byPlayType)) {
      if (stat) {
        incPlayTypeStat(inc, `byPlayType.${key}`, stat);
      }
    }

    // ── tripletStakes: sparse — CHỈ triplet có delta trong tick (không phải cả 1000 key) ──
    for (const [triplet, stake] of Object.entries(delta.tripletStakes)) {
      incBy(inc, `tripletStakes.${triplet}.straightUnits`, stake.straightUnits);
      incBy(inc, `tripletStakes.${triplet}.combo3Units`, stake.combo3Units);
      incBy(inc, `tripletStakes.${triplet}.combo6Units`, stake.combo6Units);
      incBy(inc, `tripletStakes.${triplet}.amount`, stake.amount);
      incBy(inc, `tripletStakes.${triplet}.boards`, stake.boards);
    }

    // ── byTenant: chỉ tenant có cược trong tick ──
    for (const [tenantId, stat] of Object.entries(delta.byTenant)) {
      incBy(inc, `byTenant.${tenantId}.amount`, stat.amount);
      incBy(inc, `byTenant.${tenantId}.entries`, stat.entries);
      incBy(inc, `byTenant.${tenantId}.commission`, stat.commission);
    }

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
    return await this.updateOne({ drawId, [f("lastEntryId")]: { $lt: batchMaxId } }, update as UpdateFilter<Document>);
  }

  /**
   * Kỳ có stats doc ĐỔI kể từ `since` — hàng đợi của worker ops-alerts (p0-02).
   *
   * Trigger theo `updatedAt` (bump bởi applyDelta/stampFinal): kỳ không có cược mới thì đứng
   * yên → 0 lần đánh giá lại. Trả FULL entity (evaluator cần totals + tripletStakes +
   * byPlayType + topPotential — gần cả doc).
   *
   * Sort `updatedAt` ASC để cursor tiến tuần tự; `limit` chặn tick bận đột biến.
   * Index: `{ updatedAt: 1 }` (`idx_updatedAt`, p0-02).
   *
   * Dùng `$gt` (KHÔNG `$gte`): doc trùng ms với cursor bị BỎ QUA, không phải đánh giá lại —
   * đúng ý (doc đó đã được đánh giá ở lần đọc trước, cursor mới bằng chính `updatedAt` của
   * nó). Khe hở lý thuyết: doc KHÁC đổi đúng ms = cursor giữa 2 lần đọc sẽ bị sót tới lần
   * bump kế tiếp của chính nó — mọi kỳ đều còn 1 lần bump cuối (`stampFinal`) nên không sót
   * vĩnh viễn.
   *
   * @param since - Cursor `updatedAt` lớn nhất đã đánh giá.
   * @param limit - Trần doc đánh giá 1 tick.
   */
  async findChangedSince(since: Date, limit: number): Promise<Max3dDrawBettingStatsEntity[]> {
    return await this.findMany({ updatedAt: { $gt: since } }, { sort: { updatedAt: 1 }, limit });
  }

  /**
   * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent, no-op với kỳ đã tồn tại).
   *
   * Seed 3 field: `final` (trạng thái hàng đợi — phải tồn tại từ lúc enroll để
   * `findNotFinal`/`stampFinal` filter được) + `updatedAt` (cursor worker ops-alerts) +
   * `lastEntryId = MIN_OBJECT_ID` (watermark "từ đầu").
   * KHÔNG seed skeleton totals/byPlayType — `$inc` của applyDelta tự tạo mọi path lồng còn
   * thiếu; shape đầy đủ cho reader do {@link BettingStatsMapper} normalize bảo đảm PHÍA ĐỌC
   * (p0-04: default 1 nơi duy nhất, schema evolution không cần migration).
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
   * và phần cược sau đó sẽ không bao giờ được cộng.
   *
   * ## KHÔNG có `resetFinal` đối xứng — và ĐỪNG thêm lại
   *
   * Kiến trúc `$inc` + watermark khiến flip `final` trở thành no-op — `findNotFinal` trả kỳ
   * đó kèm `lastEntryId` vẫn ở mức cao nhất → `getEntriesForStatsAfter` trả 0 entry →
   * `drained:true` → tick sau `stampFinal` lại. Không có gì được tính lại.
   *
   * Cạm bẫy thật nằm ở bước "sửa" tiếp theo: thấy no-op nên reset luôn `lastEntryId` → counter
   * `$inc` chưa bị xoá nên **cộng đôi toàn bộ kỳ**. Recompute trong kiến trúc delta buộc phải
   * zero counter + reset watermark trong CÙNG 1 update (và xoá doc ở collection phụ) — chi
   * phí không đáng, xem Keno `keno-stats-worker-simplification.analysis.md` §5.3.1.
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

/** `$inc` 4 field của 1 `Max3dPlayTypeStat` tại `basePath`. */
function incPlayTypeStat(inc: Record<string, number>, basePath: string, stat: Max3dPlayTypeStat): void {
  incBy(inc, `${basePath}.amount`, stat.amount);
  incBy(inc, `${basePath}.units`, stat.units);
  incBy(inc, `${basePath}.boards`, stat.boards);
  incBy(inc, `${basePath}.entries`, stat.entries);
}
