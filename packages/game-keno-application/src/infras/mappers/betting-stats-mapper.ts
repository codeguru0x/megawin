import { MongoMapper } from "@megawin/data/mongo";
import type {
  DrawBettingTotals,
  KenoByPlayType,
  KenoDrawBettingStatsEntity,
  KenoExposure,
  KenoNumberStat,
  KenoPlayTypeStat,
  TenantBettingStat,
} from "@megawin/game-keno/entities";
import { createEmptyByPlayType, createEmptyPlayTypeStat } from "@megawin/game-keno/rules";
import { Document } from "mongodb";

/**
 * Doc `keno_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Từ p0-03 (stats-worker-simplification §5.5) doc ghi TỐI THIỂU (`ensureDocs` chỉ seed
 * `final`/`updatedAt`, `$inc` của `applyDelta` chỉ tạo path được chạm) → doc có thể thiếu
 * bất kỳ nhánh nào. Mapper là NƠI DUY NHẤT bảo đảm full shape cho entity contract: mọi
 * consumer (adapters FE, `evaluateAlerts`, `get-ops-snapshot`) nhận entity đủ field, không
 * cần tự `?? 0` rải rác. Thêm field mới vào entity → thêm 1 dòng default ở đây, doc cũ
 * (skeleton p2-01) và doc mới (tối giản) đều đọc đúng — KHÔNG migration.
 *
 * Return type khai TƯỜNG MINH (không `as Entity`) — thiếu field là lỗi compile, không phải
 * lỗi runtime ở production.
 */
export class BettingStatsMapper extends MongoMapper<Document, KenoDrawBettingStatsEntity> {
  protected mapProps(doc: Document): KenoDrawBettingStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      final: doc.final ?? false,
      // Optional theo DeltaAccumulatedDoc lúc doc chưa từng áp batch — giữ nguyên `undefined`,
      // KHÔNG default: `applyDelta` filter `$lt` coi field thiếu là `null` (đúng ngữ nghĩa Mongo).
      lastEntryId: doc.lastEntryId,
      // KHÔNG default: mọi đường ghi (`ensureDocs`/`applyDelta`/`stampFinal`) đều set field
      // này, và `findChangedSince` dùng `$gt: Date` nên doc thiếu `updatedAt` KHÔNG BAO GIỜ
      // vào hàng đợi worker alert (BSON: missing/null sort trước Date). Default giả (epoch)
      // chỉ che mất doc dị dạng thay vì để nó lộ ra.
      updatedAt: doc.updatedAt,
      totals: normalizeTotals(doc.totals),
      byPlayType: normalizeByPlayType(doc.byPlayType),
      numberFreq: normalizeNumberFreq(doc.numberFreq),
      byTenant: normalizeByTenant(doc.byTenant),
      exposure: normalizeExposure(doc.exposure),
      topPotential: doc.topPotential ?? [],
    } satisfies KenoDrawBettingStatsEntity;
  }
}

/** `DrawBettingTotals` — mọi field cộng dồn bằng `$inc`, thiếu path ⇒ 0. */
function normalizeTotals(raw: Partial<DrawBettingTotals> | undefined): DrawBettingTotals {
  return {
    revenue: raw?.revenue ?? 0,
    entries: raw?.entries ?? 0,
    sets: raw?.sets ?? 0,
    commission: raw?.commission ?? 0,
    largeBetCount: raw?.largeBetCount ?? 0,
  } satisfies DrawBettingTotals;
}

/** 1 slot `KenoPlayTypeStat` — merge field CÓ trong doc lên nền zero-stat. */
function normalizePlayTypeStat(raw: Partial<KenoPlayTypeStat> | undefined): KenoPlayTypeStat {
  if (!raw) {
    return createEmptyPlayTypeStat();
  }
  return {
    amount: raw.amount ?? 0,
    sets: raw.sets ?? 0,
  } satisfies KenoPlayTypeStat;
}

/**
 * `byPlayType` — doc thiếu nhánh nào thì slot đó về zero-stat từ `createEmptyByPlayType()`
 * (single source, `rules/stats-shape.ts`). `bigSmall`/`evenOdd` là slot LỒNG (map hướng
 * cược) — normalize riêng theo từng hướng; 10 slot `pickN` là slot LÁ.
 */
function normalizeByPlayType(raw: Partial<KenoByPlayType> | undefined): KenoByPlayType {
  if (!raw) {
    return createEmptyByPlayType();
  }

  return {
    pick1: normalizePlayTypeStat(raw.pick1),
    pick2: normalizePlayTypeStat(raw.pick2),
    pick3: normalizePlayTypeStat(raw.pick3),
    pick4: normalizePlayTypeStat(raw.pick4),
    pick5: normalizePlayTypeStat(raw.pick5),
    pick6: normalizePlayTypeStat(raw.pick6),
    pick7: normalizePlayTypeStat(raw.pick7),
    pick8: normalizePlayTypeStat(raw.pick8),
    pick9: normalizePlayTypeStat(raw.pick9),
    pick10: normalizePlayTypeStat(raw.pick10),
    bigSmall: {
      big: normalizePlayTypeStat(raw.bigSmall?.big),
      small: normalizePlayTypeStat(raw.bigSmall?.small),
      draw: normalizePlayTypeStat(raw.bigSmall?.draw),
    },
    evenOdd: {
      even: normalizePlayTypeStat(raw.evenOdd?.even),
      even1112: normalizePlayTypeStat(raw.evenOdd?.even1112),
      draw: normalizePlayTypeStat(raw.evenOdd?.draw),
      odd1112: normalizePlayTypeStat(raw.evenOdd?.odd1112),
      odd: normalizePlayTypeStat(raw.evenOdd?.odd),
    },
  } satisfies KenoByPlayType;
}

/** `numberFreq` là `Record` — reader đã tolerant `?? 0`, chỉ cần đảm bảo object tồn tại. */
function normalizeNumberFreq(
  raw: Record<string, Partial<KenoNumberStat>> | undefined,
): Record<string, KenoNumberStat> {
  if (!raw) {
    return {};
  }
  const out: Record<string, KenoNumberStat> = {};
  for (const [num, stat] of Object.entries(raw)) {
    out[num] = { sets: stat.sets ?? 0, amount: stat.amount ?? 0 } satisfies KenoNumberStat;
  }
  return out;
}

/** `byTenant` là `Record` — chỉ tenant có cược mới có key, giữ nguyên field-level default. */
function normalizeByTenant(
  raw: Record<string, Partial<TenantBettingStat>> | undefined,
): Record<string, TenantBettingStat> {
  if (!raw) {
    return {};
  }
  const out: Record<string, TenantBettingStat> = {};
  for (const [tenantId, stat] of Object.entries(raw)) {
    out[tenantId] = {
      amount: stat.amount ?? 0,
      entries: stat.entries ?? 0,
      commission: stat.commission ?? 0,
    } satisfies TenantBettingStat;
  }
  return out;
}

/** `KenoExposure` — `capSets` seed đủ 3 key (interface cố định), `worstCaseByPlayType` là Record. */
function normalizeExposure(raw: Partial<KenoExposure> | undefined): KenoExposure {
  return {
    worstCaseByPlayType: raw?.worstCaseByPlayType ?? {},
    worstCaseTotal: raw?.worstCaseTotal ?? 0,
    capSets: {
      pick8: raw?.capSets?.pick8 ?? 0,
      pick9: raw?.capSets?.pick9 ?? 0,
      pick10: raw?.capSets?.pick10 ?? 0,
    },
  } satisfies KenoExposure;
}
