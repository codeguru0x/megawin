import { MongoMapper } from "@megawin/data/mongo";
import type {
  DrawBettingTotals,
  Max3dproByPlayType,
  Max3dproDrawBettingStatsEntity,
  Max3dproPlayTypeStat,
  Max3dproTripletStake,
  TenantBettingStat,
} from "@megawin/game-max3dpro/entities";
import { Document } from "mongodb";

/**
 * Doc `max3dpro_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Từ p0-01/p0-04 doc ghi TỐI THIỂU (`ensureDocs` chỉ seed `final`/`updatedAt`, `$inc` của
 * `applyDelta` chỉ tạo path được chạm) → doc có thể thiếu bất kỳ nhánh nào. Mapper là NƠI
 * DUY NHẤT bảo đảm full shape cho entity contract: mọi consumer (adapters FE, evaluate,
 * get-ops-snapshot) nhận entity đủ field, không cần tự `?? 0` rải rác. Thêm field mới vào
 * entity → thêm 1 dòng default ở đây, doc cũ và doc mới đều đọc đúng — KHÔNG migration.
 *
 * Return type khai TƯỜNG MINH (không `{...rest} as Entity`) — thiếu field là lỗi compile,
 * không phải lỗi runtime ở production (code-quality §5.4).
 */
export class BettingStatsMapper extends MongoMapper<Document, Max3dproDrawBettingStatsEntity> {
  protected mapProps(doc: Document): Max3dproDrawBettingStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      final: doc.final ?? false,
      // Optional theo DeltaAccumulatedDoc lúc doc chưa từng áp batch — giữ nguyên `undefined`,
      // KHÔNG default: `applyDelta` filter `$lt` coi field thiếu là `null` (đúng ngữ nghĩa Mongo).
      lastEntryId: doc.lastEntryId,
      // KHÔNG default: mọi đường ghi (`ensureDocs`/`applyDelta`/`stampFinal`) đều set field
      // này, và `findChangedSince` dùng `$gt: Date` nên doc thiếu `updatedAt` KHÔNG vào hàng
      // đợi worker alert (BSON: missing/null sort trước Date).
      updatedAt: doc.updatedAt,
      totals: normalizeTotals(doc.totals),
      byPlayType: normalizeByPlayType(doc.byPlayType),
      tripletStakes: normalizeTripletStakes(doc.tripletStakes),
      byTenant: normalizeByTenant(doc.byTenant),
      topPotential: doc.topPotential ?? [],
    } satisfies Max3dproDrawBettingStatsEntity;
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

/** 1 slot `Max3dproPlayTypeStat` — merge field CÓ trong doc lên nền zero-stat. */
function normalizePlayTypeStat(
  raw: Partial<Max3dproPlayTypeStat> | undefined,
): Max3dproPlayTypeStat {
  return {
    amount: raw?.amount ?? 0,
    units: raw?.units ?? 0,
    boards: raw?.boards ?? 0,
    entries: raw?.entries ?? 0,
  } satisfies Max3dproPlayTypeStat;
}

/** `byPlayType` — 2 slot cố định (multiNumber/multiDigit), thiếu nhánh nào về zero-stat. */
function normalizeByPlayType(raw: Partial<Max3dproByPlayType> | undefined): Max3dproByPlayType {
  return {
    multiNumber: normalizePlayTypeStat(raw?.multiNumber),
    multiDigit: normalizePlayTypeStat(raw?.multiDigit),
  } satisfies Max3dproByPlayType;
}

/** `tripletStakes` là `Record` SPARSE — chỉ triplet có cược, field-level default. */
function normalizeTripletStakes(
  raw: Record<string, Partial<Max3dproTripletStake>> | undefined,
): Record<string, Max3dproTripletStake> {
  if (!raw) {
    return {};
  }
  const out: Record<string, Max3dproTripletStake> = {};
  for (const [t, stake] of Object.entries(raw)) {
    out[t] = {
      units: stake.units ?? 0,
      amount: stake.amount ?? 0,
      boards: stake.boards ?? 0,
    } satisfies Max3dproTripletStake;
  }
  return out;
}

/** `byTenant` là `Record` — chỉ tenant có cược mới có key, field-level default. */
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
