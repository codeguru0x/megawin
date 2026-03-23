"use client";

import { Activity, Layers, Ticket, Users, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils/number";
import { getGameHex } from "@/lib/game-colors";
import { getGameLabel } from "../_lib/compute";
import type { SystemOutstandingGameDaily } from "@megawin/game-core/entities/financial-report";
import Link from "next/link";

interface OutstandingStripProps {
  data: SystemOutstandingGameDaily[] | undefined;
  isLoading: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function OutstandingStripSkeleton() {
  return (
    <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-4 dark:border-blue-800/30 dark:bg-blue-950/20">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Mini card cho mỗi game ──────────────────────────────────────────────────

interface GameCardProps {
  gameProduct: string;
  stake: number;
  totalStake: number;
  entryCount: number;
  activeDrawCount: number;
  playerCount: number;
}

/**
 * Mini card hiển thị outstanding 1 game — clickable → trang outstanding chi tiết.
 *
 * Layout: color bar trái + tên game + % + stake + chi tiết nhỏ.
 * Dễ scan hơn legend dạng inline text.
 * Game có stake < 1% tổng sẽ dimmed (opacity thấp) để ưu tiên focus vào game lớn.
 */
function GameCard({
  gameProduct,
  stake,
  totalStake,
  entryCount,
  activeDrawCount,
  playerCount,
}: GameCardProps) {
  const pct = totalStake > 0 ? (stake / totalStake) * 100 : 0;
  const hex = getGameHex(gameProduct);
  // Game chiếm < 1% tổng stake → dimmed để focus vào game lớn
  const isMinor = pct < 1;

  return (
    <Link
      href={`/games/${gameProduct}/outstanding`}
      className={cn(
        "group relative flex gap-2 overflow-hidden rounded-lg border border-border/50 bg-background/80 p-2.5 transition-all hover:border-border hover:shadow-sm hover:opacity-100",
      )}
    >
      {/* Color indicator bar bên trái */}
      <div className="w-1 shrink-0 rounded-full" style={{ background: hex }} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Tên game + % */}
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-xs font-semibold text-foreground">
            {getGameLabel(gameProduct)}
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white"
            style={{ background: hex }}
          >
            {pct.toFixed(1)}%
          </span>
        </div>

        {/* Tiền pending — nổi bật */}
        <span className="text-sm font-bold tabular-nums text-foreground">
          {formatVNDCompact(stake)}
        </span>

        {/* Chi tiết nhỏ: kỳ · vé · người chơi */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] tabular-nums text-muted-foreground">
          <span>{activeDrawCount} kỳ</span>
          <span>{formatNumber(entryCount)} vé</span>
          <span>{formatNumber(playerCount)} NC</span>
        </div>

        {/* Progress bar nhỏ bên dưới card — visual % */}
        <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, background: hex }}
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Zone 2 — Outstanding Summary Strip.
 *
 * Đặt ngay sau Hero KPIs vì đây là dữ liệu real-time quan trọng nhất khi monitor.
 * Hiển thị tổng tiền cược pending cross-game + per-game mini cards.
 * Live data — refetch mỗi 30s.
 *
 * Layout:
 * - Row 1: Header OUTSTANDING Live + 4 tổng KPIs (kỳ, vé, tiền, người chơi)
 * - Row 2: Stacked bar overview — tỷ lệ % stake mỗi game
 * - Row 3: Grid game cards — mỗi card: tên + % badge + stake + chi tiết
 *          Game < 1% stake → dimmed (opacity thấp) để focus vào top contributors.
 */
export function OutstandingStrip({ data, isLoading }: OutstandingStripProps) {
  if (isLoading) return <OutstandingStripSkeleton />;
  if (!data || data.length === 0) return null;

  // Aggregate totals
  let totalDraws = 0;
  let totalEntries = 0;
  let totalStake = 0;
  let totalPlayers = 0;
  for (const g of data) {
    totalDraws += g.activeDrawCount;
    totalEntries += g.totalEntryCount;
    totalStake += g.totalOutstandingStake;
    totalPlayers += g.totalPlayerCount;
  }

  // Không có outstanding → ẩn strip
  if (totalStake === 0 && totalEntries === 0) return null;

  // Sort games by stake desc
  const sorted = [...data]
    .filter((g) => g.totalOutstandingStake > 0 || g.totalEntryCount > 0)
    .sort((a, b) => b.totalOutstandingStake - a.totalOutstandingStake);

  return (
    <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-4 dark:border-blue-800/30 dark:bg-blue-950/20">
      {/* ── Row 1: Header + Tổng KPIs ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Outstanding
          </span>
          <span className="animate-pulse rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            Live
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <KpiBadge
            icon={<Layers className="size-3.5" />}
            value={formatNumber(totalDraws)}
            label="kỳ"
          />
          <KpiBadge
            icon={<Ticket className="size-3.5" />}
            value={formatNumber(totalEntries)}
            label="vé"
          />
          <KpiBadge
            icon={<DollarSign className="size-3.5" />}
            value={formatVNDCompact(totalStake)}
            label="pending"
            highlight
          />
          <KpiBadge
            icon={<Users className="size-3.5" />}
            value={formatNumber(totalPlayers)}
            label="người chơi"
          />
        </div>
      </div>

      {/* ── Row 2: Stacked bar tổng quan — tỷ lệ % stake ─────────── */}
      <div className="group/bar relative mt-3">
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-blue-100/60 dark:bg-blue-900/30">
          {sorted.map((g) => {
            const pct = totalStake > 0 ? (g.totalOutstandingStake / totalStake) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <Link
                key={g.gameProduct}
                href={`/games/${g.gameProduct}/outstanding`}
                className="relative h-full transition-opacity hover:opacity-80"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: getGameHex(g.gameProduct as string),
                }}
                title={`${getGameLabel(g.gameProduct as string)}: ${formatVNDCompact(g.totalOutstandingStake)} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        {/* Label hiển thị % trên bar khi segment đủ rộng */}
        <div className="pointer-events-none absolute inset-0 flex h-3.5 items-center overflow-hidden rounded-full">
          {sorted.map((g) => {
            const pct = totalStake > 0 ? (g.totalOutstandingStake / totalStake) * 100 : 0;
            // Chỉ show label khi segment đủ rộng (>8%) để text không bị cắt
            if (pct < 8)
              return <div key={g.gameProduct} style={{ width: `${Math.max(pct, 0)}%` }} />;
            return (
              <div
                key={g.gameProduct}
                className="flex h-full items-center justify-center"
                style={{ width: `${pct}%` }}
              >
                <span className="text-[9px] font-bold text-white drop-shadow-sm">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Row 3: Game cards grid ────────────────────────────────── */}
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
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface KpiBadgeProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  /** Highlight lớn cho metric chính (tiền pending). */
  highlight?: boolean;
}

function KpiBadge({ icon, value, label, highlight }: KpiBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-blue-500/70">{icon}</span>
      <span
        className={
          highlight
            ? "text-sm tabular-nums font-bold text-blue-700 dark:text-blue-300"
            : "text-xs tabular-nums font-semibold text-foreground"
        }
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
