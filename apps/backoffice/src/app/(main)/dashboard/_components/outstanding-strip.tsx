"use client";

import Link from "next/link";

import type { SystemOutstandingGameDaily } from "@megawin/game-core/entities/financial-report";
import { formatNumber, formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { Activity, ArrowUpRight, Building2, DollarSign, Layers, Ticket, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getGameHex } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { getGameLabel } from "../_lib/compute";

interface OutstandingStripProps {
  data: SystemOutstandingGameDaily[] | undefined;
  isLoading: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function OutstandingStripSkeleton() {
  return (
    <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-5 dark:border-blue-800/30 dark:bg-blue-950/20">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Metric Card cho tổng KPIs ────────────────────────────────────────────────

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Màu semantic — mỗi metric có 1 màu riêng, đồng nhất toàn strip. */
  color: "blue" | "amber" | "indigo" | "violet" | "rose" | "emerald";
}

/**
 * Metric card — nền nhẹ theo màu, border tương ứng.
 * Mỗi card cùng style, chỉ khác color → đồng nhất visual.
 */
function MetricCard({ icon: Icon, label, value, color }: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
        color === "blue" && "border-blue-200/70 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/30",
        color === "amber" && "border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/30",
        color === "indigo" && "border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-800/40 dark:bg-indigo-950/30",
        color === "violet" && "border-violet-200/70 bg-violet-50/60 dark:border-violet-800/40 dark:bg-violet-950/30",
        color === "rose" && "border-rose-200/70 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/30",
        color === "emerald" &&
          "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/30",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          color === "blue" && "text-blue-600 dark:text-blue-400",
          color === "amber" && "text-amber-600 dark:text-amber-400",
          color === "indigo" && "text-indigo-600 dark:text-indigo-400",
          color === "violet" && "text-violet-600 dark:text-violet-400",
          color === "rose" && "text-rose-600 dark:text-rose-400",
          color === "emerald" && "text-emerald-600 dark:text-emerald-400",
        )}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Game Row — chi tiết hơn GameCard cũ ──────────────────────────────────────

interface GameCardProps {
  gameProduct: string;
  stake: number;
  totalStake: number;
  entryCount: number;
  activeDrawCount: number;
  playerCount: number;
  tenantCount: number;
  estimatedCommission: number;
}

/**
 * Game card — 1 card / game trong grid outstanding.
 *
 * Layout compact: color bar trái + name/% + stake nổi bật + chi tiết (kỳ, vé, NC, đại lý).
 * Click → trang outstanding chi tiết của game đó.
 * Progress bar bên dưới thể hiện tỷ lệ stake so với tổng.
 */
function GameCard({
  gameProduct,
  stake,
  totalStake,
  entryCount,
  activeDrawCount,
  playerCount,
  tenantCount,
  estimatedCommission,
}: GameCardProps) {
  const pct = totalStake > 0 ? (stake / totalStake) * 100 : 0;
  const hex = getGameHex(gameProduct);

  return (
    <Link
      prefetch={false}
      href={`/games/${gameProduct}/outstanding`}
      className="group relative flex gap-2 overflow-hidden rounded-lg border border-border/50 bg-background/80 p-2.5 transition-all hover:border-border hover:shadow-sm"
    >
      {/* Color indicator bar bên trái */}
      <div className="w-1 shrink-0 rounded-full" style={{ background: hex }} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Tên game + % */}
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-xs font-semibold text-foreground">{getGameLabel(gameProduct)}</span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            style={{ background: hex }}
          >
            {pct.toFixed(1)}%
          </span>
        </div>

        {/* Tiền pending — nổi bật */}
        <span className="text-sm font-bold tabular-nums text-foreground">{formatVNDCompact(stake)}</span>

        {/* Chi tiết: kỳ · vé · NC · đại lý */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] tabular-nums text-muted-foreground">
          <span>{activeDrawCount} kỳ</span>
          <span>{formatNumber(entryCount)} vé</span>
          <span>{formatNumber(playerCount)} NC</span>
          {tenantCount > 0 && <span>{tenantCount} ĐL</span>}
        </div>

        {/* Ước tính commission nếu có */}
        {estimatedCommission > 0 && (
          <span className="text-[10px] tabular-nums text-amber-600 dark:text-amber-400">
            ~{formatVNDCompact(estimatedCommission)} HH
          </span>
        )}

        {/* Progress bar — visual tỷ lệ % stake */}
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, background: hex }}
          />
        </div>
      </div>

      {/* Hover arrow indicator */}
      <ArrowUpRight className="absolute right-1.5 top-1.5 size-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
    </Link>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Zone 2 — Outstanding Monitor (Live Exposure Dashboard).
 *
 * Mục đích chính: trả lời câu hỏi "Hệ thống đang chịu bao nhiêu rủi ro/exposure ngay lúc này?"
 * Đây là phần QUAN TRỌNG NHẤT của dashboard cho casino online vì:
 * - Tiền outstanding = liability chưa settle → rủi ro tài chính thực
 * - Cần biết ngay: tổng exposure, phân bổ theo game, số kỳ/vé/người chơi đang chờ
 * - Commission ước tính cho biết chi phí đại lý đang tích lũy
 *
 * Layout 4 tầng:
 * 1. Header: OUTSTANDING + live pulse dot
 * 2. KPI Row: 6 metric cards — mỗi card 1 màu riêng, đồng nhất visual
 * 3. Stacked bar: phân bổ % theo game
 * 4. Game Grid: chi tiết per-game (click → trang outstanding)
 *
 * Live data — refetch mỗi 30s. TTL 5 phút trên server.
 * Live indicator = pulse dot animation, không dùng text timestamp.
 */
export function OutstandingStrip({ data, isLoading }: OutstandingStripProps) {
  if (isLoading) return <OutstandingStripSkeleton />;
  if (!data || data.length === 0) return null;

  // ── Aggregate totals ────────────────────────────────────────────────────────
  let totalDraws = 0;
  let totalEntries = 0;
  let totalStake = 0;
  let totalPlayers = 0;
  let totalTenants = 0;
  let totalCommission = 0;

  for (const g of data) {
    totalDraws += g.activeDrawCount;
    totalEntries += g.totalEntryCount;
    totalStake += g.totalOutstandingStake;
    totalPlayers += g.totalPlayerCount;
    totalTenants += g.totalTenantCount;
    totalCommission += g.totalEstimatedCommission;
  }

  // Không có outstanding → ẩn strip
  if (totalStake === 0 && totalEntries === 0) return null;

  // Sort games by stake descending — game lớn nhất hiện trước
  const sorted = [...data]
    .filter((g) => g.totalOutstandingStake > 0 || g.totalEntryCount > 0)
    .sort((a, b) => b.totalOutstandingStake - a.totalOutstandingStake);

  return (
    <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-5 dark:border-blue-800/30 dark:bg-blue-950/20">
      {/* ── Row 1: Header + live pulse dot ─────────────────────────── */}
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
          Outstanding
        </span>
        {/* Live pulse dot — animation nhẹ thay cho text timestamp */}
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
        </span>
      </div>

      {/* ── Row 2: KPI Metrics — 6 cards, mỗi card 1 màu riêng ──── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={DollarSign} label="Tổng tiền pending" value={formatVNDCompact(totalStake)} color="blue" />
        <MetricCard icon={DollarSign} label="Ước tính HH" value={formatVNDCompact(totalCommission)} color="amber" />
        <MetricCard icon={Layers} label="Kỳ quay đang mở" value={formatNumber(totalDraws)} color="indigo" />
        <MetricCard icon={Ticket} label="Vé chờ xử lý" value={formatNumber(totalEntries)} color="violet" />
        <MetricCard icon={Users} label="Người chơi" value={formatNumber(totalPlayers)} color="rose" />
        <MetricCard icon={Building2} label="Đại lý" value={formatNumber(totalTenants)} color="emerald" />
      </div>

      {/* ── Row 3: Stacked bar — phân bổ % stake theo game ──────── */}
      <div className="group/bar relative mt-3">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-blue-100/60 dark:bg-blue-900/30">
          {sorted.map((g) => {
            const pct = totalStake > 0 ? (g.totalOutstandingStake / totalStake) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <Link
                key={g.gameProduct}
                prefetch={false}
                href={`/games/${g.gameProduct}/outstanding`}
                className="relative h-full transition-opacity hover:opacity-80"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: getGameHex(g.gameProduct as string),
                }}
                title={`${getGameLabel(g.gameProduct as string)}: ${formatVND(g.totalOutstandingStake)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        {/* Label % trên bar — chỉ show khi segment đủ rộng (>8%) */}
        <div className="pointer-events-none absolute inset-0 flex h-4 items-center overflow-hidden rounded-full">
          {sorted.map((g) => {
            const pct = totalStake > 0 ? (g.totalOutstandingStake / totalStake) * 100 : 0;
            if (pct < 8) return <div key={g.gameProduct} style={{ width: `${Math.max(pct, 0)}%` }} />;
            return (
              <div key={g.gameProduct} className="flex h-full items-center justify-center" style={{ width: `${pct}%` }}>
                <span className="text-[9px] font-bold text-white drop-shadow-sm">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Row 4: Game cards grid — chi tiết per-game ─────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {sorted.map((g) => (
          <GameCard
            key={g.gameProduct}
            gameProduct={g.gameProduct as string}
            stake={g.totalOutstandingStake}
            totalStake={totalStake}
            entryCount={g.totalEntryCount}
            activeDrawCount={g.activeDrawCount}
            playerCount={g.totalPlayerCount}
            tenantCount={g.totalTenantCount}
            estimatedCommission={g.totalEstimatedCommission}
          />
        ))}
      </div>
    </div>
  );
}
