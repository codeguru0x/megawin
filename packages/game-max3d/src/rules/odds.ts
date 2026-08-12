/**
 * Max 3D – Odds & Profit Calculator
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * I. MÔ TẢ TRÒ CHƠI
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Max 3D – Xổ số tự chọn. Người chơi chọn bộ ba số (000-999).
 *   Mỗi chữ số chọn trong tập {0, 1, ..., 9}.
 *
 *   Giá vé mặc định: 10.000 VND / lần tham gia dự thưởng (`play.unitPrice`).
 *   Lịch quay mặc định: Thứ 2, 4, 6 hàng tuần. Cả giá vé và lịch quay đều cấu
 *   hình được nên KHÔNG coi là hằng số khi tính doanh thu.
 *
 *   Mỗi kỳ quay 20 bộ ba số:
 *   - 2 bộ giải Đặc Biệt
 *   - 4 bộ giải Nhất
 *   - 6 bộ giải Nhì
 *   - 8 bộ giải Ba
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * II. KHÔNG GIAN MẪU (Sample Space)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Mỗi bộ 3 chữ số, mỗi chữ số 0-9:
 *     Tổng giá trị: 10 × 10 × 10 = 1.000 bộ ba số.
 *
 *   Max 3D Cơ Bản (1 bộ, straight):
 *     S = 1.000 (so khớp chính xác)
 *
 *   Max 3D+ (2 bộ, straight):
 *     S = 1.000 × 1.000 = 1.000.000 cặp có thứ tự (t1, t2), CHO PHÉP t1 = t2.
 *     Người chơi được chọn 2 bộ giống nhau (VD 096+096) nên cặp trùng nằm
 *     TRONG không gian mẫu, không loại trừ.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * III. XÁC SUẤT MAX 3D CƠ BẢN (Straight, 1 bộ ba số)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   Giả định: 20 bộ kết quả ĐỀU KHÁC NHAU (trường hợp phổ biến nhất). Nếu
 *   kết quả có bộ lặp thì 1 bộ số của người chơi trúng nhiều hạng cùng lúc
 *   và được lĩnh TỔNG các hạng đó (§11.11 rule Max 3D) — xác suất bảng dưới
 *   là xác suất trúng RIÊNG từng hạng, không loại trừ nhau.
 *
 * ┌─────────────┬─────────┬───────────┬──────────────┐
 * │ Giải        │ Số bộ   │ XS trúng  │ 1 trong N    │
 * ├─────────────┼─────────┼───────────┼──────────────┤
 * │ Đặc Biệt    │ 2       │ 2/1000    │ 500          │
 * │ Nhất        │ 4       │ 4/1000    │ 250          │
 * │ Nhì         │ 6       │ 6/1000    │ 166,67       │
 * │ Ba          │ 8       │ 8/1000    │ 125          │
 * ├─────────────┼─────────┼───────────┼──────────────┤
 * │ Trúng bất kỳ│ 20      │ 20/1000   │ 50           │
 * │ Không trúng │ 980     │ 980/1000  │ ~1,02        │
 * └─────────────┴─────────┴───────────┴──────────────┘
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * IV. XÁC SUẤT MAX 3D+ (2 bộ ba số)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   7 hạng giải KHÔNG loại trừ nhau — người chơi lĩnh TỔNG mọi hạng đạt
 *   điều kiện. Vì vậy mỗi hạng có xác suất RIÊNG, tổng các xác suất > xác
 *   suất "trúng ít nhất 1 giải".
 *
 *   Giải cặp (ĐB → Tư) dùng **bipartite matching**: 2 bộ của người chơi phải
 *   khớp 2 entry RIÊNG BIỆT trong pool. Do đó cặp trùng (t1 = t2) KHÔNG thể
 *   trúng giải cặp khi pool chỉ chứa 1 entry mang giá trị đó — đây là điểm
 *   khiến ways ≠ (số entry)² như công thức naive.
 *
 *   Ways cho pool có k entry ĐỀU KHÁC NHAU, xét trên 1.000.000 cặp có thứ tự:
 *     Giải cặp: chọn 2 entry khác nhau rồi gán vào (t1, t2) theo thứ tự
 *               → k × (k − 1) ways (KHÔNG phải k²; k² đếm nhầm cả cặp trùng).
 *
 *   Duplicate (t1 = t2) được nhân ×2 giải thưởng từ hạng Nhất → Sáu (giải ĐB
 *   KHÔNG ×2). Bảng dưới ghi **effective ways** — đã quy đổi ×2 của cặp trùng
 *   thành ways tương đương, nên dùng trực tiếp để tính chi phí kỳ vọng.
 *
 * ┌───────────┬──────────────────────────────────┬────────────────┬───────────┐
 * │ Giải      │ Công thức effective ways         │ Effective ways │ 1 trong N │
 * ├───────────┼──────────────────────────────────┼────────────────┼───────────┤
 * │ Đặc Biệt  │ 2 × 1 (không ×2 duplicate)       │ 2              │ 500.000   │
 * │ Nhất      │ 4 × 3                            │ 12             │ 83.333    │
 * │ Nhì       │ 6 × 5                            │ 30             │ 33.333    │
 * │ Ba        │ 8 × 7                            │ 56             │ 17.857    │
 * │ Tư        │ 20 × 19                          │ 380            │ 2.632     │
 * │ Năm       │ 2 × 2 × 980 + 2 × 2 (dup ×2)     │ 4.000          │ 250       │
 * │ Sáu       │ 2 × 18 × 980 + 18 × 2 (dup ×2)   │ 36.000         │ 27,8      │
 * └───────────┴──────────────────────────────────┴────────────────┴───────────┘
 *
 *   Giải Năm/Sáu (nhóm ĐƠN) tính theo TỪNG bộ số, nên 1 cặp có thể trúng
 *   Giải Sáu 2 lần (cả 2 bộ đều khớp Nhất/Nhì/Ba) — công thức đếm số LẦN
 *   trúng, không đếm số cặp:
 *     Năm  = 2 (vị trí) × 2 (entry ĐB) × 1.000 (bộ còn lại tự do) = 4.000
 *     Sáu  = 2 (vị trí) × 18 (entry Nhất/Nhì/Ba) × 1.000          = 36.000
 *   Cặp trùng đã tự động được tính đúng: 1 lần trúng × ×2 thưởng = 2 lần
 *   trúng của cặp không trùng.
 *
 *   Kiểm chứng: đã enumerate đủ 1.000.000 cặp bằng chính logic `matchPlus()`
 *   (bipartite + duplicate ×2) — số liệu bảng trên khớp 100%.
 */

import { BasicPrizeTier, PlusPrizeTier } from "../entities/enums";
import type { BasicPrizeAmounts, PlusPrizeAmounts } from "../entities/types";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const TOTAL_TRIPLETS = 1000;
const RESULT_SPECIAL = 2;
const RESULT_FIRST = 4;
const RESULT_SECOND = 6;
const RESULT_THIRD = 8;
const RESULT_TOTAL = 20;

/** Số bộ kết quả thuộc Nhất/Nhì/Ba — pool của Giải Sáu (Plus). */
const RESULT_NON_SPECIAL = RESULT_TOTAL - RESULT_SPECIAL;

// ─────────────────────────────────────────────
// Basic Odds (1 bộ ba số, straight)
// ─────────────────────────────────────────────

export const BASIC_TOTAL_OUTCOMES = TOTAL_TRIPLETS;

export interface BasicTierOdds {
  tier: BasicPrizeTier;
  label: string;
  resultCount: number;
  probability: number;
  oneInN: number;
}

export function getBasicOddsTable(): BasicTierOdds[] {
  const tiers: Array<{ tier: BasicPrizeTier; label: string; count: number }> = [
    {
      tier: BasicPrizeTier.Special,
      label: "Giải Đặc Biệt",
      count: RESULT_SPECIAL,
    },
    { tier: BasicPrizeTier.First, label: "Giải Nhất", count: RESULT_FIRST },
    { tier: BasicPrizeTier.Second, label: "Giải Nhì", count: RESULT_SECOND },
    { tier: BasicPrizeTier.Third, label: "Giải Ba", count: RESULT_THIRD },
  ];

  return tiers.map(({ tier, label, count }) => {
    const probability = count / BASIC_TOTAL_OUTCOMES;
    return {
      tier,
      label,
      resultCount: count,
      probability,
      oneInN: 1 / probability,
    };
  });
}

// ─────────────────────────────────────────────
// Combo Odds
// ─────────────────────────────────────────────

/**
 * Combo3 (2 chữ số giống, 3 hoán vị):
 * Xác suất trúng 1 giải = 3 × (resultCount / 1000)
 * nhưng giải thưởng thấp hơn straight.
 *
 * Combo6 (3 chữ số khác nhau, 6 hoán vị):
 * Xác suất trúng 1 giải = 6 × (resultCount / 1000)
 * nhưng giải thưởng thấp hơn nữa.
 */
export function getCombo3OddsTable(): BasicTierOdds[] {
  return getBasicOddsTable().map((odds) => ({
    ...odds,
    probability: Math.min(odds.probability * 3, 1),
    oneInN: 1 / Math.min(odds.probability * 3, 1),
  }));
}

export function getCombo6OddsTable(): BasicTierOdds[] {
  return getBasicOddsTable().map((odds) => ({
    ...odds,
    probability: Math.min(odds.probability * 6, 1),
    oneInN: 1 / Math.min(odds.probability * 6, 1),
  }));
}

// ─────────────────────────────────────────────
// Plus Odds (2 bộ ba số)
// ─────────────────────────────────────────────

/**
 * Tổng không gian mẫu cho Max 3D+: 1.000 × 1.000 = 1.000.000 cặp có thứ tự
 * (t1, t2), CHO PHÉP t1 = t2 vì người chơi được chọn 2 bộ giống nhau.
 */
export const PLUS_TOTAL_OUTCOMES = TOTAL_TRIPLETS * TOTAL_TRIPLETS;

export interface PlusTierOdds {
  tier: PlusPrizeTier;
  label: string;
  ways: number;
  probability: number;
  oneInN: number;
  formula: string;
}

/**
 * Bảng xác suất Max 3D+ — khớp CHÍNH XÁC logic `matchPlus()` trong `prize-tiers.ts`.
 *
 * `ways` là **effective ways** (đã quy đổi ×2 giải thưởng của cặp trùng thành
 * ways tương đương), nên `probability × prize` cho ra chi phí kỳ vọng ĐÚNG mà
 * không cần hệ số điều chỉnh thêm.
 *
 * Hai nhóm giải tính khác nhau:
 * - **Nhóm cặp (ĐB → Tư)**: bipartite matching — 2 bộ phải khớp 2 entry RIÊNG
 *   BIỆT. Với pool k entry khác nhau → `k × (k − 1)` ways (cặp trùng không
 *   khớp được 2 entry riêng biệt nên bị loại). Giải ĐB KHÔNG nhân ×2 duplicate.
 * - **Nhóm đơn (Năm, Sáu)**: đếm số LẦN trúng theo từng bộ số →
 *   `2 vị trí × k entry × 1.000 bộ còn lại`. Cặp trùng chỉ khớp 1 lần nhưng
 *   thưởng ×2 nên tổng effective bằng nhau, công thức tự cân bằng.
 *
 * Bảng số liệu đã được kiểm chứng bằng enumeration đủ 1.000.000 cặp.
 */
export function getPlusOddsTable(): PlusTierOdds[] {
  const S = PLUS_TOTAL_OUTCOMES;

  // ── Nhóm CẶP: k × (k−1) — 2 entry RIÊNG BIỆT, gán theo thứ tự (t1, t2) ──
  // Giải ĐB không nhân ×2 duplicate; cặp trùng không thể khớp 2 entry riêng biệt
  // khi 2 entry ĐB khác giá trị → ways = 2 × 1 = 2.
  const waysSpecial = RESULT_SPECIAL * (RESULT_SPECIAL - 1);
  const waysFirst = RESULT_FIRST * (RESULT_FIRST - 1);
  const waysSecond = RESULT_SECOND * (RESULT_SECOND - 1);
  const waysThird = RESULT_THIRD * (RESULT_THIRD - 1);
  // Giải Tư: 2 entry riêng biệt trong TOÀN BỘ 20 kết quả (cho phép cross-tier).
  const waysFourth = RESULT_TOTAL * (RESULT_TOTAL - 1);

  // ── Nhóm ĐƠN: 2 vị trí × k entry × 1.000 bộ còn lại tự do ──
  // Công thức này đếm số LẦN trúng (1 cặp có thể trúng Giải Sáu 2 lần) và đã
  // bao trọn cặp trùng: cặp trùng trúng 1 lần × thưởng ×2 = 2 lần tương đương.
  const waysFifth = 2 * RESULT_SPECIAL * TOTAL_TRIPLETS;
  const waysSixth = 2 * RESULT_NON_SPECIAL * TOTAL_TRIPLETS;

  return [
    {
      tier: PlusPrizeTier.Special,
      label: "Giải Đặc Biệt",
      ways: waysSpecial,
      probability: waysSpecial / S,
      oneInN: S / waysSpecial,
      formula: `${RESULT_SPECIAL} × ${RESULT_SPECIAL - 1} = ${waysSpecial}`,
    },
    {
      tier: PlusPrizeTier.First,
      label: "Giải Nhất",
      ways: waysFirst,
      probability: waysFirst / S,
      oneInN: S / waysFirst,
      formula: `${RESULT_FIRST} × ${RESULT_FIRST - 1} = ${waysFirst}`,
    },
    {
      tier: PlusPrizeTier.Second,
      label: "Giải Nhì",
      ways: waysSecond,
      probability: waysSecond / S,
      oneInN: S / waysSecond,
      formula: `${RESULT_SECOND} × ${RESULT_SECOND - 1} = ${waysSecond}`,
    },
    {
      tier: PlusPrizeTier.Third,
      label: "Giải Ba",
      ways: waysThird,
      probability: waysThird / S,
      oneInN: S / waysThird,
      formula: `${RESULT_THIRD} × ${RESULT_THIRD - 1} = ${waysThird}`,
    },
    {
      tier: PlusPrizeTier.Fourth,
      label: "Giải Tư",
      ways: waysFourth,
      probability: waysFourth / S,
      oneInN: S / waysFourth,
      formula: `${RESULT_TOTAL} × ${RESULT_TOTAL - 1} = ${waysFourth}`,
    },
    {
      tier: PlusPrizeTier.Fifth,
      label: "Giải Năm",
      ways: waysFifth,
      probability: waysFifth / S,
      oneInN: S / waysFifth,
      formula: `2 × ${RESULT_SPECIAL} × ${TOTAL_TRIPLETS} = ${waysFifth}`,
    },
    {
      tier: PlusPrizeTier.Sixth,
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

export function analyzeBasicStraightProfitability(prizes: BasicPrizeAmounts, unitPrice: number): ProfitSummary {
  const oddsTable = getBasicOddsTable();

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
    mode: "basic_straight",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent: unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}

export function analyzePlusProfitability(prizes: PlusPrizeAmounts, unitPrice: number): ProfitSummary {
  const oddsTable = getPlusOddsTable();

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
    mode: "plus",
    tiers,
    totalExpectedPayout,
    totalPayoutRatio,
    grossMarginPerLine,
    grossMarginPercent: unitPrice > 0 ? (grossMarginPerLine / unitPrice) * 100 : 0,
  };
}
