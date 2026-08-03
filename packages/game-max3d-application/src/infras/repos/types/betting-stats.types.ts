/**
 * Types kết quả cho `BettingStatsRepository` + stats worker (Max 3D).
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 */

import type { PlayMode, PlayType, Triplet } from "@megawin/game-max3d/entities";
import type {
  DrawBettingTotals,
  Max3dByPlayType,
  Max3dTripletStake,
  Max3dTopPotential,
  TenantBettingStat,
} from "@megawin/game-max3d/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `max3d_ticket_entries`. */
export interface EntryForStats {
  /** ObjectId hex string (watermark). */
  id: string;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  tenantId: string;
  accountId: string;
  /** Username hiển thị (snapshot từ entry) — field `username`, KHÔNG `accountName`. */
  username: string;
  /** Tổng tiền cược entry (VND). */
  amount: number;
  /** Mệnh giá 1 đơn vị dự thưởng (VND) — snapshot từ entry. */
  unitPrice: number;
  /** Hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Boards trong entry. */
  boards: EntryBoardForStats[];
}

/** 1 board tối thiểu cho aggregate — subset `EntryBoardSnapshot` Max 3D. */
export interface EntryBoardForStats {
  /** basic | plus. */
  playMode: PlayMode;
  /** straight | combo3 | combo6 (plus luôn straight). */
  playType: PlayType;
  /** Triplet đã chọn: basic 1 phần tử, plus 2 phần tử (cặp). */
  triplets: Triplet[];
  /** Số line dự thưởng của board (combo = số hoán vị; plus = 1). */
  lineCount: number;
  /** Số lần cược nhân bội — fallback 1 cho data cũ (max3d-game-rules #23). */
  betCount: number;
}

/**
 * Trạng thái hàng đợi 1 kỳ mà worker cần — projection SIÊU MỎNG từ stats doc.
 *
 * Accumulator là delta-only (p0-01) nên worker chỉ cần **cursor đọc**, không cần số liệu cũ.
 */
export interface DrawStatsCursor {
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Watermark: ObjectId hex string entry lớn nhất đã cộng. `undefined` khi doc mới. */
  lastEntryId: string | undefined;
}

/**
 * Δ `byPlayType` — partial: chỉ 4 nhóm phẳng (basicStraight/basicCombo3/basicCombo6/plus)
 * THỰC SỰ có delta trong tick. KHÔNG lồng 2 tầng như Keno (Max 3D không có side bet).
 */
export type PartialByPlayTypeDelta = Partial<Max3dByPlayType>;

/**
 * Delta counters của 1 kỳ trong 1 tick — mọi field là **lượng CỘNG THÊM**, không phải giá
 * trị tuyệt đối.
 *
 * Repo dịch shape này thành `$inc` theo path cố định (p0-01) — khỏi rewrite `tripletStakes`
 * ~80KB mỗi tick khi chỉ 1 triplet đổi.
 */
export interface DrawStatsDelta {
  /** Δ `totals` — mọi field cộng thêm. */
  totals: DrawBettingTotals;
  /** Δ theo nhóm playType — chỉ nhóm có phát sinh trong tick. */
  byPlayType: PartialByPlayTypeDelta;
  /** Δ stake per-triplet SPARSE — chỉ triplet có delta trong tick. */
  tripletStakes: Record<string, Max3dTripletStake>;
  /** Δ theo tenant — chỉ tenant có cược trong tick. */
  byTenant: Record<string, TenantBettingStat>;
  /**
   * Entry mới trong tick để merge vào `topPotential`.
   *
   * KHÁC các field trên: `topPotential` là mảng cần sort+cắt K nên KHÔNG `$inc` được →
   * repo dùng `$push` + `$sort` + `$slice` (Mongo tự làm phía server, app không đọc mảng cũ).
   */
  topPotential: Max3dTopPotential[];
}

/**
 * Delta 1 cặp plus trong 1 tick — gom trong RAM, worker ghi `max3d_draw_pair_stats` bằng
 * `$inc` upsert. `accountIds` chỉ dùng để ghi `max3d_draw_pair_accounts` (đếm distinct),
 * KHÔNG persist trực tiếp field này.
 */
export interface PairStatsDelta {
  drawId: string;
  /** Khoá cặp unordered `"t1,t2"` (t1 ≤ t2 sau sort). */
  pairKey: string;
  /** Triplet nhỏ hơn (sau sort). */
  triplet1: string;
  /** Triplet lớn hơn (sau sort). */
  triplet2: string;
  /** Δ Σ betCount vào cặp này. */
  units: number;
  /** Δ tổng tiền vào cặp (VND). */
  amount: number;
  /** Account distinct cược cặp này TRONG TICK — nguồn ghi `pair_accounts`. */
  accountIds: Set<string>;
}

/**
 * Delta tích luỹ 1 account trong 1 kỳ — ghi `max3d_draw_account_stats` bằng `$inc` upsert.
 *
 * Nguồn CHÍNH XÁC cho `topAccounts` (thay field `@deprecated` trong stats doc — p0-03).
 */
export interface AccountStatsDelta {
  drawId: string;
  accountId: string;
  /** Username snapshot mới nhất trong tick — field duy nhất dùng `$set`. */
  username: string;
  /** Δ tổng tiền cược (VND). */
  amount: number;
  /** Δ số entry. */
  entries: number;
}
