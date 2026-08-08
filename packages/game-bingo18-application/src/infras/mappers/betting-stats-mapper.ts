/**
 * Bingo 18 – Betting Stats Mapper (Doc → Entity, full-shape normalize)
 *
 * `ensureDocs` (p0-01/p0-04) chỉ seed `{final, updatedAt}` — `applyDelta` `$inc` tự tạo mọi
 * path lồng còn thiếu KHI CÓ delta chạm tới, nên doc thật trong Mongo có thể thiếu bất kỳ
 * nhánh nào của `totals`/`byPlayType`/`byTenant` (kỳ chưa ai cược side đó). Mapper là nơi
 * DUY NHẤT bảo đảm shape đầy đủ cho reader — default nằm ở đây, KHÔNG rải `?? 0` khắp UI/
 * use-case đọc.
 *
 * Field-explicit + `satisfies` (KHÔNG `{...rest} as Entity`): entity thêm field mới →
 * compiler bắt thiếu nhánh normalize ngay, tránh runtime `undefined` âm thầm.
 */

import { MongoMapper } from "@megawin/data/mongo";
import type {
  Bingo18BucketStat,
  Bingo18ByPlayType,
  Bingo18DrawBettingStatsEntity,
} from "@megawin/game-bingo18/entities";
import type { DrawBettingTotals, TenantBettingStat } from "@megawin/game-core/types";
import type { Document } from "mongodb";

/** Key số "1".."6" — singleNum/doubleMatch/tripleMatch.specific. */
const NUMBER_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

/** Key tổng "3".."18" — sumTotal. */
const SUM_KEYS = Array.from({ length: 16 }, (_, i) => String(i + 3));

/** Doc `bingo18_draw_betting_stats` → entity full-shape (ObjectId → id hex). */
export class BettingStatsMapper extends MongoMapper<Document, Bingo18DrawBettingStatsEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): Bingo18DrawBettingStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      final: doc.final ?? false,
      // KHÔNG default: field thiếu (doc mới, applyDelta chưa chạy) phải giữ `undefined` —
      // `applyDelta`/`stampFinal` filter `$lt`/`findChangedSince $gt` coi missing = null,
      // default giả (epoch/chuỗi rỗng) sẽ đổi kết quả so khớp ở tầng repo.
      lastEntryId: doc.lastEntryId,
      updatedAt: doc.updatedAt,
      totals: normalizeTotals(doc.totals),
      byPlayType: normalizeByPlayType(doc.byPlayType),
      byTenant: normalizeByTenant(doc.byTenant),
      topPotential: doc.topPotential ?? [],
    } satisfies Bingo18DrawBettingStatsEntity;
  }
}

/** `totals` thiếu (kỳ mới, chưa cược) → 0 mọi field. */
function normalizeTotals(raw: unknown): DrawBettingTotals {
  const r = (raw ?? {}) as Partial<DrawBettingTotals>;
  return {
    revenue: r.revenue ?? 0,
    entries: r.entries ?? 0,
    sets: r.sets ?? 0,
    commission: r.commission ?? 0,
    largeBetCount: r.largeBetCount ?? 0,
  };
}

/** `byTenant` thiếu key nào → key đó không xuất hiện (Record rời rạc theo tenant có cược). */
function normalizeByTenant(raw: unknown): Record<string, TenantBettingStat> {
  const r = (raw ?? {}) as Record<string, Partial<TenantBettingStat> | undefined>;
  const out: Record<string, TenantBettingStat> = {};
  for (const [tenantId, stat] of Object.entries(r)) {
    out[tenantId] = {
      amount: stat?.amount ?? 0,
      entries: stat?.entries ?? 0,
      commission: stat?.commission ?? 0,
    };
  }
  return out;
}

/** 1 bucket thiếu → zero-bucket. */
function normalizeBucket(raw: unknown): Bingo18BucketStat {
  const r = (raw ?? {}) as Partial<Bingo18BucketStat>;
  return { amount: r.amount ?? 0, sets: r.sets ?? 0, entries: r.entries ?? 0 };
}

/** Record đủ `keys`, merge bucket có sẵn trong doc lên nền zero — FE luôn render đủ grid. */
function fillBucketRecord(raw: unknown, keys: readonly string[]): Record<string, Bingo18BucketStat> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, Bingo18BucketStat> = {};
  for (const key of keys) {
    out[key] = normalizeBucket(r[key]);
  }
  return out;
}

/**
 * `byPlayType` thiếu bất kỳ nhánh nào (doc chỉ có nhánh delta đã chạm) → full 38 bucket,
 * nhánh thiếu = zero-bucket. Đây là single source normalize phía đọc — key số/tổng dùng
 * chung `NUMBER_KEYS`/`SUM_KEYS` với `createEmptyByPlayType` (`rules/stats-shape.ts`, dùng
 * cho nơi cần khung rỗng thuần, ví dụ test) để tránh 2 định nghĩa "đủ 38 bucket" lệch nhau.
 */
function normalizeByPlayType(raw: unknown): Bingo18ByPlayType {
  const r = (raw ?? {}) as Partial<Bingo18ByPlayType>;
  return {
    singleNum: fillBucketRecord(r.singleNum, NUMBER_KEYS),
    doubleMatch: fillBucketRecord(r.doubleMatch, NUMBER_KEYS),
    tripleMatch: {
      specific: fillBucketRecord(r.tripleMatch?.specific, NUMBER_KEYS),
      any: normalizeBucket(r.tripleMatch?.any),
    },
    sumTotal: fillBucketRecord(r.sumTotal, SUM_KEYS),
    bigSmallDraw: {
      big: normalizeBucket(r.bigSmallDraw?.big),
      draw: normalizeBucket(r.bigSmallDraw?.draw),
      small: normalizeBucket(r.bigSmallDraw?.small),
    },
  } satisfies Bingo18ByPlayType;
}
