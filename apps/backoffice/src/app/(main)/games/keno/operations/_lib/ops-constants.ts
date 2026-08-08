/**
 * Keno Operations — Hằng số & label dùng chung cho trang Vận hành (p0-07).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn.
 * Ngưỡng vận hành THẬT (exposureWarnPct, sidebetSkewPct, comboSetsWarn, maxSetsForFixed)
 * nay đến từ `snapshot.thresholds` (server đọc GlobalConfig). Hằng số fallback ở đây
 * CHỈ dùng khi slice threshold chưa về (loading) — tô màu, KHÔNG sinh alert.
 */

import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS } from "@megawin/game-keno/labels";
import { KenoOpsAlertType, OpsAlertSeverity } from "@megawin/game-keno/entities";

/**
 * Label tiếng Việt cho từng loại alert vận hành Keno.
 *
 * `@megawin/game-keno/labels` chưa có map này → khai tại đây (shared _lib) theo
 * đúng plan p0-07. Khoá đầy đủ theo `KenoOpsAlertType` → thêm loại mới, compiler
 * bắt thiếu khoá (Record dẫn xuất từ const-as-const).
 */
export const KENO_OPS_ALERT_TYPE_LABELS: Record<KenoOpsAlertType, string> = {
  [KenoOpsAlertType.LargeBet]: "Cược lớn",
  [KenoOpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [KenoOpsAlertType.SidebetSkew]: "Lệch side bet",
  [KenoOpsAlertType.CapSetsNear]: "Gần chạm cap",
  [KenoOpsAlertType.ComboConcentration]: "Dồn bộ số",
  [KenoOpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [KenoOpsAlertType.SettleStuck]: "Kết sổ treo",
};

/**
 * Ngưỡng lệch side bet (%) — fallback client CHỈ khi `snapshot.thresholds.sidebetSkewPct`
 * chưa về (loading). Nếu 1 hướng ≥ ngưỡng của tổng cặp → tô amber. Server sinh alert
 * `sidebet_skew` theo config; UI tô màu theo threshold từ snapshot (§4.3).
 */
export const SIDEBET_SKEW_PCT_DEFAULT = 70;

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};

// ─── UI-only color palette (chỉ dùng ở web — gom 1 nơi cho game Keno) ──────────

/** Style token cho 1 pick/side-bet card: dot màu, text, fill donut, bg, border. */
export interface KenoPlayTypeStyle {
  dot: string;
  text: string;
  fill: string;
  bg: string;
  border: string;
}

/**
 * Màu cho từng pick (1→10): gradient amber (Pick 1, ít số/ấm) → red (Pick 10, nhiều số/đỏ).
 *
 * CHỈ dùng ở UI (analytics panels, donut). Gom về đây để đổi 1 chỗ → mọi nơi web đổi
 * theo (frontend rule §8 — không rải palette trong từng .tsx). Key = pickCount (1-10).
 */
export const KENO_PICK_STYLES: Record<number, KenoPlayTypeStyle> = {
  1: {
    dot: "bg-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    fill: "#fbbf24",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-200/60 dark:border-amber-800/40",
  },
  2: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    fill: "#f59e0b",
    bg: "bg-amber-50/70 dark:bg-amber-950/25",
    border: "border-amber-200/70 dark:border-amber-800/40",
  },
  3: {
    dot: "bg-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    fill: "#fb923c",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
    border: "border-orange-200/60 dark:border-orange-800/40",
  },
  4: {
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    fill: "#f97316",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
    border: "border-orange-200/60 dark:border-orange-800/40",
  },
  5: {
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    fill: "#f97316",
    bg: "bg-orange-50/70 dark:bg-orange-950/25",
    border: "border-orange-200/70 dark:border-orange-800/40",
  },
  6: {
    dot: "bg-orange-600",
    text: "text-orange-700 dark:text-orange-400",
    fill: "#ea580c",
    bg: "bg-orange-50/70 dark:bg-orange-950/25",
    border: "border-orange-300/60 dark:border-orange-800/40",
  },
  7: {
    dot: "bg-red-400",
    text: "text-red-600 dark:text-red-400",
    fill: "#f87171",
    bg: "bg-red-50/60 dark:bg-red-950/20",
    border: "border-red-200/60 dark:border-red-800/40",
  },
  8: {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    fill: "#ef4444",
    bg: "bg-red-50/60 dark:bg-red-950/20",
    border: "border-red-200/60 dark:border-red-800/40",
  },
  9: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    fill: "#ef4444",
    bg: "bg-red-50/70 dark:bg-red-950/25",
    border: "border-red-300/60 dark:border-red-800/40",
  },
  10: {
    dot: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
    fill: "#dc2626",
    bg: "bg-red-50/70 dark:bg-red-950/25",
    border: "border-red-300/70 dark:border-red-800/40",
  },
};

/**
 * Màu + label cho 2 side bet (bigSmall/evenOdd). CHỈ dùng ở UI.
 * `label` lấy từ core labels (KHÔNG viết lại text tiếng Việt) — chỉ palette là UI-only.
 */
export const KENO_SIDE_BET_STYLES: Record<"bigSmall" | "evenOdd", KenoPlayTypeStyle & { label: string }> = {
  bigSmall: {
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    fill: "#0ea5e9",
    bg: "bg-sky-50/70 dark:bg-sky-950/25",
    border: "border-sky-200/60 dark:border-sky-800/40",
    label: `${KENO_BIG_SMALL_BET_LABELS.big} / ${KENO_BIG_SMALL_BET_LABELS.small}`,
  },
  evenOdd: {
    dot: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-400",
    fill: "#14b8a6",
    bg: "bg-teal-50/70 dark:bg-teal-950/25",
    border: "border-teal-200/60 dark:border-teal-800/40",
    label: `${KENO_EVEN_ODD_BET_LABELS.even} / ${KENO_EVEN_ODD_BET_LABELS.odd}`,
  },
};
