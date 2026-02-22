/**
 * Lotto 5/35 – Prize Tiers (Bảng giải thưởng & matching logic)
 *
 * File này chứa:
 * 1. Default config giải thưởng (có thể override qua gameConfig UI)
 * 2. Matching rule: mỗi tier cần bao nhiêu số chính + đặc biệt
 * 3. Hàm xác định hạng giải cho 1 line dựa trên kết quả match
 * 4. Hàm build prize amount map (merge config từ DB)
 *
 * GIẢI THƯỞNG KHI CHƠI BAO:
 * Giải thưởng bao KHÔNG phải cấu hình riêng.
 * Khi chơi bao, ticket được expand thành nhiều lines.
 * Mỗi line match độc lập với kết quả → tổng tiền thưởng = Σ(tiền mỗi line trúng).
 *
 * Ví dụ BAO 6 (C(6,5) = 6 lines), trúng "5 chính + đặc biệt":
 *   - 1 line khớp đúng 5 chính + ĐB → Jackpot
 *   - 5 lines còn lại mỗi line có 4/5 chính + ĐB → Giải Nhì (5M mỗi line)
 *   - Tổng = Jackpot + 5 × 5M = Jackpot + 25M ✓ (khớp bảng giá Vietlott)
 *
 * GHI CHÚ JACKPOT:
 * Khi hiển thị, giải Jackpot ghi: "Jackpot + {fixedBonus}" nếu bao,
 * vì các lines phụ cũng trúng giải cố định.
 * Giá trị giải cố định có thể được override qua gameConfig (UI editable).
 *
 * Bảng giải thưởng Lotto 5/35 (1 line, standard):
 * ┌─────────────┬────────────────────────────┬──────────────────────┐
 * │ Tier        │ Điều kiện                  │ Default (VND)        │
 * ├─────────────┼────────────────────────────┼──────────────────────┤
 * │ jackpot     │ 5 chính + đặc biệt        │ tích luỹ (min 1 tỷ) │
 * │ tier1       │ 5 chính                   │ 10.000.000 (*)       │
 * │ tier2       │ 4 chính + đặc biệt        │ 5.000.000 (*)        │
 * │ tier3       │ 4 chính                   │ 500.000 (*)          │
 * │ tier4       │ 3 chính + đặc biệt        │ 100.000 (*)          │
 * │ tier5       │ 3 chính                   │ 30.000 (*)           │
 * │ consolation │ chỉ đặc biệt (≤2 chính)   │ 10.000               │
 * └─────────────┴────────────────────────────┴──────────────────────┘
 * (*) Giá trị UI-editable qua gameConfig.defaultPrizes.
 *     Tại kỳ "Chia Giải Độc Đắc", các giải (*) được bổ sung thêm từ Jackpot.
 *     Giải Khuyến Khích KHÔNG tham gia chia Jackpot.
 */

import { Lotto535PrizeTier } from "../entities/lotto535.enums";

// ─────────────────────────────────────────────
// Prize Tier Rule Definition
// ─────────────────────────────────────────────

/** Quy tắc match cho 1 hạng giải. */
export interface PrizeTierRule {
  /** Mã hạng giải. */
  tier: Lotto535PrizeTier;

  /** Tên hiển thị tiếng Việt. */
  label: string;

  /** Số lượng số chính cần trùng. */
  mainMatch: number;

  /**
   * Có cần trùng số đặc biệt không.
   * - true: bắt buộc trùng
   * - false: không cần trùng
   * - "only": chỉ cần đặc biệt (consolation: ≤2 chính + đặc biệt)
   */
  specialMatch: boolean | "only";

  /** Giá trị giải thưởng cố định mặc định (VND). 0 = tích luỹ (jackpot). */
  defaultAmount: number;

  /** Tier này có tham gia chia Jackpot trong split cycle không. */
  splitEligible: boolean;
}

// ─────────────────────────────────────────────
// Default Prize Tier Rules (thứ tự ưu tiên cao → thấp)
// ─────────────────────────────────────────────

/**
 * Bảng giải thưởng mặc định, sắp xếp theo thứ tự ưu tiên giảm dần.
 * Khi match, duyệt từ đầu đến cuối – trả về tier đầu tiên thoả mãn.
 */
export const DEFAULT_PRIZE_TIER_RULES: readonly PrizeTierRule[] = [
  {
    tier: Lotto535PrizeTier.Jackpot,
    label: "Giải Độc Đắc",
    mainMatch: 5,
    specialMatch: true,
    defaultAmount: 0,
    splitEligible: false,
  },
  {
    tier: Lotto535PrizeTier.Tier1,
    label: "Giải Nhất",
    mainMatch: 5,
    specialMatch: false,
    defaultAmount: 10_000_000,
    splitEligible: true,
  },
  {
    tier: Lotto535PrizeTier.Tier2,
    label: "Giải Nhì",
    mainMatch: 4,
    specialMatch: true,
    defaultAmount: 5_000_000,
    splitEligible: true,
  },
  {
    tier: Lotto535PrizeTier.Tier3,
    label: "Giải Ba",
    mainMatch: 4,
    specialMatch: false,
    defaultAmount: 500_000,
    splitEligible: true,
  },
  {
    tier: Lotto535PrizeTier.Tier4,
    label: "Giải Tư",
    mainMatch: 3,
    specialMatch: true,
    defaultAmount: 100_000,
    splitEligible: true,
  },
  {
    tier: Lotto535PrizeTier.Tier5,
    label: "Giải Năm",
    mainMatch: 3,
    specialMatch: false,
    defaultAmount: 30_000,
    splitEligible: true,
  },
  {
    tier: Lotto535PrizeTier.Consolation,
    label: "Giải Khuyến Khích",
    mainMatch: 0,
    specialMatch: "only",
    defaultAmount: 10_000,
    splitEligible: false,
  },
] as const;

// ─────────────────────────────────────────────
// Match Result
// ─────────────────────────────────────────────

/** Kết quả match 1 line với kết quả quay. */
export interface LineMatchResult {
  /** Hạng giải trúng. null nếu không trúng. */
  tier: Lotto535PrizeTier | null;

  /** Số lượng số chính trùng (0-5). */
  mainMatchCount: number;

  /** Số đặc biệt có trùng không. */
  specialMatched: boolean;
}

// ─────────────────────────────────────────────
// Matching Function
// ─────────────────────────────────────────────

/**
 * Xác định hạng giải cho 1 line dựa trên số lượng match.
 *
 * @param mainMatchCount - Số lượng số chính trùng (0-5)
 * @param specialMatched - Số đặc biệt có trùng không
 * @returns Hạng giải hoặc null nếu không trúng
 *
 * @example
 * ```ts
 * determineTier(5, true)   // → "jackpot"
 * determineTier(5, false)  // → "tier1"
 * determineTier(4, true)   // → "tier2"
 * determineTier(4, false)  // → "tier3"
 * determineTier(3, true)   // → "tier4"
 * determineTier(3, false)  // → "tier5"
 * determineTier(1, true)   // → "consolation"
 * determineTier(2, false)  // → null (không trúng)
 * ```
 */
export function determineTier(
  mainMatchCount: number,
  specialMatched: boolean,
): Lotto535PrizeTier | null {
  for (const rule of DEFAULT_PRIZE_TIER_RULES) {
    if (rule.specialMatch === "only") {
      // Consolation: trùng đặc biệt + ≤ 2 số chính (không đủ điều kiện tier cao hơn)
      if (specialMatched && mainMatchCount <= 2) {
        return rule.tier;
      }
      continue;
    }

    if (mainMatchCount >= rule.mainMatch) {
      if (rule.specialMatch && specialMatched) {
        return rule.tier;
      }
      if (!rule.specialMatch && !specialMatched) {
        return rule.tier;
      }
      // 5 chính + đặc biệt: match jackpot (rule đầu tiên)
      // 5 chính, không đặc biệt: skip jackpot, match tier1
      if (!rule.specialMatch && mainMatchCount >= rule.mainMatch) {
        return rule.tier;
      }
    }
  }

  return null;
}

/**
 * Lookup PrizeTierRule theo tier.
 * Dùng khi cần lấy label, defaultAmount, splitEligible...
 */
export function getPrizeTierRule(
  tier: Lotto535PrizeTier,
): PrizeTierRule | undefined {
  return DEFAULT_PRIZE_TIER_RULES.find((r) => r.tier === tier);
}

/**
 * Tạo map giải thưởng với amounts tuỳ chỉnh.
 * Merge defaultPrizes từ config lên DEFAULT_PRIZE_TIER_RULES.
 *
 * @param prizeAmounts - Giá trị giải thưởng tuỳ chỉnh (từ gameConfig.defaultPrizes)
 * @returns Map<tier, amount>
 */
export function buildPrizeAmountMap(
  prizeAmounts: Record<string, number>,
): ReadonlyMap<Lotto535PrizeTier, number> {
  const map = new Map<Lotto535PrizeTier, number>();

  for (const rule of DEFAULT_PRIZE_TIER_RULES) {
    const amount = prizeAmounts[rule.tier] ?? rule.defaultAmount;
    map.set(rule.tier, amount);
  }

  return map;
}
