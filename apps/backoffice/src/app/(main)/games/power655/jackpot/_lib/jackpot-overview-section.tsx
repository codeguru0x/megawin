"use client";

import { CircleDollarSign, Flame, Hash, Layers, TrendingUp, Trophy, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { useJackpotCurrent } from "./use-jackpot";

// ─── JackpotHeroCard ──────────────────────────────────────────────────────────

/**
 * Hero card dual jackpot Power 6/55.
 * Ưu tiên Jackpot 1 (6/6), hiển thị song song Jackpot 2 (5/6+bonus).
 * Progress bar = tiến trình JP1 đến ngưỡng overflow.
 * Dùng độc lập — không kèm KPI stats.
 */
export function JackpotHeroCard() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) return <Skeleton className="h-[280px] rounded-2xl" />;
  if (!data) return null;

  const { cycle, config, jackpot1Progress, jackpot2Progress } = data;

  const jp1 = cycle.jackpot1CurrentAmount;
  const jp2 = cycle.jackpot2CurrentAmount;
  const overflowThreshold = config.jp1OverflowThreshold;

  // Tiến trình JP1 đến ngưỡng overflow
  const jp1Pct = overflowThreshold > 0 ? Math.min((jp1 / overflowThreshold) * 100, 110) : 0;
  const jp1Remaining = Math.max(overflowThreshold - jp1, 0);
  const isHot = jp1Pct >= 80;
  const isWarm = jp1Pct >= 50;
  const isOverflow = jp1 >= overflowThreshold;

  // Tỷ lệ đóng góp (mặc định 90/10)
  const jp1ContribPct = 90;
  const jp2ContribPct = 10;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-6",
        "bg-linear-to-br from-red-50/90 via-orange-50/70 to-amber-50/50",
        "dark:from-red-950/50 dark:via-orange-950/40 dark:to-amber-950/30",
        isOverflow
          ? "border-violet-300 dark:border-violet-700/60"
          : isHot
            ? "border-red-300 dark:border-red-800/60"
            : "border-red-200 dark:border-red-800/50",
      )}
    >
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -right-10 -top-10 size-52 rounded-full bg-linear-to-br from-red-300/20 to-orange-300/10 blur-3xl dark:from-red-500/8 dark:to-orange-500/4" />
      <div className="pointer-events-none absolute -left-8 bottom-0 size-36 rounded-full bg-linear-to-tr from-amber-200/15 to-yellow-200/8 blur-2xl" />

      <div className="relative space-y-5">
        {/* ── Top row ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/30">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-red-700/70 dark:text-red-400/60">
                Power 6/55 Dual Jackpot — Vòng #{cycle.cycleNo}
              </p>
              {/* JP1 primary — dòng lớn */}
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">
                  Jackpot 1
                </span>
                <span className="text-3xl font-extrabold tabular-nums tracking-tight text-red-900 dark:text-red-100">
                  {formatVND(jp1)}
                </span>
              </div>
              {/* JP2 secondary — dòng nhỏ */}
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  Jackpot 2
                </span>
                <span className="text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                  {formatVND(jp2)}
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {isOverflow && (
              <Badge className="gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <Zap className="size-3" />
                Overflow
              </Badge>
            )}
            {!isOverflow && isHot && (
              <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
        </div>

        {/* ── JP1 overflow progress bar ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-red-800/70 dark:text-red-300/70">
              Tiến trình đến overflow —{" "}
              <span className="font-semibold">{formatVNDCompact(overflowThreshold)}</span>
            </span>
            <span className="font-bold tabular-nums text-red-900 dark:text-red-200">
              {jp1Pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-red-200/50 dark:bg-red-900/40">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(jp1Pct, 100)}%`,
                background: isOverflow
                  ? "linear-gradient(90deg, #8b5cf6, #7c3aed, #6d28d9)"
                  : isHot
                    ? "linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)"
                    : isWarm
                      ? "linear-gradient(90deg, #f87171, #ef4444, #dc2626)"
                      : "linear-gradient(90deg, #fca5a5, #f87171, #ef4444)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-red-700/60 dark:text-red-400/50">
            <span>
              {isOverflow
                ? `Đã vượt +${formatVNDCompact(jp1 - overflowThreshold)}`
                : `Còn thiếu ${formatVNDCompact(jp1Remaining)}`}
            </span>
            <span className="flex items-center gap-1">
              <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-300">
                JP1 {jp1ContribPct}%
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                JP2 {jp2ContribPct}%
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── JackpotKpiCards ──────────────────────────────────────────────────────────

/**
 * 4 KPI cards: tích luỹ kỳ, tổng tích luỹ JP1, tổng tích luỹ JP2, số lần JP2 trao thưởng.
 * Dùng độc lập — dùng trong trang /operations và /jackpot.
 */
export function JackpotKpiCards() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { cycle, jackpot1Progress, jackpot2Progress } = data;

  // Phần tích luỹ thuần = current - seed (không tính seed ban đầu).
  // Tương đương cycle.totalContribution của Lotto 5/35 / Mega 6/45.
  const jp1Contribution = jackpot1Progress.current - jackpot1Progress.seed;
  const jp2Contribution = jackpot2Progress.current - jackpot2Progress.seed;

  // % tăng JP1 so với khởi điểm seed
  const jp1GrowthPct =
    jackpot1Progress.seed > 0 ? Math.round((jp1Contribution / jackpot1Progress.seed) * 100) : 0;

  // % tăng JP2 so với khởi điểm seed hiện tại (seed reset mỗi lần JP2 trao thưởng)
  const jp2GrowthPct =
    jackpot2Progress.seed > 0 ? Math.round((jp2Contribution / jackpot2Progress.seed) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Card 1: Số kỳ tích luỹ liên tiếp */}
      <KpiCard
        icon={Layers}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Tích luỹ liên tiếp"
        value={`${cycle.drawCount} kỳ`}
        sub={`Từ ${cycle.startDrawId || "—"}`}
      />
      {/* Card 2: Tổng tích luỹ JP1 + % tăng so với khởi điểm */}
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-red-100 dark:bg-red-900/50"
        iconColor="text-red-600 dark:text-red-400"
        label="Tổng tích luỹ JP1"
        value={formatVNDCompact(jp1Contribution)}
        sub={
          jp1GrowthPct > 0 ? (
            <>
              <span className="font-semibold text-profit">+{jp1GrowthPct}%</span>
              {" so với khởi điểm"}
            </>
          ) : (
            `Khởi điểm: ${formatVNDCompact(jackpot1Progress.seed)}`
          )
        }
      />
      {/* Card 3: Tổng tích luỹ JP2 + % tăng so với khởi điểm */}
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Tổng tích luỹ JP2"
        value={formatVNDCompact(jp2Contribution)}
        sub={
          jp2GrowthPct > 0 ? (
            <>
              <span className="font-semibold text-profit">+{jp2GrowthPct}%</span>
              {" so với khởi điểm"}
            </>
          ) : (
            `Khởi điểm: ${formatVNDCompact(jackpot2Progress.seed)}`
          )
        }
      />
      {/* Card 4: Số lần JP2 đã trao thưởng và reset trong vòng tích luỹ hiện tại */}
      <KpiCard
        icon={Hash}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Số lần JP2 trao thưởng"
        value={`${cycle.jackpot2ResetCount} lần`}
        sub={
          cycle.jackpot2ResetCount > 0
            ? "JP2 đã reset, JP1 vẫn tích luỹ"
            : "JP2 chưa trao thưởng vòng này"
        }
      />
    </div>
  );
}

// ─── JackpotOverviewSection ───────────────────────────────────────────────────

/**
 * Section đầy đủ = JackpotHeroCard + JackpotKpiCards.
 * Dùng cho trang /games/power655/jackpot.
 */
export function JackpotOverviewSection() {
  const { isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[280px] rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <JackpotHeroCard />
      <JackpotKpiCards />
    </div>
  );
}

// ─── KpiCard (internal) ───────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
