const COMPACT_TIERS = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
] as const;

export interface FormatCompactNumberOptions {
  decimals?: number;
  trailingZeros?: boolean;
}

/**
 * Format a number into compact notation: K (thousand), M (million), B (billion).
 *
 * @example
 * formatCompactNumber(1500)        // "1.50K"
 * formatCompactNumber(2500000)     // "2.50M"
 * formatCompactNumber(1200000000)  // "1.20B"
 * formatCompactNumber(999)         // "999"
 * formatCompactNumber(1500, { decimals: 0 }) // "2K"
 * formatCompactNumber(1550, { decimals: 1 }) // "1.6K"
 * formatCompactNumber(1000, { trailingZeros: false }) // "1K"
 */
export function formatCompactNumber(value: number, options?: FormatCompactNumberOptions): string {
  const { decimals = 2, trailingZeros = true } = options ?? {};

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  for (const { threshold, suffix } of COMPACT_TIERS) {
    if (absValue >= threshold) {
      const scaled = absValue / threshold;
      const formatted = trailingZeros ? scaled.toFixed(decimals) : parseFloat(scaled.toFixed(decimals)).toString();
      return `${sign}${formatted}${suffix}`;
    }
  }

  return trailingZeros ? `${sign}${absValue.toFixed(decimals)}` : `${sign}${absValue}`;
}
