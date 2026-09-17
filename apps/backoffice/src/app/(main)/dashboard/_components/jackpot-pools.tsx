"use client";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { Flame, TrendingUp, Trophy, Zap } from "lucide-react";

import type {
  DashboardJackpotInfo,
  DashboardPower655JackpotInfo,
  GetDashboardJackpotsOutput,
} from "@/app/api/dashboard/jackpots/_lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GAME_COLORS } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

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
        isHot ? "border-game-mega645" : "border-game-mega645",
      )}
    >
      <div className="from-game-mega645/20 to-info/10 pointer-events-none absolute -top-8 -right-8 size-40 rounded-full bg-linear-to-br blur-3xl" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            prefetch={false}
            href="/games/mega645/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="from-game-mega645 to-profit shadow-game-mega645/25 flex size-9 items-center justify-center rounded-xl bg-linear-to-br shadow-md">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-game-mega645/70 text-xs font-semibold tracking-wider uppercase">Mega 6/45 — Jackpot</p>
          </Link>
          <Badge variant="outline" className="border-game-mega645/60 bg-game-mega645/80 text-game-mega645 text-xs">
            Vòng #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <p className="text-game-mega645 text-2xl font-extrabold tracking-tight tabular-nums">
            {formatVNDCompact(data.currentAmount)}
          </p>
          <p className="text-game-mega645/60 mt-0.5 text-xs">{formatVND(data.currentAmount)}</p>
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
              trackClassName="bg-game-mega645/60"
            />
            <div className="text-game-mega645/60 flex items-center justify-between text-xs">
              <span>Khởi điểm: {formatVNDCompact(data.seedAmount)}</span>
              <span className="flex items-center gap-1">
                {isHot && <Flame className="text-loss size-3" />}
                {pct.toFixed(1)}% mục tiêu
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-game-mega645/50 text-xs">{data.drawCount} kỳ đã tích lũy</p>
          {data.drawCount > 0 && (
            <p className="text-game-mega645/50 flex items-center gap-1 text-xs">
              <TrendingUp className="size-3" />~
              {formatVNDCompact(Math.round((data.currentAmount - data.seedAmount) / data.drawCount))}
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
  const jp1Pct = data.jp1OverflowThreshold > 0 ? Math.min((data.jp1Current / data.jp1OverflowThreshold) * 100, 110) : 0;
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
        isOverflow ? "border-game-max3d" : isHot ? "border-loss" : "border-loss",
      )}
    >
      <div className="from-loss/15 to-warning/8 pointer-events-none absolute -top-8 -right-8 size-40 rounded-full bg-linear-to-br blur-3xl" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            prefetch={false}
            href="/games/power655/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="from-loss to-warning shadow-loss/25 flex size-9 items-center justify-center rounded-xl bg-linear-to-br shadow-md">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-loss/70 text-xs font-semibold tracking-wider uppercase">Power 6/55 — Jackpot</p>
          </Link>
          <Badge variant="outline" className="border-loss/60 bg-loss/80 text-loss text-xs">
            Vòng #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span className="bg-loss text-loss rounded-md px-1.5 py-0.5 text-xs font-bold">Jackpot 1</span>
            <span className="text-loss text-2xl font-extrabold tracking-tight tabular-nums">
              {formatVNDCompact(data.jp1Current)}
            </span>
            {isOverflow && (
              <Badge className="border-game-max3d bg-game-max3d text-game-max3d gap-1 text-xs">
                <Zap className="size-3" />
                Overflow
              </Badge>
            )}
            {!isOverflow && isHot && (
              <Badge className="border-loss bg-loss text-loss gap-1 text-xs">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="bg-info text-info rounded-md px-1.5 py-0.5 text-xs font-bold">Jackpot 2</span>
            <span className="text-info text-sm font-semibold tabular-nums">{formatVNDCompact(data.jp2Current)}</span>
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
            trackClassName="bg-loss/50"
          />
          <div className="text-loss/60 flex items-center justify-between text-xs">
            <span>Khởi điểm: {formatVNDCompact(data.jp1Seed)}</span>
            <span>Overflow: {formatVNDCompact(data.jp1OverflowThreshold)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-loss/50 text-xs">{data.drawCount} kỳ đã tích lũy</p>
          {data.drawCount > 0 && (
            <p className="text-loss/50 flex items-center gap-1 text-xs">
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
        isHot ? "border-loss" : "border-warning",
      )}
    >
      <div className="from-warning/20 to-warning/10 pointer-events-none absolute -top-8 -right-8 size-40 rounded-full bg-linear-to-br blur-3xl" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            prefetch={false}
            href="/games/lotto535/jackpot"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="from-warning to-loss shadow-warning/25 flex size-9 items-center justify-center rounded-xl bg-linear-to-br shadow-md">
              <Trophy className="size-4.5 text-white" />
            </div>
            <p className="text-warning/70 text-xs font-semibold tracking-wider uppercase">Lotto 5/35 — Jackpot</p>
          </Link>
          <Badge variant="outline" className="border-warning/60 bg-warning/80 text-warning text-xs">
            Vòng #{data.cycleNo}
          </Badge>
        </div>

        <div>
          <p className="text-warning text-2xl font-extrabold tracking-tight tabular-nums">
            {formatVNDCompact(data.currentAmount)}
          </p>
          <p className="text-warning/60 mt-0.5 text-xs">{formatVND(data.currentAmount)}</p>
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
              trackClassName="bg-warning/60"
            />
            <div className="text-warning/60 flex items-center justify-between text-xs">
              <span>Khởi điểm: {formatVNDCompact(data.seedAmount)}</span>
              <span className="flex items-center gap-1">
                {isHot && <Flame className="text-loss size-3" />}
                Ngưỡng chia: {formatVNDCompact(data.splitThreshold)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-warning/50 text-xs">{data.drawCount} kỳ đã tích lũy</p>
          {data.drawCount > 0 && (
            <p className="text-warning/50 flex items-center gap-1 text-xs">
              <TrendingUp className="size-3" />~
              {formatVNDCompact(Math.round((data.currentAmount - data.seedAmount) / data.drawCount))}
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
        <Skeleton key={i} className="h-50 rounded-2xl" />
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
  if (isLoading) {
    return <JackpotsSkeleton />;
  }
  if (!data) {
    return null;
  }

  const hasAny = data.mega645 || data.power655 || data.lotto535;
  if (!hasAny) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {data.mega645 && <Mega645Card data={data.mega645} />}
      {data.power655 && <Power655Card data={data.power655} />}
      {data.lotto535 && <Lotto535Card data={data.lotto535} />}
    </div>
  );
}
