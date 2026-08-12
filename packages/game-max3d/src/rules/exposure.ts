/**
 * Max 3D – Exposure (liability per-slot/per-pair + proxy tổng)
 *
 * Outcome space Max 3D = 1000²⁰ (20 slot độc lập) → KHÔNG enumerate được như Bingo18.
 * Nhưng cấu trúc giải cho phép tính CHÍNH XÁC 2 lớp (analysis max3d-ops §3.4):
 *
 * (a) BASIC — chính xác tuyệt đối: basic trả cộng dồn theo tier (gộp giải,
 *     `findAllTiersInResult`), mỗi slot quay độc lập →
 *     `liability(t, tier) = straightUnits×basicPrize[tier] + combo3Units×combo3[tier]
 *      + combo6Units×combo6[tier]`.
 *     Worst-case = mỗi tier chọn top-k triplet DISTINCT theo liability (k = số slot:
 *     ĐB 2 / Nhất 4 / Nhì 6 / Ba 8) rồi Σ. ⚠️ Đã kiểm chứng code 30/07/2026:
 *     `findAllTiersInResult` dùng `.includes()` — triplet lặp trong CÙNG pool KHÔNG
 *     nhân thưởng → greedy phải distinct per tier; CÙNG triplet ở NHIỀU tier được
 *     cộng (gộp giải) → greedy per-tier độc lập là đúng worst-case.
 *
 * (b) PAIR ĐB — chính xác có điều kiện: `liabilityĐB(pair) = units × plusPrizes.special`
 *     (unordered — 2 bộ khớp 2 slot ĐB bipartite; duplicate pair KHÔNG ×2 ĐB theo luật).
 *
 * (c) TỔNG — proxy RAW (TÍNH DƯ, tức cao hơn thực tế; ghi nhãn rõ): basic (a) + max pair
 *     liability (b) + giải nhỏ nhóm ĐƠN plus (Năm/Sáu — điều kiện per-triplet, CÓ THỂ
 *     trả diện rộng đồng thời). KHÔNG cộng "mọi pair × special" (chỉ pair trùng bộ ĐB mới
 *     trả — cộng đồng loạt là vô nghĩa, cùng bài học per-number liability Keno §3.7).
 *
 *     ⚠️ GIỚI HẠN ĐÃ BIẾT của phần giải nhỏ: proxy dùng `units × (fifth + sixth)`, tức
 *     1 lần trúng / unit. Trần THẬT là `2 × (fifth + sixth)` / unit vì nhóm đơn
 *     xét từng bộ trong cặp (mỗi bộ có thể khớp cả pool ĐB lẫn Nhất/Nhì/Ba → trúng
 *     cả Năm lẫn Sáu). Giữ hệ số 1× có chủ đích: giả định "100% unit trúng" đã
 *     thổi phồng gấp hàng chục lần thực tế (P(trúng) ≈ 4%), nên tổng vẫn cao hơn
 *     thực tế rất xa. Đổi sang 2× sẽ nhân đôi giá trị alert → phải calibrate lại
 *     `exposureWarnAmount` trước khi đổi, KHÔNG sửa lẻ công thức.
 *
 * Mọi hàm THUẦN + idempotent — áp ở TẦNG ĐỌC (snapshot response / eval alert),
 * KHÔNG lưu output vào doc (bucket RAW tuyến tính — bài học Keno Risk #4).
 */

import type { Max3dTopPair, Max3dTripletStake } from "../entities/betting-stats";
import { BasicPrizeTier, PlayMode, PlayType } from "../entities/enums";
import type { BasicPrizeAmounts, ComboPrizeAmounts, PlusPrizeAmounts } from "../entities/types";
import {
  MAX3D_DRAW_COUNT_FIRST,
  MAX3D_DRAW_COUNT_SECOND,
  MAX3D_DRAW_COUNT_SPECIAL,
  MAX3D_DRAW_COUNT_THIRD,
} from "../entities/types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Bảng giải gom lại từ GlobalConfig — input cho mọi hàm exposure (KHÔNG hardcode). */
export interface Max3dPrizeSet {
  basic: BasicPrizeAmounts;
  combo: ComboPrizeAmounts;
  plus: PlusPrizeAmounts;
}

/** Worst-case basic CHÍNH XÁC — breakdown theo tier + tổng. */
export interface Max3dBasicWorstCase {
  /** Σ liability top-k triplet distinct của từng tier (VND). Key theo BasicPrizeTier. */
  byTier: Record<BasicPrizeTier, number>;
  /** Tổng worst-case basic (VND) = Σ byTier. */
  total: number;
}

/** Liability ĐB của 1 cặp plus — "nếu cặp này là 2 slot ĐB thì trả bao nhiêu". */
export interface Max3dPairLiability {
  pairKey: string;
  triplet1: string;
  triplet2: string;
  units: number;
  accounts: number;
  amount: number;
  /** Liability nếu cặp ra ĐB (VND) = units × plusPrizes.special. */
  liability: number;
}

/** Kết quả exposure tổng — từng phần ghi nhãn exact/proxy để UI hiển thị đúng. */
export interface Max3dExposureResult {
  /** Basic — CHÍNH XÁC (greedy per-tier distinct). */
  basicWorstCase: Max3dBasicWorstCase;
  /** Top liability ĐB per-pair, sort desc — CHÍNH XÁC có điều kiện. */
  topPairLiabilities: Max3dPairLiability[];
  /** Giải nhỏ nhóm đơn plus Năm/Sáu (VND) — PROXY TÍNH DƯ (giả định mọi unit trả đồng thời). */
  plusTailProxy: number;
  /** Tổng worst-case (VND) = basic + max pair liability + plusTailProxy. */
  worstCaseTotal: number;
}

// ─────────────────────────────────────────────
// (a) Basic worst-case — CHÍNH XÁC
// ─────────────────────────────────────────────

/** Số slot mỗi tier trong kết quả 20 bộ — hằng domain (draw-result). */
const TIER_SLOTS: ReadonlyArray<{ tier: BasicPrizeTier; slots: number }> = [
  { tier: BasicPrizeTier.Special, slots: MAX3D_DRAW_COUNT_SPECIAL },
  { tier: BasicPrizeTier.First, slots: MAX3D_DRAW_COUNT_FIRST },
  { tier: BasicPrizeTier.Second, slots: MAX3D_DRAW_COUNT_SECOND },
  { tier: BasicPrizeTier.Third, slots: MAX3D_DRAW_COUNT_THIRD },
];

/** Liability của 1 triplet nếu được quay vào 1 tier (VND) — cộng 3 nhóm units. */
function tripletTierLiability(stake: Max3dTripletStake, tier: BasicPrizeTier, prizes: Max3dPrizeSet): number {
  return (
    stake.straightUnits * prizes.basic[tier] +
    stake.combo3Units * prizes.combo.combo3[tier] +
    stake.combo6Units * prizes.combo.combo6[tier]
  );
}

/**
 * Worst-case basic CHÍNH XÁC: mỗi tier chọn top-k triplet DISTINCT theo liability
 * (k = số slot tier đó), Σ tất cả tier. Cùng triplet được phép xuất hiện ở nhiều
 * tier khác nhau (gộp giải cross-tier — luật Vietlott).
 */
export function computeBasicWorstCase(
  tripletStakes: Record<string, Max3dTripletStake>,
  prizes: Max3dPrizeSet,
): Max3dBasicWorstCase {
  const stakes = Object.values(tripletStakes);
  const byTier = {} as Record<BasicPrizeTier, number>;
  let total = 0;

  for (const { tier, slots } of TIER_SLOTS) {
    // Top-k liability DISTINCT triplet cho tier này (triplet lặp trong cùng pool
    // KHÔNG nhân thưởng — findAllTiersInResult trả tier duy nhất 1 lần).
    const top = stakes
      .map((s) => tripletTierLiability(s, tier, prizes))
      .filter((v) => v > 0)
      .sort((a, b) => b - a)
      .slice(0, slots);
    const tierTotal = top.reduce((a, v) => a + v, 0);
    byTier[tier] = tierTotal;
    total += tierTotal;
  }

  return { byTier, total };
}

// ─────────────────────────────────────────────
// (b) Pair liability ĐB — CHÍNH XÁC có điều kiện
// ─────────────────────────────────────────────

/**
 * Liability ĐB per-pair từ `topPairs`, sort desc.
 *
 * Cặp ngoài top-K có units nhỏ → liability nhỏ (chấp nhận sai số phần dưới bảng — UI
 * ghi "top K cặp"). Duplicate pair (t1===t2): ĐB KHÔNG ×2 theo luật (`matchPair`) —
 * công thức units × special vẫn đúng vì units đã là số bộ cược cặp đó.
 */
export function computePairLiabilities(topPairs: Max3dTopPair[], prizes: Max3dPrizeSet): Max3dPairLiability[] {
  return topPairs
    .map((p) => ({
      pairKey: p.pairKey,
      triplet1: p.triplet1,
      triplet2: p.triplet2,
      units: p.units,
      accounts: p.accounts,
      amount: p.amount,
      liability: p.units * prizes.plus.special,
    }))
    .sort((a, b) => b.liability - a.liability);
}

// ─────────────────────────────────────────────
// (c) Exposure tổng — proxy RAW
// ─────────────────────────────────────────────

/**
 * Exposure tổng 1 kỳ: basic (chính xác) + max pair liability ĐB (chính xác có điều
 * kiện) + giải nhỏ nhóm đơn plus Năm/Sáu (proxy TÍNH DƯ).
 *
 * @param tripletStakes - `stats.tripletStakes` (sparse Record).
 * @param topPairs - Top-K cặp bộ ba plus, derive từ `max3d_draw_pair_stats` (p0-03) —
 *   KHÔNG còn đọc `stats.topPairs` (field đã xoá khỏi doc chính).
 * @param plusUnits - Tổng units plus (`stats.byPlayType.plus.units`) — dùng cho giải nhỏ nhóm đơn.
 * @param prizes - Bảng giải từ GlobalConfig.
 */
export function computeMax3dExposure(
  tripletStakes: Record<string, Max3dTripletStake>,
  topPairs: Max3dTopPair[],
  plusUnits: number,
  prizes: Max3dPrizeSet,
): Max3dExposureResult {
  const basicWorstCase = computeBasicWorstCase(tripletStakes, prizes);
  const topPairLiabilities = computePairLiabilities(topPairs, prizes);
  const maxPairLiability = topPairLiabilities[0]?.liability ?? 0;

  // Giải nhỏ nhóm ĐƠN plus (Năm: 1 bộ khớp ĐB; Sáu: 1 bộ khớp Nhất/Nhì/Ba) — điều kiện
  // per-triplet nên CÓ THỂ trả diện rộng đồng thời → proxy Σ units × (fifth + sixth).
  // Hệ số 1× (không phải 2× dù mỗi cặp có 2 bộ) là chủ đích — xem §(c) JSDoc đầu file.
  // KHÔNG cộng giải CẶP (Nhất→Tư) đồng loạt: chỉ pair khớp pool mới trả — cộng mọi
  // pair là double-count vô nghĩa (bài học per-number liability Keno §3.7).
  const plusTailProxy = plusUnits * (prizes.plus.fifth + prizes.plus.sixth);

  return {
    basicWorstCase,
    topPairLiabilities,
    plusTailProxy,
    worstCaseTotal: basicWorstCase.total + maxPairLiability + plusTailProxy,
  };
}

// ─────────────────────────────────────────────
// PotentialWin per-entry (PROXY — chốt §7 Q5)
// ─────────────────────────────────────────────

/**
 * Ước tính phải trả cho 1 board (per-unit, VND) — lấy hạng ĐB của mode/playType.
 *
 * ⚠️ ƯỚC TÍNH, KHÔNG phải trần tuyệt đối. Chỉ đếm hạng ĐB, cố tình BỎ các giải nhỏ
 * trúng kèm:
 * - Basic: 1 bộ có thể nằm ở nhiều pool → trúng ĐB+Nhất+Nhì+Ba (defaults: 1,66tr thay
 *   vì 1tr, tức trần thật cao hơn ~66%). Combo còn nhân số hoán vị.
 * - Plus: cặp ăn ĐB thì đồng thời ăn Tư + Năm×2 (defaults: ~1,0013 tỷ so với 1 tỷ).
 *
 * Giữ 1 hạng ĐB có chủ đích: chỉ số này dùng để XẾP HẠNG entry nguy hiểm (top-K
 * `topPotential`) và bất biến per-entry, không dùng làm hạn mức tài chính. Muốn đổi
 * sang trần tuyệt đối phải đổi đồng bộ cả nhãn UI, KHÔNG sửa lẻ công thức.
 *
 * Nhân betCount ở caller.
 */
export function maxBoardUnitWin(playMode: PlayMode, playType: PlayType, prizes: Max3dPrizeSet): number {
  if (playMode === PlayMode.Plus) {
    return prizes.plus.special;
  }
  if (playType === PlayType.Combo3) {
    return prizes.combo.combo3.special;
  }
  if (playType === PlayType.Combo6) {
    return prizes.combo.combo6.special;
  }
  return prizes.basic.special;
}
