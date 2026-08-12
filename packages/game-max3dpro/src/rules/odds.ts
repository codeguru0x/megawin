/**
 * Max 3D Pro – Odds & Profit Calculator
 *
 * Max 3D Pro: mỗi "line" = 1 cặp có thứ tự 2 bộ ba số (`{first, second}`).
 * Giá vé mặc định 10.000 VND / cặp / lượt (`play.unitPrice` — cấu hình được).
 * Kết quả quay: 20 bộ ba số (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba).
 *
 * Không gian mẫu: S = 1.000 × 1.000 = 1.000.000 cặp có thứ tự, CHO PHÉP
 * first = second (người chơi được chọn 2 bộ giống nhau).
 *
 * 8 hạng giải KHÔNG loại trừ nhau — người chơi lĩnh TỔNG mọi hạng đạt điều
 * kiện, nên mỗi hạng có xác suất riêng và tổng xác suất > P(trúng ≥ 1 giải).
 */

import { PrizeTier } from "../entities/enums";
import type { PrizeAmounts } from "../entities/types";

const TOTAL_TRIPLETS = 1000;
const RESULT_SPECIAL = 2;
const RESULT_FIRST = 4;
const RESULT_SECOND = 6;
const RESULT_THIRD = 8;
const RESULT_TOTAL = 20;

/** Số bộ kết quả thuộc Nhất/Nhì/Ba — pool của Giải Sáu. */
const RESULT_NON_SPECIAL = RESULT_TOTAL - RESULT_SPECIAL;

export const PRO_TOTAL_OUTCOMES = TOTAL_TRIPLETS * TOTAL_TRIPLETS;

export interface ProTierOdds {
  tier: PrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
  formula: string;
}

/**
 * Bảng xác suất Max 3D Pro — khớp CHÍNH XÁC logic `matchPair()` trong `prize-tiers.ts`.
 *
 * `ways` là **effective ways** (đã quy đổi ×2 giải thưởng của cặp trùng thành
 * ways tương đương), nên `probability × prize` cho ra chi phí kỳ vọng ĐÚNG.
 *
 * Ba nhóm giải tính khác nhau:
 * - **ĐB / phụ ĐB**: so khớp cặp có thứ tự với `(special[0], special[1])` →
 *   đúng 1 way mỗi hạng. Cặp trùng chỉ xảy ra khi 2 bộ ĐB cùng giá trị và khi
 *   đó nhận `special + specialSub` (không ×2), đã bao trong 1 way mỗi hạng.
 * - **Nhóm cặp (Nhất → Tư)**: bipartite matching — 2 bộ phải khớp 2 entry
 *   RIÊNG BIỆT → pool k entry cho `k × (k − 1)` ways. Cặp trùng bị loại khỏi
 *   nhóm này (không khớp được 2 entry riêng biệt), nên KHÔNG dùng `k²`.
 * - **Nhóm đơn (Năm, Sáu)**: đếm số LẦN trúng theo từng bộ số →
 *   `2 vị trí × k entry × 1.000 bộ còn lại`. Bộ còn lại KHÔNG bị loại 20 kết
 *   quả: theo luật gộp giải, cả 2 bộ đều khớp thì trúng 2 lần và được lĩnh cả
 *   hai. Cặp trùng khớp 1 lần nhưng thưởng ×2 → tổng effective bằng nhau.
 *
 * Bảng đã được kiểm chứng bằng enumeration đủ 1.000.000 cặp.
 */
export function getProOddsTable(): ProTierOdds[] {
  const S = PRO_TOTAL_OUTCOMES;

  // ── ĐB / phụ ĐB: khớp cặp có thứ tự → 1 way mỗi hạng ──
  const waysSpecial = 1;
  const waysSpecialSub = 1;

  // ── Nhóm CẶP: k × (k−1) — 2 entry RIÊNG BIỆT gán theo thứ tự (first, second) ──
  const waysFirst = RESULT_FIRST * (RESULT_FIRST - 1);
  const waysSecond = RESULT_SECOND * (RESULT_SECOND - 1);
  const waysThird = RESULT_THIRD * (RESULT_THIRD - 1);
  // Giải Tư: 2 entry riêng biệt trong TOÀN BỘ 20 kết quả (cho phép cross-tier).
  const waysFourth = RESULT_TOTAL * (RESULT_TOTAL - 1);

  // ── Nhóm ĐƠN: 2 vị trí × k entry × 1.000 bộ còn lại tự do ──
  const waysFifth = 2 * RESULT_SPECIAL * TOTAL_TRIPLETS;
  const waysSixth = 2 * RESULT_NON_SPECIAL * TOTAL_TRIPLETS;

  return [
    {
      tier: PrizeTier.Special,
      label: "Giải Đặc Biệt",
      ways: waysSpecial,
      probability: waysSpecial / S,
      oneInN: S / waysSpecial,
      formula: `1 (đúng thứ tự)`,
    },
    {
      tier: PrizeTier.SpecialSub,
      label: "Giải phụ Đặc Biệt",
      ways: waysSpecialSub,
      probability: waysSpecialSub / S,
      oneInN: S / waysSpecialSub,
      formula: `1 (ngược thứ tự)`,
    },
    {
      tier: PrizeTier.First,
      label: "Giải Nhất",
      ways: waysFirst,
      probability: waysFirst / S,
      oneInN: S / waysFirst,
      formula: `${RESULT_FIRST} × ${RESULT_FIRST - 1} = ${waysFirst}`,
    },
    {
      tier: PrizeTier.Second,
      label: "Giải Nhì",
      ways: waysSecond,
      probability: waysSecond / S,
      oneInN: S / waysSecond,
      formula: `${RESULT_SECOND} × ${RESULT_SECOND - 1} = ${waysSecond}`,
    },
    {
      tier: PrizeTier.Third,
      label: "Giải Ba",
      ways: waysThird,
      probability: waysThird / S,
      oneInN: S / waysThird,
      formula: `${RESULT_THIRD} × ${RESULT_THIRD - 1} = ${waysThird}`,
    },
    {
      tier: PrizeTier.Fourth,
      label: "Giải Tư",
      ways: waysFourth,
      probability: waysFourth / S,
      oneInN: S / waysFourth,
      formula: `${RESULT_TOTAL} × ${RESULT_TOTAL - 1} = ${waysFourth}`,
    },
    {
      tier: PrizeTier.Fifth,
      label: "Giải Năm",
      ways: waysFifth,
      probability: waysFifth / S,
      oneInN: S / waysFifth,
      formula: `2 × ${RESULT_SPECIAL} × ${TOTAL_TRIPLETS} = ${waysFifth}`,
    },
    {
      tier: PrizeTier.Sixth,
      label: "Giải Sáu",
      ways: waysSixth,
      probability: waysSixth / S,
      oneInN: S / waysSixth,
      formula: `2 × ${RESULT_NON_SPECIAL} × ${TOTAL_TRIPLETS} = ${waysSixth}`,
    },
  ];
}

// ─────────────────────────────────────────────
// Profit Analysis
// ─────────────────────────────────────────────

export interface TierProfitAnalysis {
  tier: string;
  label: string;
  probability: number;
  oneInN: number;
  currentPrize: number;
  expectedPayout: number;
  payoutRatio: number;
  breakEvenPrize: number;
}

export interface ProfitSummary {
  unitPrice: number;
  mode: string;
  tiers: TierProfitAnalysis[];
  totalExpectedPayout: number;
  totalPayoutRatio: number;
  grossMarginPerLine: number;
  grossMarginPercent: number;
}

export function analyzeProProfitability(prizes: PrizeAmounts, unitPrice: number): ProfitSummary {
  const oddsTable = getProOddsTable();

  const tiers: TierProfitAnalysis[] = oddsTable.map((odds) => {
    const currentPrize = prizes[odds.tier];
    const expectedPayout = odds.probability * currentPrize;
    return {
      tier: odds.tier,
      label: odds.label,
      probability: odds.probability,
      oneInN: odds.oneInN,
      currentPrize,
      expectedPayout,
      payoutRatio: unitPrice > 0 ? expectedPayout / unitPrice : 0,
      breakEvenPrize: odds.probability > 0 ? unitPrice / odds.probability : Infinity,
    };
  });

  const totalExpectedPayout = tiers.reduce((s, t) => s + t.expectedPayout, 0);
  const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
  const grossMarginPerLine = unitPrice - totalExpectedPayout;

  return {
    unitPrice,
    mode: "max3dpro",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent: unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}
