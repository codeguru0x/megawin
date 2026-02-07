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
  }: FormatCompactCurrencyOptions = {}
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
  if (n >= 1_000_000_000_000)
    return `${sign}${format(n / 1_000_000_000_000, decimals)}${trillion}`;

  // Tỷ
  if (n >= 1_000_000_000)
    return `${sign}${format(n / 1_000_000_000, decimals)}${billion}`;

  // Triệu
  if (n >= 1_000_000)
    return `${sign}${format(n / 1_000_000, decimals)}${million}`;

  // Nghìn
  if (n >= 1_000) return `${sign}${format(n / 1_000, decimals)}${thousand}`;

  // < 1,000: giữ nguyên, vẫn có thể cắt thập phân nếu muốn
  return `${sign}${format(n, 0)}`;
}

type FormatNumberOptions = {
  decimals?: number; // số chữ số thập phân
  trimTrailingZeros?: boolean; // bỏ .0 / .00 ở cuối
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
  { decimals = 0, trimTrailingZeros = true }: FormatNumberOptions = {}
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
