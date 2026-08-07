/**
 * Mega 6/45 – Prize Tiers (Bảng giải thưởng & matching logic)
 *
 * MEGA 6/45 có 4 hạng giải, chỉ so khớp số chính (không có số đặc biệt).
 *
 * | Tier     | Điều kiện | Default VND          |
 * |----------|-----------|----------------------|
 * | jackpot  | 6/6 số    | tích luỹ (min 12 tỷ) |
 * | tier1    | 5/6 số    | 10.000.000           |
 * | tier2    | 4/6 số    | 300.000              |
 * | tier3    | 3/6 số    | 30.000               |
 *
 * GIẢI THƯỞNG KHI CHƠI BAO:
 * Ticket được expand thành nhiều lines. Mỗi line match độc lập.
 * Tổng tiền thưởng = Σ(tiền mỗi line trúng).
 *
 * Ví dụ BAO 7 (C(7,6)=7 lines), tất cả 6 số trúng nằm trong 7 số chọn:
 *   - 1 line khớp đúng 6/6 → Jackpot
 *   - 6 lines còn lại mỗi line có 5/6 → Giải Nhất (10M mỗi line)
 *   - Tổng = Jackpot + 6 × 10M = Jackpot + 60M (khớp bảng giá Vietlott)
 */

import { PrizeTier } from "../entities/enums";
import type { PrizeAmounts } from "../entities/types";

// ─────────────────────────────────────────────
// Prize Tier Rule Definition
// ─────────────────────────────────────────────

/** Định nghĩa quy tắc 1 hạng giải thưởng. */
export interface PrizeTierRule {
  /** Mã hạng giải (jackpot / tier1 / tier2 / tier3). */
  tier: PrizeTier;
  /** Tên hiển thị hạng giải (tiếng Việt). */
  label: string;
  /** Số lượng số cần trùng để đạt hạng (6=Jackpot, 5=Nhất, 4=Nhì, 3=Ba). */
  requiredMatches: number;
  /** Giá trị giải thưởng mặc định (VND). Jackpot = 0 vì là giải tích luỹ. */
  defaultAmount: number;
}

// ─────────────────────────────────────────────
// Default Prize Tier Rules (ưu tiên cao → thấp)
// ─────────────────────────────────────────────

export const DEFAULT_PRIZE_TIER_RULES: readonly PrizeTierRule[] = [
  {
    tier: PrizeTier.Jackpot,
    label: "Giải Đặc Biệt",
    requiredMatches: 6,
    defaultAmount: 0,
  },
  {
    tier: PrizeTier.Tier1,
    label: "Giải Nhất",
    requiredMatches: 5,
    defaultAmount: 10_000_000,
  },
  {
    tier: PrizeTier.Tier2,
    label: "Giải Nhì",
    requiredMatches: 4,
    defaultAmount: 300_000,
  },
  {
    tier: PrizeTier.Tier3,
    label: "Giải Ba",
    requiredMatches: 3,
    defaultAmount: 30_000,
  },
] as const;

// ─────────────────────────────────────────────
// Match Result
// ─────────────────────────────────────────────

/** Kết quả so khớp 1 line (dùng trong matching logic). */
export interface LineMatchResult {
  /** Hạng giải trúng (null nếu < 3 số trùng → không trúng). */
  tier: PrizeTier | null;
  /** Số lượng số trùng (0-6). */
  matchCount: number;
}

// ─────────────────────────────────────────────
// Matching Function
// ─────────────────────────────────────────────

/**
 * Xác định hạng giải cho 1 line dựa trên số lượng match.
 * Mega 6/45 chỉ cần so sánh matchCount.
 *
 * @example
 * determineTier(6) // → "jackpot"
 * determineTier(5) // → "tier1"
 * determineTier(4) // → "tier2"
 * determineTier(3) // → "tier3"
 * determineTier(2) // → null
 */
export function determineTier(matchCount: number): PrizeTier | null {
  for (const rule of DEFAULT_PRIZE_TIER_RULES) {
    if (matchCount >= rule.requiredMatches) {
      return rule.tier;
    }
  }
  return null;
}

export function getPrizeTierRule(tier: PrizeTier): PrizeTierRule | undefined {
  return DEFAULT_PRIZE_TIER_RULES.find((r) => r.tier === tier);
}

export function buildPrizeAmountMap(prizeAmounts: PrizeAmounts): ReadonlyMap<PrizeTier, number> {
  const map = new Map<PrizeTier, number>();
  const amounts = prizeAmounts as unknown as Record<string, number>;
  for (const rule of DEFAULT_PRIZE_TIER_RULES) {
    const amount = amounts[rule.tier] ?? rule.defaultAmount;
    map.set(rule.tier, amount);
  }
  return map;
}
