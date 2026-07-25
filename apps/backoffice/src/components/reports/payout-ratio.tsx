import { formatNumber } from "@megawin/shared/utils";

import { cn } from "@/lib/utils";

/** Ngưỡng cảnh báo tỷ lệ trả thưởng (giá trị ratio, KHÔNG nhân 100). */
const PAYOUT_THRESHOLDS = {
  /** Trên ngưỡng này → text-loss (đỏ). */
  danger: 0.95,
  /** Trên ngưỡng này → text-warning (vàng). */
  warning: 0.8,
} as const;

/**
 * Trả về Tailwind color class cho tỷ lệ trả thưởng.
 *
 * - ratio > 95%: `text-loss` (đỏ)
 * - ratio > 80%: `text-warning` (vàng)
 * - otherwise: mặc định (không thêm class)
 *
 * @param ratio - Tỷ lệ trả thưởng chưa nhân 100 (ví dụ 0.75 = 75%).
 */
export function getPayoutRatioColor(ratio: number): string {
  if (ratio > PAYOUT_THRESHOLDS.danger) return "text-loss";
  if (ratio > PAYOUT_THRESHOLDS.warning) return "text-warning";
  return "";
}

/**
 * Format tỷ lệ trả thưởng: `formatNumber(ratio * 100, { decimals: 1 }) + "%"`.
 * Đảm bảo có thousand separator khi giá trị % > 1,000.
 *
 * @param ratio - Tỷ lệ trả thưởng chưa nhân 100 (ví dụ 0.75 = 75%).
 */
export function formatPayoutRatio(ratio: number): string {
  const pct = ratio * 100;
  return `${formatNumber(pct, { decimals: 1 })}%`;
}

/**
 * Trả về Tailwind color class cho lợi nhuận ròng.
 * - Âm → `text-loss` (đỏ)
 * - Dương → `text-profit` (xanh)
 * - Zero → mặc định
 */
export function getNetProfitColor(value: number): string {
  if (value < 0) return "text-loss";
  if (value > 0) return "text-profit";
  return "";
}

// ─── React Components ────────────────────────────────────────────────────────

interface PayoutRatioProps {
  /** Tỷ lệ trả thưởng chưa nhân 100 (ví dụ 0.75 = 75%). */
  ratio: number;
  className?: string;
}

/**
 * Hiển thị tỷ lệ trả thưởng trong bảng báo cáo.
 * Format: `formatNumber` với thousand separator + color coding theo ngưỡng.
 */
export function PayoutRatioCell({ ratio, className }: PayoutRatioProps) {
  return <span className={cn("tabular-nums", getPayoutRatioColor(ratio), className)}>{formatPayoutRatio(ratio)}</span>;
}

/**
 * Hiển thị tỷ lệ trả thưởng trong KPI card.
 * Format: `formatPayoutRatio` + color coding theo ngưỡng.
 */
export function PayoutRatioKpi({ ratio, className }: PayoutRatioProps) {
  return <span className={cn("tabular-nums", getPayoutRatioColor(ratio), className)}>{formatPayoutRatio(ratio)}</span>;
}

// ─── Badge cho KPI card gộp ───────────────────────────────────────────────────

/**
 * Badge hiển thị tỷ lệ trả thưởng trong KPI card "Trả thưởng" (Phương án C).
 *
 * Layout: `Tỷ lệ TT  [56,494.4%]`
 * - Label "Tỷ lệ TT" dạng text muted bình thường — chỉ cung cấp context.
 * - Badge chỉ bọc số — màu theo ngưỡng rủi ro (đỏ/vàng/xanh).
 */
export function PayoutRatioKpiBadge({ ratio, className }: PayoutRatioProps) {
  const color = getPayoutRatioColor(ratio);

  // badge background + text tương ứng với ngưỡng
  const badgeClass =
    color === "text-loss"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
      : color === "text-warning"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
        : "bg-muted text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-[11px] text-muted-foreground">Tỷ lệ TT</span>
      <span
        className={cn(
          "inline-flex items-center rounded px-1 py-0.5 text-[11px] font-semibold tabular-nums",
          badgeClass,
        )}
      >
        {formatPayoutRatio(ratio)}
      </span>
    </span>
  );
}
