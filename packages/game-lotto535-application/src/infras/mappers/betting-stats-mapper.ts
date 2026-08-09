import { MongoMapper } from "@megawin/data/mongo";
import type {
  DrawBettingTotals,
  Lotto535DrawBettingStatsEntity,
  Lotto535Exposure,
  Lotto535PlayTypeStat,
  TenantBettingStat,
} from "@megawin/game-lotto535/entities";
import { Lotto535StatsPlayKey } from "@megawin/game-lotto535/entities";
import type { Document } from "mongodb";

/**
 * Doc `lotto535_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Doc ghi TỐI THIỂU (`ensureDocs` chỉ seed `final`/`updatedAt`/`lastEntryId`, `$inc` của
 * `applyDelta` chỉ tạo path được chạm) → doc có thể thiếu bất kỳ nhánh nào. Mapper là NƠI
 * DUY NHẤT bảo đảm full shape cho entity contract — port nguyên pattern Power 6/55
 * (`betting-stats-mapper.ts`), thay `byPlayType` 13 key cố định (`Lotto535StatsPlayKey`).
 *
 * Return type khai TƯỜNG MINH (không `as Entity`) — thiếu field là lỗi compile.
 */
export class BettingStatsMapper extends MongoMapper<Document, Lotto535DrawBettingStatsEntity> {
  protected mapProps(doc: Document): Lotto535DrawBettingStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      final: doc.final ?? false,
      // Optional theo DeltaAccumulatedDoc lúc doc chưa từng áp batch — giữ nguyên `undefined`,
      // KHÔNG default: `applyDelta` filter `$lt` coi field thiếu là `null` (đúng ngữ nghĩa Mongo).
      lastEntryId: doc.lastEntryId,
      // KHÔNG default: mọi đường ghi đều set field này, và `findChangedSince` dùng `$gt: Date`
      // nên doc thiếu `updatedAt` KHÔNG BAO GIỜ vào hàng đợi worker alert.
      updatedAt: doc.updatedAt,
      totals: normalizeTotals(doc.totals),
      byPlayType: normalizeByPlayType(doc.byPlayType),
      byTenant: normalizeByTenant(doc.byTenant),
      exposure: normalizeExposure(doc.exposure),
      topPotential: doc.topPotential ?? [],
    } satisfies Lotto535DrawBettingStatsEntity;
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

/** 1 slot `Lotto535PlayTypeStat` — merge field CÓ trong doc lên nền zero-stat. */
function normalizePlayTypeStat(raw: Partial<Lotto535PlayTypeStat> | undefined): Lotto535PlayTypeStat {
  return {
    amount: raw?.amount ?? 0,
    sets: raw?.sets ?? 0,
    boards: raw?.boards ?? 0,
  } satisfies Lotto535PlayTypeStat;
}

/**
 * `byPlayType` — 13 key cố định theo `Lotto535StatsPlayKey` (standard, mainCover4,
 * mainCover6..15, specialCover). Doc thiếu key nào thì key đó về zero-stat.
 */
function normalizeByPlayType(
  raw: Partial<Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat>> | undefined,
): Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat> {
  const out = {} as Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat>;
  for (const key of Object.values(Lotto535StatsPlayKey)) {
    out[key] = normalizePlayTypeStat(raw?.[key]);
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

/** `Lotto535Exposure` — chỉ 1 field `fixedWorstCase` (jackpot đọc snapshot pool lúc build response). */
function normalizeExposure(raw: Partial<Lotto535Exposure> | undefined): Lotto535Exposure {
  return {
    fixedWorstCase: raw?.fixedWorstCase ?? 0,
  } satisfies Lotto535Exposure;
}
