/**
 * Keno Operations — Hằng số & label dùng chung cho trang Vận hành (p0-07).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn.
 * Ngưỡng vận hành THẬT (exposureWarnPct, sidebetSkewPct, comboSetsWarn, maxSetsForFixed)
 * nay đến từ `snapshot.thresholds` (server đọc GlobalConfig). Hằng số fallback ở đây
 * CHỈ dùng khi slice threshold chưa về (loading) — tô màu, KHÔNG sinh alert.
 */

import { KenoOpsAlertType, OpsAlertSeverity } from "@megawin/game-keno/entities";
import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS } from "@megawin/game-keno/labels";

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
    dot: "bg-warning",
    text: "text-warning",
    fill: "#fbbf24",
    bg: "bg-warning/60",
    border: "border-warning/60",
  },
  2: {
    dot: "bg-warning",
    text: "text-warning",
    fill: "#f59e0b",
    bg: "bg-warning/70",
    border: "border-warning/70",
  },
  3: {
    dot: "bg-warning",
    text: "text-warning",
    fill: "#fb923c",
    bg: "bg-warning/60",
    border: "border-warning/60",
  },
  4: {
    dot: "bg-warning",
    text: "text-warning",
    fill: "#f97316",
    bg: "bg-warning/60",
    border: "border-warning/60",
  },
  5: {
    dot: "bg-warning",
    text: "text-warning",
    fill: "#f97316",
    bg: "bg-warning/70",
    border: "border-warning/70",
  },
  6: {
    dot: "bg-warning",
    text: "text-warning",
    fill: "#ea580c",
    bg: "bg-warning/70",
    border: "border-warning/60",
  },
  7: {
    dot: "bg-loss",
    text: "text-loss",
    fill: "#f87171",
    bg: "bg-loss/60",
    border: "border-loss/60",
  },
  8: {
    dot: "bg-loss",
    text: "text-loss",
    fill: "#ef4444",
    bg: "bg-loss/60",
    border: "border-loss/60",
  },
  9: {
    dot: "bg-loss",
    text: "text-loss",
    fill: "#ef4444",
    bg: "bg-loss/70",
    border: "border-loss/60",
  },
  10: {
    dot: "bg-loss",
    text: "text-loss",
    fill: "#dc2626",
    bg: "bg-loss/70",
    border: "border-loss/70",
  },
};

/**
 * Màu + label cho 2 side bet (bigSmall/evenOdd). CHỈ dùng ở UI.
 * `label` lấy từ core labels (KHÔNG viết lại text tiếng Việt) — chỉ palette là UI-only.
 */
export const KENO_SIDE_BET_STYLES: Record<"bigSmall" | "evenOdd", KenoPlayTypeStyle & { label: string }> = {
  bigSmall: {
    dot: "bg-info",
    text: "text-info",
    fill: "#0ea5e9",
    bg: "bg-info/70",
    border: "border-info/60",
    label: `${KENO_BIG_SMALL_BET_LABELS.big} / ${KENO_BIG_SMALL_BET_LABELS.small}`,
  },
  evenOdd: {
    dot: "bg-game-mega645",
    text: "text-game-mega645",
    fill: "#14b8a6",
    bg: "bg-game-mega645/70",
    border: "border-game-mega645/60",
    label: `${KENO_EVEN_ODD_BET_LABELS.even} / ${KENO_EVEN_ODD_BET_LABELS.odd}`,
  },
};
