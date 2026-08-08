/**
 * Max 3D Pro – Draw Betting Stats Repository
 *
 * Collection: max3dpro_draw_betting_stats — 1 doc/draw, pre-aggregated ops stats.
 *
 * ĐỌC: `findOne({ drawId })` → O(1) cho backoffice ops dashboard.
 * GHI: `applyDelta` — `$inc` theo path cố định + `$set lastEntryId` trong CÙNG 1 lệnh.
 *
 * ## Vì sao `$inc` theo path thay vì `$set` full snapshot? (p0-01/p0-02)
 *
 * Bản trước worker cộng dồn full state trong RAM rồi `upsertFull` toàn doc mỗi tick. Hệ quả:
 * write amplification (doc ~80–100KB ghi lại cho 1 delta nhỏ), buộc đọc baseline trước khi
 * ghi (kể cả khi không ai cược), và top-K trong doc bị **drift** vì phần rơi ngoài K mất
 * lịch sử. `$inc` sửa cả ba: không cần baseline (nên không drift), delta nhỏ, cộng dồn
 * nguyên tử.
 *
 * ## Idempotent: watermark nằm CHUNG lệnh với `$inc`
 *
 * `$inc` không idempotent → mọi update phải có filter `lastEntryId: { $lt: batchMaxId }`.
 * Batch đã áp rồi thì filter không khớp → no-op. Xem `DeltaAccumulatedDoc` (mongodb.mdc §8.6).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi field update đi qua method typed ở đây.
 */

import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type {
  Max3dproDrawBettingStatsDoc,
  Max3dproDrawBettingStatsEntity,
  Max3dproPlayTypeStat,
  OpsStatsConfig,
} from "@megawin/game-max3dpro/entities";
import { docPath, MIN_OBJECT_ID } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document, UpdateFilter } from "mongodb";
import { BaseRepo } from "./base-repo";
import { BettingStatsMapper } from "../mappers/betting-stats-mapper";
import type { DrawStatsCursor, Max3dproStatsDelta } from "./types";

const f = docPath<Max3dproDrawBettingStatsDoc>();

export class BettingStatsRepository extends BaseRepo<Max3dproDrawBettingStatsEntity, BettingStatsMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.BettingStats,
      dataMapper: new BettingStatsMapper(),
    });
  }

  /** Đọc stats 1 kỳ — O(1) theo unique index `{ drawId }`. */
  async getByDrawId(drawId: string): Promise<Max3dproDrawBettingStatsEntity | null> {
    return await this.findOne({ drawId });
  }

  /**
   * Hàng đợi công việc của worker: mọi kỳ có stats doc chưa `final`.
   *
   * Nguồn điều phối DUY NHẤT (thay `getUnfinishedDraws(status)`) — lọc theo **trạng thái
   * CÔNG VIỆC** (`final`) bền với mọi tốc độ chuyển status draw. Projection SIÊU MỎNG
   * (`drawId` + `lastEntryId`): accumulator delta-only không cần số liệu cũ.
   *
   * @param limit - Trần số kỳ xử lý 1 tick. Vượt trần → kỳ còn lại chờ tick sau (sort
   *   `drawId` asc để kỳ cũ nhất — sắp settle — được ưu tiên).
   */
  async findNotFinal(limit: number = 500): Promise<DrawStatsCursor[]> {
    const docs = await this.findManyAsDocuments(
      { final: false },
      { projection: { _id: 0, drawId: 1, lastEntryId: 1 }, sort: { drawId: 1 }, limit },
    );

    return docs.map((d) => ({
      drawId: d.drawId as string,
      // `ensureDocs` seed `lastEntryId = MIN_OBJECT_ID` → `_id > MIN` = đọc từ đầu; guard
      // `typeof` giữ cho data cũ (doc thiếu field) vẫn về undefined = từ đầu.
      lastEntryId: typeof d.lastEntryId === "string" ? d.lastEntryId : undefined,
    }));
  }

  /**
   * Cộng delta counters của 1 tick vào stats doc — `$inc` theo path + tiến watermark.
   *
   * IDEMPOTENT: filter có `lastEntryId: { $lt: batchMaxId }` nên batch đã áp rồi → không
   * khớp → no-op. `$inc` và `$set lastEntryId` nằm trong CÙNG 1 lệnh trên CÙNG 1 doc nên
   * nguyên tử.
   *
   * KHÔNG dùng `upsert` ở đây: doc phải được tạo trước bởi {@link ensureDocs} (upsert cùng
   * filter `$lt` sẽ đâm vào unique index → lỗi 11000).
   *
   * `topPotential` KHÔNG `$inc` được (mảng cần sort+cắt K) → `$push` với `$sort`/`$slice`
   * để Mongo tự sort+cắt phía server. An toàn với top-K vì `potentialWin` là metric BẤT
   * BIẾN per-entry (khác `topPairs`/`topAccounts` tích luỹ, dời sang collection riêng).
   *
   * @param drawId - Kỳ cần cộng.
   * @param delta - Lượng cộng thêm (KHÔNG phải giá trị tuyệt đối).
   * @param batchMaxId - ObjectId hex của entry lớn nhất trong batch → watermark mới.
   * @param config - `ops.stats` — lấy `topPotentialK` để `$slice`.
   * @returns `true` nếu doc được cập nhật; `false` nếu batch đã áp trước đó (no-op).
   */
  async applyDelta(
    drawId: string,
    delta: Max3dproStatsDelta,
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

    // ── byPlayType: 2 mode cố định — chỉ ghi mode CÓ delta ──
    for (const [key, stat] of Object.entries(delta.byPlayType)) {
      if (stat) {
        incPlayTypeStat(inc, `byPlayType.${key}`, stat);
      }
    }

    // ── tripletStakes: chỉ triplet xuất hiện trong tick ──
    for (const [triplet, stake] of Object.entries(delta.tripletStakes)) {
      incBy(inc, `tripletStakes.${triplet}.units`, stake.units);
      incBy(inc, `tripletStakes.${triplet}.amount`, stake.amount);
      incBy(inc, `tripletStakes.${triplet}.boards`, stake.boards);
    }

    // ── byTenant: chỉ tenant có cược trong tick ──
    for (const [tenantId, stat] of Object.entries(delta.byTenant)) {
      incBy(inc, `byTenant.${tenantId}.amount`, stat.amount);
      incBy(inc, `byTenant.${tenantId}.entries`, stat.entries);
      incBy(inc, `byTenant.${tenantId}.commission`, stat.commission);
    }

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
   * Kỳ có stats doc ĐỔI kể từ `since` — hàng đợi của worker ops-alerts.
   *
   * Trigger theo `updatedAt` (bump bởi applyDelta/stampFinal): kỳ không có cược mới thì
   * đứng yên → 0 lần đánh giá lại. Trả FULL entity (evaluator cần totals + topPotential +
   * byPlayType). Sort `updatedAt` ASC; `limit` chặn tick bận đột biến. Index `idx_updatedAt`.
   *
   * Dùng `$gt` (KHÔNG `$gte`): doc trùng ms với cursor bị BỎ QUA (đã đánh giá lần trước).
   * Mọi kỳ đều còn 1 lần bump cuối (`stampFinal`) nên không sót vĩnh viễn.
   *
   * @param since - Cursor `updatedAt` lớn nhất đã đánh giá.
   * @param limit - Trần doc đánh giá 1 tick.
   */
  async findChangedSince(since: Date, limit: number): Promise<Max3dproDrawBettingStatsEntity[]> {
    return await this.findMany({ updatedAt: { $gt: since } }, { sort: { updatedAt: 1 }, limit });
  }

  /**
   * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent, no-op với kỳ đã tồn tại).
   *
   * Seed 3 field: `final` (trạng thái hàng đợi — phải tồn tại từ lúc enroll để
   * `findNotFinal`/`stampFinal` filter được) + `updatedAt` (cursor worker ops-alerts) +
   * `lastEntryId = MIN_OBJECT_ID` (watermark "từ đầu").
   * KHÔNG seed skeleton totals/byPlayType — `$inc` của applyDelta tự tạo mọi path lồng còn
   * thiếu; shape đầy đủ cho reader do {@link BettingStatsMapper} normalize bảo đảm phía đọc.
   *
   * Gom 1 bulkWrite. `lastEntryId = MIN_OBJECT_ID` (không để field vắng): `getEntriesForStatsAfter`
   * thấy `_id > MIN` = mọi entry ⇒ đọc từ đầu; `applyDelta` `$lt` khớp batch ĐẦU (Mongo
   * `$lt: <string>` KHÔNG khớp field thiếu do type-bracketing — nên PHẢI seed sentinel).
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

/** `$inc` 4 field của 1 `Max3dproPlayTypeStat` tại `basePath`. */
function incPlayTypeStat(inc: Record<string, number>, basePath: string, stat: Max3dproPlayTypeStat): void {
  incBy(inc, `${basePath}.amount`, stat.amount);
  incBy(inc, `${basePath}.units`, stat.units);
  incBy(inc, `${basePath}.boards`, stat.boards);
  incBy(inc, `${basePath}.entries`, stat.entries);
}
