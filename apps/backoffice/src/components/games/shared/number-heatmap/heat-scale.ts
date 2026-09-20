/**
 * Heatmap intensity scale — dùng chung mọi game ops (P1-05 → financial-cool 20/09).
 *
 * Lịch sử đổi màu (2 lần trước đều bị user reject):
 * 1. amber-100→800 thuần: cold/low/mid quá sáng, "loá" khi nhìn lâu.
 * 2. stone + amber-700/950 (soft-eye): badge cam đậm nổi trên patch stone/muted rời
 *    rạc → nhìn như "chấm highlighter" lem trên nền loang lổ, không giống 1 thang
 *    nhiệt liên tục — user chê "xấu, không chuyên nghiệp".
 *
 * Nguyên nhân gốc: amber/orange đã là màu NGỮ NGHĨA cảnh báo trong design system
 * (`--warning` = amber-500, xem globals.css) — tái dùng cho heatmap mật độ cược
 * (một chỉ số trung tính, không phải risk alert) gây xung đột: nhân viên nhìn ô
 * cam/vàng dễ hiểu lầm "có cảnh báo" trong khi chỉ là "nhiều người đặt số này".
 *
 * Giải pháp (financial-cool, theo pattern Bloomberg/Grafana/Datadog cho panel
 * volume/monitor dài hạn — luôn dùng gam LẠNH đơn sắc cho dữ liệu trung tính,
 * chừa đỏ/vàng cho đúng nghĩa risk-alert thật ở nơi khác của app, vd panel
 * "Top phải trả tiềm năng"):
 * - Thang ĐƠN SẮC (1 hue/lane), tăng dần độ đậm — không nhảy hue giữa các mức.
 * - cold (0 cược): hoàn toàn trong suốt — đúng nghĩa "không có dữ liệu".
 * - low/mid: cell tint RẤT nhạt (6–12% opacity) — liên tục, không "" rồi nhảy
 *   thẳng lên patch đậm (đó là nguồn gây cảm giác loang lổ ở bản trước).
 * - warm/hot: đậm dần, hot có ring mỏng để phân biệt rõ khỏi warm khi liếc nhanh.
 * - Main lane = blue (slate→blue, trung tính, không đụng token nào khác).
 * - Lotto Special (ĐB) = indigo — vẫn cool/professional, đủ tách khỏi main.
 */

export const HeatLevel = {
  Cold: "cold",
  Low: "low",
  Mid: "mid",
  Warm: "warm",
  Hot: "hot",
} as const;
export type HeatLevel = (typeof HeatLevel)[keyof typeof HeatLevel];

/** Badge intensity — blue, dùng cho main lane mọi game (Keno / Mega645 / Power655 / Lotto main). */
export const HEAT_BADGE_STYLES_BLUE: Record<HeatLevel, string> = {
  cold: "bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
  low: "bg-slate-200/80 text-slate-600 dark:bg-slate-700/45 dark:text-slate-300",
  mid: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
  warm: "bg-blue-500 text-white dark:bg-blue-600",
  hot: "bg-blue-700 text-white ring-2 ring-blue-300/70 dark:bg-blue-500 dark:ring-blue-300/50",
};

/** Cell tint — blue liên tục từ mid, tránh "nhảy" từ trong suốt lên patch đậm. */
export const HEAT_CELL_BG_BLUE: Record<HeatLevel, string> = {
  cold: "",
  low: "bg-slate-50/60 dark:bg-slate-800/20",
  mid: "bg-blue-50/70 dark:bg-blue-950/25",
  warm: "bg-blue-100/70 dark:bg-blue-950/40",
  hot: "bg-blue-100 dark:bg-blue-900/45",
};

/** Badge — Lotto Special (ĐB): indigo, cùng cấu trúc luminance với blue. */
export const HEAT_BADGE_STYLES_INDIGO: Record<HeatLevel, string> = {
  cold: "bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
  low: "bg-slate-200/80 text-slate-600 dark:bg-slate-700/45 dark:text-slate-300",
  mid: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200",
  warm: "bg-indigo-500 text-white dark:bg-indigo-600",
  hot: "bg-indigo-700 text-white ring-2 ring-indigo-300/70 dark:bg-indigo-500 dark:ring-indigo-300/50",
};

/** Cell tint — Lotto Special. */
export const HEAT_CELL_BG_INDIGO: Record<HeatLevel, string> = {
  cold: "",
  low: "bg-slate-50/60 dark:bg-slate-800/20",
  mid: "bg-indigo-50/70 dark:bg-indigo-950/25",
  warm: "bg-indigo-100/70 dark:bg-indigo-950/40",
  hot: "bg-indigo-100 dark:bg-indigo-900/45",
};

/**
 * Map amount/count → heat level (ngưỡng giữ nguyên mọi game).
 * `value === 0` hoặc `max === 0` → cold.
 */
export function getHeatLevel(value: number, max: number): HeatLevel {
  if (value === 0 || max === 0) {
    return HeatLevel.Cold;
  }
  const ratio = value / max;
  if (ratio >= 0.8) {
    return HeatLevel.Hot;
  }
  if (ratio >= 0.55) {
    return HeatLevel.Warm;
  }
  if (ratio >= 0.3) {
    return HeatLevel.Mid;
  }
  if (ratio >= 0.1) {
    return HeatLevel.Low;
  }
  return HeatLevel.Cold;
}
