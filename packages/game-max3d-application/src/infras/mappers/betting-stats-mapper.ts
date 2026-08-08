import { MongoMapper } from "@megawin/data/mongo";
import type {
  DrawBettingTotals,
  Max3dByPlayType,
  Max3dDrawBettingStatsEntity,
  Max3dPlayTypeStat,
  Max3dTripletStake,
  TenantBettingStat,
} from "@megawin/game-max3d/entities";
import { createEmptyByPlayType, createEmptyPlayTypeStat } from "@megawin/game-max3d/rules";
import type { Document } from "mongodb";

/**
 * Doc `max3d_draw_betting_stats` → entity, NORMALIZE shape phía đọc.
 *
 * Từ p0-04 (stats-worker-simplification) doc ghi TỐI THIỂU (`ensureDocs` chỉ seed
 * `final`/`updatedAt`, `$inc` của `applyDelta` chỉ tạo path được chạm) → doc có thể thiếu
 * bất kỳ nhánh nào. Mapper là NƠI DUY NHẤT bảo đảm full shape cho entity contract: mọi
 * consumer (adapters FE, `evaluateMax3dAlerts`, `get-ops-snapshot`) nhận entity đủ field,
 * không cần tự `?? 0` rải rác. Thêm field mới vào entity → thêm 1 dòng default ở đây, doc
 * cũ (nếu có) và doc mới (tối giản) đều đọc đúng — KHÔNG migration.
 *
 * Return type khai TƯỜNG MINH (không `as Entity`) — thiếu field là lỗi compile, không phải
 * lỗi runtime ở production.
 */
export class BettingStatsMapper extends MongoMapper<Document, Max3dDrawBettingStatsEntity> {
  protected mapProps(doc: Document): Max3dDrawBettingStatsEntity {
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
      tripletStakes: normalizeTripletStakes(doc.tripletStakes),
      byTenant: normalizeByTenant(doc.byTenant),
      topPotential: doc.topPotential ?? [],
    } satisfies Max3dDrawBettingStatsEntity;
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

/** 1 nhóm `Max3dPlayTypeStat` — merge field CÓ trong doc lên nền zero-stat. */
function normalizePlayTypeStat(raw: Partial<Max3dPlayTypeStat> | undefined): Max3dPlayTypeStat {
  if (!raw) {
    return createEmptyPlayTypeStat();
  }
  return {
    amount: raw.amount ?? 0,
    units: raw.units ?? 0,
    boards: raw.boards ?? 0,
    entries: raw.entries ?? 0,
  } satisfies Max3dPlayTypeStat;
}

/**
 * `byPlayType` — doc thiếu nhóm nào thì nhóm đó về zero-stat từ `createEmptyByPlayType()`
 * (single source, `rules/stats-shape.ts`). 4 nhóm đều là slot LÁ (khác Keno có 2 nhóm lồng
 * bigSmall/evenOdd) — normalize phẳng, không cần đệ quy.
 */
function normalizeByPlayType(raw: Partial<Max3dByPlayType> | undefined): Max3dByPlayType {
  if (!raw) {
    return createEmptyByPlayType();
  }

  return {
    basicStraight: normalizePlayTypeStat(raw.basicStraight),
    basicCombo3: normalizePlayTypeStat(raw.basicCombo3),
    basicCombo6: normalizePlayTypeStat(raw.basicCombo6),
    plus: normalizePlayTypeStat(raw.plus),
  } satisfies Max3dByPlayType;
}

/** `tripletStakes` là `Record` sparse — chỉ triplet có cược mới có key, giữ field-level default. */
function normalizeTripletStakes(
  raw: Record<string, Partial<Max3dTripletStake>> | undefined,
): Record<string, Max3dTripletStake> {
  if (!raw) {
    return {};
  }
  const out: Record<string, Max3dTripletStake> = {};
  for (const [triplet, stake] of Object.entries(raw)) {
    out[triplet] = {
      straightUnits: stake.straightUnits ?? 0,
      combo3Units: stake.combo3Units ?? 0,
      combo6Units: stake.combo6Units ?? 0,
      amount: stake.amount ?? 0,
      boards: stake.boards ?? 0,
    } satisfies Max3dTripletStake;
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
