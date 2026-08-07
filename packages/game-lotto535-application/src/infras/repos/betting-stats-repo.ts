/**
 * Lotto 5/35 – Draw Betting Stats Repository
 *
 * Collection: lotto535_draw_betting_stats — 1 doc/draw, pre-aggregated ops stats.
 *
 * ĐỌC: `findByDrawId` → O(1) cho backoffice ops dashboard.
 * GHI: `applyDelta` — `$inc` theo path cố định + `$set lastEntryId` trong CÙNG 1 lệnh.
 *
 * Port nguyên kiến trúc từ Power 6/55 (`betting-stats-repo.ts`, xem JSDoc gốc cho lý giải
 * đầy đủ `$inc` theo path thay `$set` full snapshot + idempotent watermark). KHÁC Power
 * 6/55: `byPlayType` 13 key cố định (`Lotto535StatsPlayKey`, không phải 12); `exposure`
 * cũng chỉ 1 field `fixedWorstCase` (jackpot đọc snapshot pool lúc build response —
 * GIỐNG Power 6/55, KHÁC Keno).
 *
 * RULE: use case KHÔNG biết cấu trúc Mongo — mọi field update đi qua method typed ở đây.
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import type {
  Lotto535DrawBettingStatsDoc,
  Lotto535DrawBettingStatsEntity,
  Lotto535PlayTypeStat,
  Lotto535TopPotential,
} from "@megawin/game-lotto535/entities";
import { docPath, MIN_OBJECT_ID } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document, UpdateFilter } from "mongodb";
import { BaseRepo } from "./base-repo";
import { BettingStatsMapper } from "../mappers/betting-stats-mapper";
import type { DrawStatsCursor, DrawStatsDelta } from "./types";

const f = docPath<Lotto535DrawBettingStatsDoc>();

export class BettingStatsRepository extends BaseRepo<
  Lotto535DrawBettingStatsEntity,
  BettingStatsMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.DrawBettingStats,
      dataMapper: new BettingStatsMapper(),
    });
  }

  /** Đọc stats 1 kỳ — O(1) theo unique index `{ drawId }`. */
  async findByDrawId(drawId: string): Promise<Lotto535DrawBettingStatsEntity | null> {
    return await this.findOne({ drawId });
  }

  /**
   * Hàng đợi công việc của worker: mọi kỳ có stats doc chưa `final`.
   *
   * Lọc theo **trạng thái CÔNG VIỆC** (`final`), KHÔNG theo status draw — bền với mọi tốc
   * độ chuyển status (xem JSDoc gốc Keno §3.5.4 cho lý giải đầy đủ).
   *
   * Projection **siêu mỏng** (`drawId` + `lastEntryId`): accumulator là delta-only nên
   * không cần số liệu cũ.
   *
   * `limit` bắt buộc: `findMany` mặc định cắt 500 doc — im lặng bỏ sót nếu D > 500.
   *
   * @param limit - Trần số kỳ xử lý 1 tick.
   */
  async findNotFinal(limit: number = 500): Promise<DrawStatsCursor[]> {
    const docs = await this.findManyAsDocuments(
      { final: false },
      { projection: { _id: 0, drawId: 1, lastEntryId: 1 }, sort: { drawId: 1 }, limit },
    );

    return docs.map((d) => ({
      drawId: d.drawId as string,
      // `ensureDocs` seed `lastEntryId = MIN_OBJECT_ID` → doc mới cũng có string hợp lệ;
      // `getEntriesForStatsAfter` thấy `_id > MIN` = mọi entry ⇒ đọc từ đầu.
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
   * KHÔNG dùng `upsert` ở đây: doc phải được tạo trước bởi {@link ensureDocs}.
   *
   * `topPotential` KHÔNG `$inc` được (mảng cần sort+cắt K) → `$push` với `$sort`/`$slice`,
   * để Mongo tự sort+cắt phía server. An toàn với top-K vì `fixedPotential` là metric BẤT
   * BIẾN per-entry.
   *
   * @param drawId - Kỳ cần cộng.
   * @param delta - Lượng cộng thêm (KHÔNG phải giá trị tuyệt đối).
   * @param batchMaxId - ObjectId hex của entry lớn nhất trong batch → watermark mới.
   * @param topPotentialK - `ops.stats.topPotentialK` — trần `$slice` cho `topPotential`.
   * @returns `true` nếu doc được cập nhật; `false` nếu batch đã áp trước đó (no-op).
   */
  async applyDelta(
    drawId: string,
    delta: DrawStatsDelta,
    batchMaxId: string,
    topPotentialK: number,
  ): Promise<boolean> {
    const inc: Record<string, number> = {};

    // ── totals ──
    incBy(inc, f("totals.revenue"), delta.totals.revenue);
    incBy(inc, f("totals.entries"), delta.totals.entries);
    incBy(inc, f("totals.sets"), delta.totals.sets);
    incBy(inc, f("totals.commission"), delta.totals.commission);
    incBy(inc, f("totals.largeBetCount"), delta.totals.largeBetCount);

    // ── byPlayType: partial 1 tầng — chỉ ghi key CÓ delta trong tick ──
    for (const [key, stat] of Object.entries(delta.byPlayType)) {
      if (stat) {
        incPlayTypeStat(inc, `byPlayType.${key}`, stat);
      }
    }

    // ── byTenant: chỉ tenant có cược trong tick ──
    for (const [tenantId, stat] of Object.entries(delta.byTenant)) {
      incBy(inc, `byTenant.${tenantId}.amount`, stat.amount);
      incBy(inc, `byTenant.${tenantId}.entries`, stat.entries);
      incBy(inc, `byTenant.${tenantId}.commission`, stat.commission);
    }

    // ── exposure: chỉ phần fixed — jackpot đọc snapshot pool lúc build response ──
    incBy(inc, f("exposure.fixedWorstCase"), delta.fixedWorstCase);

    // Build từng operator vào 1 object thường rồi cast 1 lần: type `PushOperator` của driver
    // không mô tả nổi modifier `$each/$sort/$slice` khi key là computed path (docPath).
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
          $each: delta.topPotential satisfies Lotto535TopPotential[],
          $sort: { fixedPotential: -1 },
          $slice: topPotentialK,
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
   * Trigger theo `updatedAt` (bump bởi applyDelta/stampFinal): kỳ không có cược mới thì
   * đứng yên → 0 lần đánh giá lại. Trả FULL entity (evaluator cần totals + exposure +
   * byPlayType + topPotential — gần cả doc).
   *
   * Sort `updatedAt` ASC để cursor tiến tuần tự; `limit` chặn tick bận đột biến.
   * Index: `{ updatedAt: 1 }` (`idx_updatedAt`).
   *
   * Dùng `$gt` (KHÔNG `$gte`): xem JSDoc gốc Keno cho lý giải khe hở lý thuyết đã chấp nhận.
   *
   * @param since - Cursor `updatedAt` lớn nhất đã đánh giá.
   * @param limit - Trần doc đánh giá 1 tick.
   */
  async findChangedSince(since: Date, limit: number): Promise<Lotto535DrawBettingStatsEntity[]> {
    return await this.findMany({ updatedAt: { $gt: since } }, { sort: { updatedAt: 1 }, limit });
  }

  /**
   * Tạo doc stats TỐI THIỂU cho kỳ chưa có (idempotent, no-op với kỳ đã tồn tại).
   *
   * Seed 3 field: `final` (trạng thái hàng đợi) + `updatedAt` (cursor worker ops-alerts) +
   * `lastEntryId = MIN_OBJECT_ID` (watermark "từ đầu"). KHÔNG seed skeleton
   * totals/byPlayType/exposure — `$inc` của `applyDelta` tự tạo mọi path lồng còn thiếu;
   * shape đầy đủ cho reader do {@link BettingStatsMapper} normalize bảo đảm phía đọc.
   *
   * Gom 1 bulkWrite.
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
   * `SalesClosed` — trạng thái đó là TẠM, kỳ có thể mở bán lại.
   *
   * KHÔNG có `resetFinal` đối xứng — xem JSDoc gốc Keno cho lý do (kiến trúc `$inc` +
   * watermark khiến reset không tính lại được gì, mà có rủi ro cộng đôi nếu sửa sai).
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

/** `$inc` 3 field của 1 `Lotto535PlayTypeStat` tại `basePath`. */
function incPlayTypeStat(
  inc: Record<string, number>,
  basePath: string,
  stat: Lotto535PlayTypeStat,
): void {
  incBy(inc, `${basePath}.amount`, stat.amount);
  incBy(inc, `${basePath}.sets`, stat.sets);
  incBy(inc, `${basePath}.boards`, stat.boards);
}
