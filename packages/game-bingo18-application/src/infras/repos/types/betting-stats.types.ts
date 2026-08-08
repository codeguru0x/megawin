/**
 * Types kết quả cho `BettingStatsRepository` + stats worker (Bingo 18).
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 */

import type {
  Bingo18BigSmallBet,
  Bingo18BucketStat,
  Bingo18PlayType,
  Bingo18TopPotential,
  Bingo18TripleKind,
  DrawBettingTotals,
  TenantBettingStat,
} from "@megawin/game-bingo18/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `bingo18_ticket_entries`. */
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
  /** Mệnh giá 1 bộ (VND) — snapshot từ entry, dùng tính amount per bucket. */
  unitPrice: number;
  /** Hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Boards trong entry (unified — cả cơ bản và bổ sung). */
  boards: EntryBoardForStats[];
}

/** 1 board tối thiểu cho aggregate — subset `EntryBoardSnapshot`. */
export interface EntryBoardForStats {
  playType: Bingo18PlayType;
  /** Số 1-6 — singleNum/doubleMatch/tripleMatch specific. */
  number?: number;
  /** "specific" | "any" — chỉ tripleMatch. */
  tripleKind?: Bingo18TripleKind;
  /** Tổng 3-18 — chỉ sumTotal. */
  sum?: number;
  /** Hướng big/draw/small — chỉ bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Số lần cược nhân bội của board. */
  betCount: number;
}

/** Trạng thái hàng đợi 1 kỳ — projection SIÊU MỎNG cho `findNotFinal` (chỉ 2 field). */
export interface DrawStatsCursor {
  drawId: string;
  /** Watermark hiện tại của doc — `undefined` nếu doc chưa từng nhận batch nào. */
  lastEntryId: string | undefined;
}

/**
 * Phân bổ Δ theo play type — PARTIAL, chỉ chứa bucket có delta trong tick.
 *
 * KHÁC Keno (side bet 2 tầng phẳng): Bingo 18 có 3 nhóm record theo số (`singleNum`/
 * `doubleMatch`/`sumTotal`), `tripleMatch` tách `specific` (record) + `any` (bucket đơn),
 * và `bigSmallDraw` 3 hướng cố định. Accumulator chỉ set key nào board thực sự chạm tới —
 * repo dùng key đó build `$inc` path động, KHÔNG seed đủ 38 bucket (F2-a).
 */
export interface Bingo18PartialByPlayType {
  singleNum?: Record<string, Bingo18BucketStat>;
  doubleMatch?: Record<string, Bingo18BucketStat>;
  tripleMatch?: {
    specific?: Record<string, Bingo18BucketStat>;
    any?: Bingo18BucketStat;
  };
  sumTotal?: Record<string, Bingo18BucketStat>;
  bigSmallDraw?: {
    big?: Bingo18BucketStat;
    draw?: Bingo18BucketStat;
    small?: Bingo18BucketStat;
  };
}

/**
 * Δ counters 1 kỳ trong 1 tick — mọi field là lượng CỘNG THÊM (không phải giá trị tuyệt đối).
 * Repo `applyDelta` dùng shape này build `$inc` cho `bingo18_draw_betting_stats`.
 */
export interface DrawStatsDelta {
  totals: DrawBettingTotals;
  /** Partial — chỉ bucket có delta trong tick (F2-a). */
  byPlayType: Bingo18PartialByPlayType;
  byTenant: Record<string, TenantBettingStat>;
  /**
   * Vé nguy hiểm nhất trong tick — repo `$push` + `$sort{potentialWin:-1}` + `$slice`.
   * An toàn top-K vì `potentialWin` BẤT BIẾN per-entry (F3-c).
   */
  topPotential: Bingo18TopPotential[];
}

/**
 * Δ tích luỹ theo account của 1 tick — worker ghi `bingo18_draw_account_stats`.
 *
 * `amount`/`entries`/`sets` là lượng CỘNG THÊM; `username` là snapshot mới nhất trong tick
 * (repo `$set`, KHÔNG `$inc`). Xem `Bingo18DrawAccountStatsDoc` JSDoc lý do tách collection.
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
  /** Δ số bộ cược `Σ(board.betCount)` (KHÔNG phải số board). */
  sets: number;
}
