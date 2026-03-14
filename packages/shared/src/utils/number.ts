/**
 * Làm tròn số đến `decimals` chữ số thập phân.
 *
 * roundTo(0.12345, 2)  → 0.12
 * roundTo(1.005, 2)    → 1.01  (tránh floating-point quirk nhờ EPSILON)
 * roundTo(3.456, 0)    → 3
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

type FormatCompactCurrencyOptions = {
  decimals?: number; // số chữ số thập phân mặc định
  trimTrailingZeros?: boolean; // bỏ .0 / .00 ở cuối
  thousand?: string; // suffix cho nghìn (mặc định K)
  million?: string; // suffix cho triệu (mặc định M)
  billion?: string; // suffix cho tỷ (mặc định B)
  trillion?: string; // suffix cho nghìn tỷ (mặc định T)
};

/**
 * Định dạng số tiền theo compact format
 * @param value - Giá trị cần định dạng
 * @param options - Các options định dạng
 * @returns
 */
export function formatCurrency(
  value: number,
  {
    decimals = 1,
    trimTrailingZeros = true,
    thousand = "K",
    million = "M",
    billion = "B",
    trillion = "T",
  }: FormatCompactCurrencyOptions = {},
): string {
  if (!Number.isFinite(value)) return String(value);

  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);

  const format = (num: number, d: number) => {
    let s = num.toFixed(d);

    // Bỏ .0 / .00 ở cuối
    if (trimTrailingZeros) {
      s = s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }

    return s;
  };

  // Nghìn tỷ
  if (n >= 1_000_000_000_000) return `${sign}${format(n / 1_000_000_000_000, decimals)}${trillion}`;

  // Tỷ
  if (n >= 1_000_000_000) return `${sign}${format(n / 1_000_000_000, decimals)}${billion}`;

  // Triệu
  if (n >= 1_000_000) return `${sign}${format(n / 1_000_000, decimals)}${million}`;

  // Nghìn
  if (n >= 1_000) return `${sign}${format(n / 1_000, decimals)}${thousand}`;

  // < 1,000: giữ nguyên, vẫn có thể cắt thập phân nếu muốn
  return `${sign}${format(n, 0)}`;
}

/**
 * Định dạng số tiền VND đầy đủ (1,000,000 ₫).
 * Null-safe: trả "0 ₫" cho undefined/null.
 */
export function formatVND(amount: number | undefined | null): string {
  return (amount ?? 0).toLocaleString("en-US") + " ₫";
}

/**
 * Định dạng số tiền VND dạng compact tiếng Việt (1.5 tỷ, 200 triệu).
 * Null-safe: trả "0 ₫" cho undefined/null.
 */
export function formatVNDCompact(amount: number | undefined | null): string {
  const n = amount ?? 0;
  if (n >= 1_000_000_000) {
    const billions = n / 1_000_000_000;
    return `${billions.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  }
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu`;
  }
  return n.toLocaleString("vi-VN") + " ₫";
}

/**
 * Định dạng phần trăm, 1 decimal mặc định. Null-safe.
 *
 * formatPercent(72.5)          → "72.5%"
 * formatPercent(72.5, 0)       → "73%"
 * formatPercent(-3.14, 2)      → "-3.14%"
 * formatPercent(undefined)     → "0.0%"
 */
export function formatPercent(value: number | undefined | null, decimals: number = 1): string {
  return `${(value ?? 0).toFixed(decimals)}%`;
}

type FormatNumberOptions = {
  decimals?: number;
  trimTrailingZeros?: boolean;
};

/**
 * Định dạng số theo format số kiểu US (en-US)
 * - Dấu phân cách hàng nghìn: `,`
 * - Dấu thập phân: `.`
 * @param value - Giá trị cần định dạng
 * @param options - decimals: số chữ số thập phân, trimTrailingZeros: bỏ .0 / .00 ở cuối
 */
export function formatNumber(
  value: number,
  { decimals = 0, trimTrailingZeros = true }: FormatNumberOptions = {},
): string {
  if (!Number.isFinite(value)) return String(value);

  const d = Math.max(0, decimals);

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: trimTrailingZeros ? 0 : d,
    maximumFractionDigits: d,
  });

  const formatted = formatter.format(value);

  if (!trimTrailingZeros || d === 0) return formatted;

  // Trim 0 dư ở cuối phần thập phân (nếu có)
  return formatted.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
