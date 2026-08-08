"use client";

/**
 * Power 6/55 Operations — Analytics Panels
 *
 * PlayTypeCard: phân bổ 12 kiểu chơi (standard, bao5, bao7-bao18) — grid card + donut %,
 *   nhấn nhóm Bao cao (bao13-18) bằng palette nóng. KHÔNG có side bet (khác Keno).
 * TopRiskPanel: cụm 3 bảng rủi ro — Top người chơi | Top phải trả | Bộ số phổ biến.
 * TenantBreakdownCard: doanh thu / hoa hồng theo đại lý (≤3 → card, >3 → bảng compact).
 *
 * Nguồn: `snapshot.topAccounts` / `stats.topPotential` / `snapshot.topCombos` (BE sort sẵn) —
 * FE chỉ render. Username qua `PlayerOutstandingLink` (rule player-display-username.mdc).
 */

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { PlayType } from "@megawin/game-power655/entities";
import { POWER655_PLAY_TYPE_LABELS } from "@megawin/game-power655/labels";
import { PLAY_TYPE_CONFIGS } from "@megawin/game-power655/rules";
import { formatNumber } from "@megawin/shared/utils";
import { BarChart2, Receipt, Store, TrendingUp, Trophy, Users } from "lucide-react";

import { PlayerOutstandingLink } from "@/components/player-name";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { PlayTypeRow, TenantRow, TopAccountRow, TopComboRow, TopPotentialRow } from "../../types";
import { NumberBadge } from "./number-heatmap";

// ─── Color palette — Power 6/55 (red brand + phân biệt bao) ─────────────────
// Standard = red (brand). Bao thấp → lạnh (green/blue), Bao cao (13-18) → nóng
// (violet→rose) để staff nhận diện nhanh nhóm rủi ro board đắt.

export const PLAY_TYPE_COLORS: Record<string, { dot: string; text: string; fill: string; bg: string; border: string }> =
  {
    standard: {
      dot: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
      fill: "#dc2626",
      bg: "bg-red-50/60 dark:bg-red-950/20",
      border: "border-red-200/60 dark:border-red-800/40",
    },
    bao5: {
      dot: "bg-green-500",
      text: "text-green-600 dark:text-green-400",
      fill: "#22c55e",
      bg: "bg-green-50/60 dark:bg-green-950/20",
      border: "border-green-200/60 dark:border-green-800/40",
    },
    bao7: {
      dot: "bg-indigo-500",
      text: "text-indigo-600 dark:text-indigo-400",
      fill: "#6366f1",
      bg: "bg-indigo-50/60 dark:bg-indigo-950/20",
      border: "border-indigo-200/60 dark:border-indigo-800/40",
    },
    bao8: {
      dot: "bg-blue-500",
      text: "text-blue-600 dark:text-blue-400",
      fill: "#3b82f6",
      bg: "bg-blue-50/60 dark:bg-blue-950/20",
      border: "border-blue-200/60 dark:border-blue-800/40",
    },
    bao9: {
      dot: "bg-sky-500",
      text: "text-sky-600 dark:text-sky-400",
      fill: "#0ea5e9",
      bg: "bg-sky-50/60 dark:bg-sky-950/20",
      border: "border-sky-200/60 dark:border-sky-800/40",
    },
    bao10: {
      dot: "bg-cyan-500",
      text: "text-cyan-600 dark:text-cyan-400",
      fill: "#06b6d4",
      bg: "bg-cyan-50/60 dark:bg-cyan-950/20",
      border: "border-cyan-200/60 dark:border-cyan-800/40",
    },
    bao11: {
      dot: "bg-teal-500",
      text: "text-teal-600 dark:text-teal-400",
      fill: "#14b8a6",
      bg: "bg-teal-50/60 dark:bg-teal-950/20",
      border: "border-teal-200/60 dark:border-teal-800/40",
    },
    bao12: {
      dot: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      fill: "#10b981",
      bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
      border: "border-emerald-200/60 dark:border-emerald-800/40",
    },
    bao13: {
      dot: "bg-violet-500",
      text: "text-violet-600 dark:text-violet-400",
      fill: "#8b5cf6",
      bg: "bg-violet-50/60 dark:bg-violet-950/20",
      border: "border-violet-200/60 dark:border-violet-800/40",
    },
    bao14: {
      dot: "bg-fuchsia-500",
      text: "text-fuchsia-600 dark:text-fuchsia-400",
      fill: "#d946ef",
      bg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20",
      border: "border-fuchsia-200/60 dark:border-fuchsia-800/40",
    },
    bao15: {
      dot: "bg-pink-500",
      text: "text-pink-600 dark:text-pink-400",
      fill: "#ec4899",
      bg: "bg-pink-50/60 dark:bg-pink-950/20",
      border: "border-pink-200/60 dark:border-pink-800/40",
    },
    bao18: {
      dot: "bg-rose-500",
      text: "text-rose-600 dark:text-rose-400",
      fill: "#f43f5e",
      bg: "bg-rose-50/60 dark:bg-rose-950/20",
      border: "border-rose-200/60 dark:border-rose-800/40",
    },
  };

const DEFAULT_COLOR = {
  dot: "bg-muted-foreground/40",
  text: "text-muted-foreground",
  fill: "#94a3b8",
  bg: "bg-muted/10",
  border: "border-border/40",
};

// ─── Shared Mini Donut ─────────────────────────────────────────────────────

function MiniDonut({
  pct,
  fill,
  size,
  className,
}: {
  pct: number;
  fill: string;
  size: number;
  /** Cho phép định vị donut (VD `absolute`) mà không đẩy layout flow xung quanh. */
  className?: string;
}) {
  const stroke = size < 40 ? 4 : 5;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 99.9);
  const filled = (clamped / 100) * circumference;
  const label = `${Math.round(pct)}%`;
  const baseFontSize = size < 40 ? 7.5 : 9;
  const fontSize = label.length >= 4 ? baseFontSize - 1.5 : baseFontSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)}>
      <title>{label}</title>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/60" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={700}
        fill={fill}
        fontFamily="inherit"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── PlayType Item (1 card compact trong grid) ──────────────────────────────

function PlayTypeItem({ d }: { d: PlayTypeRow }) {
  const color = PLAY_TYPE_COLORS[d.playType] ?? DEFAULT_COLOR;
  const isEmpty = d.sets === 0;

  return (
    <div
      className={cn(
        "relative rounded-xl border p-3 flex flex-col gap-1.5 transition-all min-w-0",
        isEmpty && "opacity-40",
        color.bg,
        color.border,
      )}
      title={d.label}
    >
      {/* Donut nổi góc phải-trên bằng `absolute` — không chiếm chỗ trong flex flow. */}
      <MiniDonut pct={d.pct} fill={color.fill} size={44} className="absolute top-1.5 right-1.5" />
      <div className="flex items-center gap-1.5 min-w-0 pr-11">
        <div className={cn("size-2 rounded-full shrink-0", color.dot)} />
        <span className={cn("text-xs font-semibold truncate", color.text)}>{d.label}</span>
      </div>
      {/* Doanh thu (nổi bật) + số bộ/board (phụ) — neo đáy card, cùng baseline. */}
      <div className="mt-auto flex items-baseline justify-between gap-2 pr-11">
        <p className="min-w-0 text-sm font-bold tabular-nums text-foreground leading-none truncate">
          {formatNumber(d.revenue)}
        </p>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          <span className="font-semibold text-foreground">{formatNumber(d.sets)}</span> bộ
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          <span className="font-semibold text-foreground">{formatNumber(d.boards)}</span> board
        </span>
      </div>
    </div>
  );
}

/**
 * Phân bổ 12 kiểu chơi Power 6/55. Thứ tự cố định theo `PLAY_TYPE_CONFIGS` (standard →
 * bao5 → bao7…bao18) — LUÔN hiện đủ 12 card kể cả kiểu chưa có cược (opacity giảm),
 * để staff thấy toàn cảnh, không phải đoán kiểu nào vắng. KHÔNG có side bet (khác Keno).
 */
export function PlayTypeCard({ distribution }: { distribution: PlayTypeRow[] }) {
  // Thứ tự + fill zero từ PLAY_TYPE_CONFIGS (nguồn duy nhất liệt kê 12 PlayType).
  const byType = new Map(distribution.map((d) => [d.playType, d]));
  const rows = (Object.keys(PLAY_TYPE_CONFIGS) as PlayType[]).map(
    (pt) =>
      byType.get(pt) ?? {
        playType: pt,
        label: POWER655_PLAY_TYPE_LABELS[pt] ?? pt,
        sets: 0,
        boards: 0,
        revenue: 0,
        pct: 0,
      },
  );

  const totalSets = rows.reduce((a, d) => a + d.sets, 0);
  const totalRevenue = rows.reduce((a, d) => a + d.revenue, 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50 shrink-0">
              <BarChart2 className="size-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Phân bổ kiểu chơi</CardTitle>
              <CardDescription className="text-xs mt-0.5">Standard · Bao 5 · Bao 7–18</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{formatNumber(totalSets)}</span>
            <span>bộ</span>
            <span className="opacity-40">·</span>
            <span className="font-semibold text-foreground">{formatNumber(totalRevenue)}</span>
            <span>VND</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="grid grid-cols-2 @[560px]/main:grid-cols-3 @[820px]/main:grid-cols-4 gap-2.5 auto-rows-fr">
          {rows.map((d) => (
            <PlayTypeItem key={d.playType} d={d} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Risk Cluster (Top người chơi + Top phải trả + Bộ số phổ biến) ──────────

/**
 * Cụm 3 bảng rủi ro/concentration cạnh nhau (analysis §4.8):
 * **Top người chơi** (ai dồn tiền) | **Top phải trả tiềm năng** (entry trả nặng giải cố định) |
 * **Bộ số phổ biến** (bộ nào bị nhiều người dồn — tín hiệu `combo_concentration`/syndicate).
 *
 * Nguồn `snapshot.topAccounts` / `stats.topPotential` / `snapshot.topCombos` — worker/BE
 * sort sẵn, FE chỉ render. Mỗi dòng người chơi link outstanding player kỳ này.
 *
 * @param drawId - Kỳ đang xem — dựng link outstanding.
 */
export function TopRiskPanel({
  drawId,
  topAccounts,
  topPotential,
  topCombos,
}: {
  drawId: string;
  topAccounts: TopAccountRow[];
  topPotential: TopPotentialRow[];
  topCombos: TopComboRow[];
}) {
  if (topAccounts.length === 0 && topPotential.length === 0 && topCombos.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 @[640px]/main:grid-cols-2 @[1000px]/main:grid-cols-3 items-start">
      <TopAccountsCard drawId={drawId} rows={topAccounts} />
      <TopPotentialCard drawId={drawId} rows={topPotential} />
      <TopCombosCard rows={topCombos} />
    </div>
  );
}

/** Top người chơi theo tổng tiền cược — dòng tiền vào tô emerald. */
function TopAccountsCard({ drawId, rows }: { drawId: string; rows: TopAccountRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50 shrink-0">
            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Top người chơi</CardTitle>
            <CardDescription className="text-xs mt-0.5">Theo tổng tiền cược trong kỳ</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((a, i) => (
              <div
                key={a.accountId}
                className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
              >
                <RankBadge rank={i + 1} />
                <PlayerOutstandingLink
                  gameProduct={GameProduct.Power655}
                  drawId={drawId}
                  accountId={a.accountId}
                  username={a.username}
                  className="flex-1 min-w-0 text-sm"
                />
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatNumber(a.amount)}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground/60">{formatNumber(a.entries)} vé</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Top phải trả tiềm năng — rủi ro chi trả giải CỐ ĐỊNH per-entry (đỏ, nổi bật). */
function TopPotentialCard({ drawId, rows }: { drawId: string; rows: TopPotentialRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50 shrink-0">
            <TrendingUp className="size-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Top phải trả tiềm năng</CardTitle>
            <CardDescription className="text-xs mt-0.5">Entry rủi ro giải cố định cao nhất nếu trúng</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((p, i) => (
              <div
                key={p.entryId}
                className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
              >
                <RankBadge rank={i + 1} danger />
                <div className="flex-1 min-w-0">
                  <PlayerOutstandingLink
                    gameProduct={GameProduct.Power655}
                    drawId={drawId}
                    accountId={p.accountId}
                    username={p.username}
                    className="text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground/70 tabular-nums mt-0.5">
                    Cược <span className="font-medium text-foreground">{formatNumber(p.amount)}</span>
                  </p>
                </div>
                <div className="shrink-0 rounded-md bg-red-500/10 px-2 py-1 text-right">
                  <p className="text-[10px] text-red-500/70 leading-none">Phải trả</p>
                  <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400 leading-tight">
                    {formatNumber(p.potentialWin)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Bộ số phổ biến nhất — bộ số được nhiều người/nhiều bộ dồn vào (mọi kiểu chơi).
 *
 * Tín hiệu **syndicate / dồn bộ** (họ alert `combo_concentration`): nhiều người cùng ôm 1
 * bộ số → nếu trúng, công ty trả tập trung. Hiển thị `mainNumbers + playType + sets +
 * accounts`. Số nhiều (Bao cao tới 18 số) → wrap đủ, không collapse (panel có không gian).
 */
export function TopCombosCard({ rows }: { rows: TopComboRow[] }) {
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
            <Trophy className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Bộ số phổ biến nhất</CardTitle>
            <CardDescription className="text-xs mt-0.5">Bộ số được nhiều người dồn</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((c) => (
              <div
                key={c.rank}
                className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
              >
                <span className="text-sm leading-none shrink-0 pt-0.5">{medals[c.rank - 1] ?? `#${c.rank}`}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    {c.mainNumbers.map((n) => (
                      <NumberBadge key={n} num={n} variant="soft" />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {POWER655_PLAY_TYPE_LABELS[c.playType] ?? c.playType}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold tabular-nums text-foreground">{formatNumber(c.sets)} bộ</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatNumber(c.accounts)} người</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Badge thứ hạng #N — top 1 highlight, danger tô đỏ (bảng rủi ro). */
function RankBadge({ rank, danger = false }: { rank: number; danger?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums shrink-0",
        rank === 1
          ? danger
            ? "bg-red-500 text-white"
            : "bg-emerald-500 text-white"
          : "bg-muted text-muted-foreground",
      )}
    >
      {rank}
    </span>
  );
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

/**
 * Phân tích theo đại lý. MegaWin core là RGS B2B → số tenant thường rất ít (1–2).
 *
 * Layout thích ứng theo số lượng (analysis §4.8):
 * - **≤ 3 đại lý:** mỗi đại lý 1 card giàu thông tin (doanh thu + hoa hồng + entries + %).
 * - **> 3 đại lý:** bảng compact cuộn.
 *
 * KHÁC Keno: `sets`/`players` per-tenant = null (byTenant không tách 2 field này) → cột
 * "Người chơi" render "—". Xem JSDoc adapter `toTenantRows`.
 */
export function TenantBreakdownCard({ tenants }: { tenants: TenantRow[] }) {
  const maxRevenue = Math.max(...tenants.map((t) => t.revenue), 1);
  const isFew = tenants.length <= 3;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
            <Store className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Phân tích theo đại lý</CardTitle>
            <CardDescription className="text-xs mt-0.5">Doanh thu · Hoa hồng</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : isFew ? (
          <div className="space-y-2.5">
            {tenants.map((t, i) => (
              <TenantDetailCard key={t.tenantId} tenant={t} rank={i + 1} maxRevenue={maxRevenue} />
            ))}
          </div>
        ) : (
          <TenantTable tenants={tenants} maxRevenue={maxRevenue} />
        )}
      </CardContent>
    </Card>
  );
}

/** 1 card đại lý giàu thông tin — dùng khi ít đại lý (≤3). */
function TenantDetailCard({ tenant, rank, maxRevenue }: { tenant: TenantRow; rank: number; maxRevenue: number }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-500/10 text-[11px] font-bold tabular-nums text-blue-600 dark:text-blue-400 shrink-0">
          {rank}
        </span>
        <span className="text-sm font-semibold truncate flex-1">{tenant.tenantId}</span>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
          {tenant.pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500/70 transition-all"
          style={{ width: `${(tenant.revenue / maxRevenue) * 100}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TenantMetric
          icon={TrendingUp}
          label="Doanh thu"
          value={formatNumber(tenant.revenue)}
          accent="text-foreground"
        />
        <TenantMetric
          icon={Receipt}
          label="Hoa hồng"
          value={formatNumber(tenant.commission)}
          accent="text-amber-600 dark:text-amber-400"
        />
        <TenantMetric
          icon={Users}
          label="Người chơi"
          value={tenant.players === null ? "—" : formatNumber(tenant.players)}
          sub={`${formatNumber(tenant.entries)} vé`}
          accent="text-foreground"
        />
      </div>
    </div>
  );
}

/** 1 ô chỉ số trong TenantDetailCard. */
function TenantMetric({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg bg-card border border-border/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums leading-tight", accent)}>{value}</p>
      {sub ? <p className="text-[10px] tabular-nums text-muted-foreground/60">{sub}</p> : null}
    </div>
  );
}

/** Bảng compact — dùng khi nhiều đại lý (>3). */
function TenantTable({ tenants, maxRevenue }: { tenants: TenantRow[]; maxRevenue: number }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <div
        className="grid gap-x-2 px-3 py-2 bg-muted/40 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider"
        style={{ gridTemplateColumns: "1fr 5rem 5rem 6rem" }}
      >
        <span>Đại lý</span>
        <span className="text-right">Entries</span>
        <span className="text-right">Người chơi</span>
        <span className="text-right">Doanh thu</span>
      </div>
      <div className="divide-y divide-border/50 max-h-70 overflow-y-auto">
        {tenants.map((t, i) => (
          <div
            key={t.tenantId}
            className="relative grid gap-x-2 px-3 py-2.5 items-center hover:bg-muted/20 transition-colors"
            style={{ gridTemplateColumns: "1fr 5rem 5rem 6rem" }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-blue-500/5 dark:bg-blue-400/5 rounded-r-sm"
              style={{ width: `${(t.revenue / maxRevenue) * 100}%` }}
            />
            <div className="relative flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-muted-foreground/40 w-4 tabular-nums shrink-0">{i + 1}</span>
              <span className="text-sm font-medium truncate">{t.tenantId}</span>
              <span className="text-xs text-muted-foreground/50 shrink-0">{t.pct.toFixed(0)}%</span>
            </div>
            <span className="relative text-right tabular-nums text-sm">{formatNumber(t.entries)}</span>
            <span className="relative text-right tabular-nums text-sm text-muted-foreground">
              {t.players === null ? "—" : formatNumber(t.players)}
            </span>
            <span className="relative text-right tabular-nums text-sm font-medium">{formatNumber(t.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
