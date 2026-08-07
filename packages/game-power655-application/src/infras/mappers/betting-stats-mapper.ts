import { MongoMapper } from "@megawin/data/mongo";
import type {
  DrawBettingTotals,
  Power655DrawBettingStatsEntity,
  Power655Exposure,
  Power655PlayTypeStat,
  TenantBettingStat,
} from "@megawin/game-power655/entities";
import { PlayType } from "@megawin/game-power655/entities";
import { Document } from "mongodb";

/**
 * Doc `power655_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Doc ghi TỐI THIỂU (`ensureDocs` chỉ seed `final`/`updatedAt`/`lastEntryId`, `$inc` của
 * `applyDelta` chỉ tạo path được chạm) → doc có thể thiếu bất kỳ nhánh nào. Mapper là NƠI
 * DUY NHẤT bảo đảm full shape cho entity contract — port nguyên pattern Keno
 * (`betting-stats-mapper.ts`), thay `byPlayType` 12 key cố định + `exposure` 1 field.
 *
 * Return type khai TƯỜNG MINH (không `as Entity`) — thiếu field là lỗi compile.
 */
export class BettingStatsMapper extends MongoMapper<Document, Power655DrawBettingStatsEntity> {
  protected mapProps(doc: Document): Power655DrawBettingStatsEntity {
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
    } satisfies Power655DrawBettingStatsEntity;
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

/** 1 slot `Power655PlayTypeStat` — merge field CÓ trong doc lên nền zero-stat. */
function normalizePlayTypeStat(
  raw: Partial<Power655PlayTypeStat> | undefined,
): Power655PlayTypeStat {
  return {
    amount: raw?.amount ?? 0,
    sets: raw?.sets ?? 0,
    boards: raw?.boards ?? 0,
  } satisfies Power655PlayTypeStat;
}

/**
 * `byPlayType` — 12 key cố định theo `PlayType` (standard, bao5, bao7..bao18). Doc thiếu
 * key nào thì key đó về zero-stat — KHÔNG dùng `createEmptyByPlayType()` như Keno vì
 * Power655 chỉ có 1 tầng lá (không có slot lồng bigSmall/evenOdd).
 */
function normalizeByPlayType(
  raw: Partial<Record<PlayType, Power655PlayTypeStat>> | undefined,
): Record<PlayType, Power655PlayTypeStat> {
  const out = {} as Record<PlayType, Power655PlayTypeStat>;
  for (const pt of Object.values(PlayType)) {
    out[pt] = normalizePlayTypeStat(raw?.[pt]);
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

/** `Power655Exposure` — chỉ 1 field `fixedWorstCase` (jackpot đọc snapshot pool lúc build response). */
function normalizeExposure(raw: Partial<Power655Exposure> | undefined): Power655Exposure {
  return {
    fixedWorstCase: raw?.fixedWorstCase ?? 0,
  } satisfies Power655Exposure;
}
