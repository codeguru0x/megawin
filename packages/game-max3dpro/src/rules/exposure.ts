/**
 * Max 3D Pro – Exposure (liability per-pair ORDERED + proxy tổng)
 *
 * Pro KHÔNG có basic mode → KHÔNG có greedy per-tier. Lớp exposure CHÍNH là PAIR
 * (analysis §3.4, plan Pro p0-02 §2):
 *
 * (a) PAIR ĐB — chính xác có điều kiện, GIỮ THỨ TỰ: nếu kết quả ĐB = [t1, t2] thì
 *     `liability(t1,t2) = units("t1>t2") × special + units("t2>t1") × specialSub`
 *     (chiều đúng ăn ĐB 2 tỷ, chiều ngược ăn phụ ĐB 400tr — CỘNG CẢ 2 KEY).
 *     Duplicate pair (t1===t2): 1 key duy nhất, liability = units × (special + specialSub)
 *     — luật duplicate ĐB = special + specialSub, KHÔNG ×2 (đối chiếu `matchPair()`
 *     trong `rules/prize-tiers.ts`).
 *
 * (b) TỔNG — proxy RAW (thiên cao, ghi nhãn rõ): max pair liability (a) + đuôi giải
 *     ĐƠN Năm/Sáu (điều kiện per-triplet, CÓ THỂ trả diện rộng đồng thời — mỗi pair
 *     tối đa 1 tier nên proxy = Σ units × (fifth + sixth) thiên cao). KHÔNG cộng giải
 *     CẶP Nhất→Tư đồng loạt (chỉ pair khớp pool mới trả — bài học Keno §3.7).
 *
 * Mọi hàm THUẦN + idempotent — áp ở TẦNG ĐỌC, KHÔNG lưu output vào doc (Risk #4).
 * ⚠️ KHÔNG sort/normalize pairKey ở bất kỳ đâu trong file này.
 */

import type { PrizeAmounts } from "../entities/types";
import type { Max3dproTopPair } from "../entities/betting-stats";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Bảng giải từ GlobalConfig (`defaultPrizes.standard`) — input mọi hàm exposure. */
export type Max3dproPrizeSet = PrizeAmounts;

/** Liability ĐB của 1 outcome-cặp — "nếu kết quả ĐB = [first, second] thì trả bao nhiêu". */
export interface Max3dproPairLiability {
  /** Khoá ORDERED của chiều đúng `"first>second"`. */
  pairKey: string;
  first: string;
  second: string;
  /** Units chiều đúng (ăn ĐB). */
  unitsForward: number;
  /** Units chiều ngược (ăn phụ ĐB) — 0 nếu không ai cược chiều ngược. */
  unitsReverse: number;
  /** Account distinct (gộp 2 chiều). */
  accounts: number;
  /** Tổng tiền 2 chiều (VND). */
  amount: number;
  /** Liability nếu outcome này ra ĐB (VND) — forward×special + reverse×specialSub. */
  liability: number;
}

/** Kết quả exposure tổng — từng phần ghi nhãn exact/proxy để UI hiển thị đúng. */
export interface Max3dproExposureResult {
  /** Top liability ĐB per-outcome, sort desc — CHÍNH XÁC có điều kiện. */
  topPairLiabilities: Max3dproPairLiability[];
  /** Đuôi giải đơn Năm/Sáu (VND) — PROXY thiên cao (mọi unit trả đồng thời). */
  tailProxy: number;
  /** Tổng worst-case (VND) = max pair liability + tailProxy. */
  worstCaseTotal: number;
}

/** Khoá cặp ORDERED — mũi tên `>` (KHÔNG sort; khác `,` unordered của Max 3D). */
export function toOrderedPairKey(first: string, second: string): string {
  return `${first}>${second}`;
}

// ─────────────────────────────────────────────
// (a) Pair liability ĐB — CHÍNH XÁC có điều kiện, ordered
// ─────────────────────────────────────────────

/**
 * Liability ĐB per-outcome từ `topPairs` (ordered), sort desc.
 *
 * Mỗi outcome [t1,t2] gộp 2 key: chiều đúng ×special + chiều ngược ×specialSub.
 * Chỉ xét outcome có chiều đúng nằm trong topPairs (chiều ngược lookup qua map —
 * cặp ngoài top-K units nhỏ, chấp nhận sai số đuôi).
 */
export function computeProPairLiabilities(
  topPairs: Max3dproTopPair[],
  prizes: Max3dproPrizeSet,
): Max3dproPairLiability[] {
  // Map lookup units chiều ngược theo pairKey ordered.
  const unitsByKey = new Map<string, Max3dproTopPair>();
  for (const p of topPairs) unitsByKey.set(p.pairKey, p);

  const out: Max3dproPairLiability[] = [];
  const seen = new Set<string>();

  for (const p of topPairs) {
    if (seen.has(p.pairKey)) continue;
    seen.add(p.pairKey);

    // Duplicate pair (t1===t2): 1 key duy nhất — luật ĐB = special + specialSub, KHÔNG ×2
    // (đối chiếu matchPair(): duplicate khớp ĐB trả cộng 2 hạng cho 1 unit).
    if (p.first === p.second) {
      out.push({
        pairKey: p.pairKey,
        first: p.first,
        second: p.second,
        unitsForward: p.units,
        unitsReverse: 0,
        accounts: p.accounts,
        amount: p.amount,
        liability: p.units * (prizes.special + prizes.specialSub),
      });
      continue;
    }

    const reverseKey = toOrderedPairKey(p.second, p.first);
    const reverse = unitsByKey.get(reverseKey);
    if (reverse) seen.add(reverseKey);

    out.push({
      pairKey: p.pairKey,
      first: p.first,
      second: p.second,
      unitsForward: p.units,
      unitsReverse: reverse?.units ?? 0,
      accounts: p.accounts + (reverse?.accounts ?? 0),
      amount: p.amount + (reverse?.amount ?? 0),
      // Chiều đúng ăn ĐB + chiều ngược ăn phụ ĐB — cùng 1 outcome [first, second].
      liability: p.units * prizes.special + (reverse?.units ?? 0) * prizes.specialSub,
    });
  }

  return out.sort((a, b) => b.liability - a.liability);
}

// ─────────────────────────────────────────────
// (b) Exposure tổng — proxy RAW
// ─────────────────────────────────────────────

/**
 * Exposure tổng 1 kỳ Pro: max pair liability ĐB (chính xác có điều kiện) + đuôi giải
 * đơn Năm/Sáu (proxy thiên cao — mỗi pair tối đa 1 tier, giả định mọi unit trúng).
 *
 * @param topPairs - `stats.topPairs` (ordered, top-K).
 * @param totalUnits - Tổng units toàn kỳ (`byPlayType.multiNumber.units + multiDigit.units`).
 * @param prizes - Bảng giải từ GlobalConfig.
 */
export function computeMax3dproExposure(
  topPairs: Max3dproTopPair[],
  totalUnits: number,
  prizes: Max3dproPrizeSet,
): Max3dproExposureResult {
  const topPairLiabilities = computeProPairLiabilities(topPairs, prizes);
  const maxPairLiability = topPairLiabilities[0]?.liability ?? 0;

  // Đuôi giải ĐƠN (Năm: 1 bộ khớp ĐB; Sáu: 1 bộ khớp Nhất/Nhì/Ba) — proxy thiên cao.
  const tailProxy = totalUnits * (prizes.fifth + prizes.sixth);

  return {
    topPairLiabilities,
    tailProxy,
    worstCaseTotal: maxPairLiability + tailProxy,
  };
}

// ─────────────────────────────────────────────
// PotentialWin per-entry (PROXY — chốt §7 Q5)
// ─────────────────────────────────────────────

/**
 * Worst-case 1 board per-unit (VND) — PROXY: `special + specialSub` (multiNumber chứa
 * mọi ordered pair của tập chọn → gần như luôn có cả 2 chiều của cặp ĐB; multiDigit
 * Cartesian front×back cũng thường chứa cả 2 chiều khi front/back giao nhau — chấp
 * nhận thiên cao). Nhân betCount ở caller.
 */
export function maxProBoardUnitWin(prizes: Max3dproPrizeSet): number {
  return prizes.special + prizes.specialSub;
}
