"use client";

import { Trophy, Zap, Flame, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils/number";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { GAME_COLORS } from "@/lib/game-colors";
import type {
  DashboardJackpotInfo,
  DashboardPower655JackpotInfo,
  GetDashboardJackpotsOutput,
} from "@/app/api/dashboard/jackpots/_lib/types";
import Link from "next/link";

interface JackpotPoolsProps {
  data: GetDashboardJackpotsOutput | undefined;
  isLoading: boolean;
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  percent,
  gradient,
  trackClassName,
}: {
  percent: number;
  gradient: string;
  trackClassName: string;
}) {
  const capped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className={cn("h-3 w-full overflow-hidden rounded-full", trackClassName)}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${capped}%`, background: gradient }}
      />
    </div>
  );
}

// ─── Mega 6/45 Card ───────────────────────────────────────────────────────────

/**
 * Màu brand: teal/cyan/emerald — đồng nhất với trang jackpot Mega 6/45.
 * CSS tokens: --game-mega645 từ globals.css.
 */
function Mega645Card({ data }: { data: DashboardJackpotInfo }) {
  const c = GAME_COLORS[GameProduct.Mega645];
  const pct = data.progressPercent ?? 0;
  const isHot = pct >= 80;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-5",
        `bg-linear-to-br ${c.gradientFrom} ${c.gradientVia} ${c.gradientTo}`,
        c.gradientFromDark,
        c.gradientViaDark,
        c.gradientToDark,
        isHot
          ? "border-teal-400 dark:border-teal-700/70"
          : "border-teal-200 dark:border-teal-800/50",
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-linear-to-br from-teal-300/20 to-cyan-300/10 blur-3xl dark:from-teal-500/8 dark:to-cyan-500/4" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/games/mega645/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-teal-400 to-emerald-500 shadow-md shadow-teal-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700/70 dark:text-teal-400/60">
              Mega 6/45 — Jackpot
            </p>
          </Link>
          <Badge
            variant="outline"
            className="border-teal-300/60 bg-teal-50/80 text-[10px] text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/50 dark:text-teal-300"
          >
            Cycle #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-teal-900 dark:text-teal-100">
            {formatVNDCompact(data.currentAmount)}
          </p>
          <p className="mt-0.5 text-[11px] text-teal-700/60 dark:text-teal-400/50">
            {formatVND(data.currentAmount)}
          </p>
        </div>

        {data.progressPercent != null && (
          <div className="space-y-1.5">
            <ProgressBar
              percent={pct}
              gradient={
                isHot
                  ? `linear-gradient(90deg, ${c.hex}, #0891b2, #06b6d4)`
                  : `linear-gradient(90deg, #5eead4, #2dd4bf, ${c.hex})`
              }
              trackClassName="bg-teal-200/60 dark:bg-teal-900/50"
            />
            <div className="flex items-center justify-between text-[11px] text-teal-700/60 dark:text-teal-400/50">
              <span>Seed: {formatVNDCompact(data.seedAmount)}</span>
              <span className="flex items-center gap-1">
                {isHot && <Flame className="size-3 text-red-500" />}
                {pct.toFixed(1)}% mục tiêu
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-teal-700/50 dark:text-teal-400/40">
            {data.drawCount} kỳ đã tích lũy
          </p>
          {data.drawCount > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-teal-700/50 dark:text-teal-400/40">
              <TrendingUp className="size-3" />~
              {formatVNDCompact(
                Math.round((data.currentAmount - data.seedAmount) / data.drawCount),
              )}
              /kỳ
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Power 6/55 Card ─────────────────────────────────────────────────────────

/**
 * Màu brand: red/orange/amber — đồng nhất với trang jackpot Power 6/55.
 * CSS tokens: --game-power655 từ globals.css.
 */
function Power655Card({ data }: { data: DashboardPower655JackpotInfo }) {
  const c = GAME_COLORS[GameProduct.Power655];
  const jp1Pct =
    data.jp1OverflowThreshold > 0
      ? Math.min((data.jp1Current / data.jp1OverflowThreshold) * 100, 110)
      : 0;
  const isHot = jp1Pct >= 80;
  const isOverflow = data.jp1Current >= data.jp1OverflowThreshold;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-5",
        `bg-linear-to-br ${c.gradientFrom} ${c.gradientVia} ${c.gradientTo}`,
        c.gradientFromDark,
        c.gradientViaDark,
        c.gradientToDark,
        isOverflow
          ? "border-violet-300 dark:border-violet-700/60"
          : isHot
            ? "border-red-300 dark:border-red-800/60"
            : "border-red-200 dark:border-red-800/50",
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-linear-to-br from-red-300/15 to-orange-300/8 blur-3xl dark:from-red-500/6 dark:to-orange-500/3" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/games/power655/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-md shadow-red-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700/70 dark:text-red-400/60">
              Power 6/55 — Jackpot
            </p>
          </Link>
          <Badge
            variant="outline"
            className="border-red-300/60 bg-red-50/80 text-[10px] text-red-700 dark:border-red-700/60 dark:bg-red-950/50 dark:text-red-300"
          >
            Cycle #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">
              Jackpot 1
            </span>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight text-red-900 dark:text-red-100">
              {formatVNDCompact(data.jp1Current)}
            </span>
            {isOverflow && (
              <Badge className="gap-1 border-violet-300 bg-violet-50 text-[10px] text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <Zap className="size-3" />
                Overflow
              </Badge>
            )}
            {!isOverflow && isHot && (
              <Badge className="gap-1 border-red-300 bg-red-50 text-[10px] text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              Jackpot 2
            </span>
            <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-300">
              {formatVNDCompact(data.jp2Current)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <ProgressBar
            percent={Math.min(jp1Pct, 100)}
            gradient={
              isOverflow
                ? "linear-gradient(90deg, #8b5cf6, #7c3aed, #6d28d9)"
                : isHot
                  ? `linear-gradient(90deg, ${c.hex}, #dc2626, #b91c1c)`
                  : `linear-gradient(90deg, #fca5a5, #f87171, ${c.hex})`
            }
            trackClassName="bg-red-200/50 dark:bg-red-900/40"
          />
          <div className="flex items-center justify-between text-[11px] text-red-700/60 dark:text-red-400/50">
            <span>Seed: {formatVNDCompact(data.jp1Seed)}</span>
            <span>Overflow: {formatVNDCompact(data.jp1OverflowThreshold)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-red-700/50 dark:text-red-400/40">
            {data.drawCount} kỳ đã tích lũy
          </p>
          {data.drawCount > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-red-700/50 dark:text-red-400/40">
              <TrendingUp className="size-3" />~
              {formatVNDCompact(Math.round((data.jp1Current - data.jp1Seed) / data.drawCount))}/kỳ
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lotto 5/35 Card ─────────────────────────────────────────────────────────

/**
 * Màu brand: amber/yellow/orange — đồng nhất với trang jackpot Lotto 5/35.
 * CSS tokens: --game-lotto535 từ globals.css.
 */
function Lotto535Card({ data }: { data: DashboardJackpotInfo }) {
  const c = GAME_COLORS[GameProduct.Lotto535];
  const pct = data.progressPercent ?? 0;
  const isHot = pct >= 80;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-5",
        `bg-linear-to-br ${c.gradientFrom} ${c.gradientVia} ${c.gradientTo}`,
        c.gradientFromDark,
        c.gradientViaDark,
        c.gradientToDark,
        isHot
          ? "border-red-300 dark:border-red-800/60"
          : "border-amber-200 dark:border-amber-800/50",
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-linear-to-br from-yellow-300/20 to-orange-300/10 blur-3xl dark:from-yellow-500/8 dark:to-orange-500/4" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/games/lotto535/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/25">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700/70 dark:text-amber-400/60">
              Lotto 5/35 — Jackpot
            </p>
          </Link>
          <Badge
            variant="outline"
            className="border-amber-300/60 bg-amber-50/80 text-[10px] text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300"
          >
            Cycle #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-amber-900 dark:text-amber-100">
            {formatVNDCompact(data.currentAmount)}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-700/60 dark:text-amber-400/50">
            {formatVND(data.currentAmount)}
          </p>
        </div>

        {data.splitThreshold != null && data.progressPercent != null && (
          <div className="space-y-1.5">
            <ProgressBar
              percent={pct}
              gradient={
                isHot
                  ? `linear-gradient(90deg, ${c.hex}, #ef4444, #dc2626)`
                  : `linear-gradient(90deg, #fde68a, #fbbf24, ${c.hex})`
              }
              trackClassName="bg-amber-200/60 dark:bg-amber-900/50"
            />
            <div className="flex items-center justify-between text-[11px] text-amber-700/60 dark:text-amber-400/50">
              <span>Seed: {formatVNDCompact(data.seedAmount)}</span>
              <span className="flex items-center gap-1">
                {isHot && <Flame className="size-3 text-red-500" />}
                Split: {formatVNDCompact(data.splitThreshold)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-amber-700/50 dark:text-amber-400/40">
            {data.drawCount} kỳ đã tích lũy
          </p>
          {data.drawCount > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-amber-700/50 dark:text-amber-400/40">
              <TrendingUp className="size-3" />~
              {formatVNDCompact(
                Math.round((data.currentAmount - data.seedAmount) / data.drawCount),
              )}
              /kỳ
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function JackpotsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[200px] rounded-2xl" />
      ))}
    </div>
  );
}

// ─── JackpotPools ─────────────────────────────────────────────────────────────

/**
 * Zone 2 — Jackpot Pools (3 game cards ngang).
 *
 * Style nhất quán với hero card trên trang jackpot từng game.
 * Màu brand lấy từ GAME_COLORS — CSS variables --game-* trong globals.css.
 * Live data — tự refetch mỗi 30s.
 */
export function JackpotPools({ data, isLoading }: JackpotPoolsProps) {
  if (isLoading) return <JackpotsSkeleton />;
  if (!data) return null;

  const hasAny = data.mega645 || data.power655 || data.lotto535;
  if (!hasAny) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {data.mega645 && <Mega645Card data={data.mega645} />}
      {data.power655 && <Power655Card data={data.power655} />}
      {data.lotto535 && <Lotto535Card data={data.lotto535} />}
    </div>
  );
}
