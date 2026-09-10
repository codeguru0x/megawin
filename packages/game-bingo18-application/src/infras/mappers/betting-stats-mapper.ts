/**
 * Bingo 18 – Betting Stats Mapper (Doc → Entity, full-shape normalize)
 *
 * `ensureDocs` (p0-01/p0-04) chỉ seed `{final, updatedAt}` — `applyDelta` `$inc` tự tạo mọi
 * path lồng còn thiếu KHI CÓ delta chạm tới, nên doc thật trong Mongo có thể thiếu bất kỳ
 * nhánh nào của `totals`/`byPlayType`/`byTenant` (kỳ chưa ai cược side đó). Normalize
 * `byPlayType` nằm ở `normalizeByPlayType` (`@megawin/game-bingo18/rules`) — mapper và
 * Ops Hub (`getRowsByDrawIds` bypass mapper) dùng chung 1 nguồn. `totals`/`byTenant`
 * normalize tại đây. KHÔNG rải `?? 0` khắp UI/use-case đọc.
 *
 * Field-explicit + `satisfies` (KHÔNG `{...rest} as Entity`): entity thêm field mới →
 * compiler bắt thiếu nhánh normalize ngay, tránh runtime `undefined` âm thầm.
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { Bingo18DrawBettingStatsEntity } from "@megawin/game-bingo18/entities";
import { normalizeByPlayType } from "@megawin/game-bingo18/rules";
import type { DrawBettingTotals, TenantBettingStat } from "@megawin/game-core/types";
import type { Document } from "mongodb";

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
      // Normalize qua `rules/stats-shape` — cùng nguồn với Ops Hub (`getRowsByDrawIds` bypass mapper).
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
