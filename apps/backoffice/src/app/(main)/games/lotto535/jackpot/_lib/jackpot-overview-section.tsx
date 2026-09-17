"use client";

import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { CircleDollarSign, Flame, Layers, Target, TrendingUp, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useJackpotCurrent } from "./use-jackpot";

// ─── JackpotHeroCard ──────────────────────────────────────────────────────────

/**
 * Hero card hiển thị jackpot hiện tại: số tiền, tiến trình, badge trạng thái.
 * Dùng độc lập — không kèm KPI stats.
 */
export function JackpotHeroCard() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return <Skeleton className="h-50 rounded-2xl" />;
  }
  if (!data) {
    return null;
  }

  const { cycle, progress } = data;
  const pct = progress.percentage;
  const isHot = pct >= 80;
  const isWarm = pct >= 50;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-6",
        "from-warning/90 via-warning/70 to-warning/50 bg-linear-to-br",
        "from-warning/50 via-warning/40 to-warning/30",
        isHot ? "border-loss" : "border-warning",
      )}
    >
      {/* Decorative orbs */}
      <div className="from-warning/25 to-warning/15 pointer-events-none absolute -top-10 -right-10 size-48 rounded-full bg-linear-to-br blur-3xl" />
      <div className="from-warning/20 to-warning/10 pointer-events-none absolute bottom-0 -left-8 size-32 rounded-full bg-linear-to-tr blur-2xl" />

      <div className="relative space-y-5">
        {/* Top row: icon + amount + badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="from-warning to-loss shadow-warning/30 flex size-12 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-warning/70 text-xs font-medium tracking-wider uppercase">
                Jackpot hiện tại — Vòng #{cycle.cycleNo}
              </p>
              <p className="text-warning mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums">
                {formatVND(cycle.currentAmount)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isHot && (
              <Badge className="border-loss bg-loss text-loss gap-1">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-warning/70 font-medium">
              Tiến trình đến ngưỡng chia — <span className="font-semibold">{formatVNDCompact(progress.threshold)}</span>
            </span>
            <span className="text-warning font-bold tabular-nums">{pct.toFixed(1)}%</span>
          </div>
          <div className="bg-warning/60 h-3 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: isHot
                  ? "linear-gradient(90deg, #f59e0b, #ef4444, #dc2626)"
                  : isWarm
                    ? "linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)"
                    : "linear-gradient(90deg, #fde68a, #fbbf24, #f59e0b)",
              }}
            />
          </div>
          <div className="text-warning/60 flex items-center justify-between text-xs">
            <span>
              {progress.remaining > 0 ? `Còn thiếu ${formatVNDCompact(progress.remaining)}` : "Đã đạt ngưỡng chia"}
            </span>
            <span>Khởi điểm {formatVNDCompact(cycle.seedAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── JackpotKpiCards ──────────────────────────────────────────────────────────

/**
 * Grid 4 KPI cards: tích luỹ, đóng góp, đỉnh cao, ngưỡng chia.
 * Dùng độc lập — không kèm hero card.
 */
export function JackpotKpiCards() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-22 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { cycle, progress } = data;
  const growthPct =
    cycle.seedAmount > 0 ? Math.round(((cycle.currentAmount - cycle.seedAmount) / cycle.seedAmount) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Layers}
        iconBg="bg-info"
        iconColor="text-info"
        label="Tích luỹ liên tiếp"
        value={`${cycle.drawCount} kỳ`}
        sub={`Từ ${cycle.startDrawId}`}
      />
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-profit"
        iconColor="text-profit"
        label="Tổng tích lũy"
        value={formatVNDCompact(cycle.totalContribution)}
        sub={
          growthPct > 0 ? (
            <>
              <span className="text-profit font-semibold">+{growthPct}%</span>
              {" so với khởi điểm"}
            </>
          ) : (
            `Khởi điểm: ${formatVNDCompact(cycle.seedAmount)}`
          )
        }
      />
      <KpiCard
        icon={TrendingUp}
        iconBg="bg-game-max3d"
        iconColor="text-game-max3d"
        label="Đỉnh cao nhất"
        value={formatVNDCompact(cycle.peakAmount)}
        sub={`Vòng #${cycle.cycleNo}`}
      />
      <KpiCard
        icon={Target}
        iconBg="bg-warning"
        iconColor="text-warning"
        label="Ngưỡng chia"
        value={formatVNDCompact(progress.threshold)}
        sub={progress.remaining > 0 ? `Còn thiếu ${formatVNDCompact(progress.remaining)}` : "Đã đạt ngưỡng"}
      />
    </div>
  );
}

// ─── JackpotOverviewSection ───────────────────────────────────────────────────

/**
 * Section đầy đủ = JackpotHeroCard + JackpotKpiCards.
 * Dùng cho trang /jackpot.
 */
export function JackpotOverviewSection() {
  const { isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-50 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-22 rounded-xl" />
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
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="text-foreground text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}
