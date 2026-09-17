"use client";

import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { CircleDollarSign, Flame, Layers, MoveUpRight, Sigma, Target, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useJackpotCurrent } from "./use-jackpot";

// ─── JackpotHeroCard ──────────────────────────────────────────────────────────

/**
 * Hero card hiển thị jackpot Mega 6/45 hiện tại: số tiền, tiến trình, badge trạng thái.
 * Tự fetch data qua useJackpotCurrent — dùng độc lập, không kèm KPI stats.
 */
export function JackpotHeroCard() {
  const { data, isLoading } = useJackpotCurrent();

  if (isLoading) {
    return <Skeleton className="h-55 rounded-2xl" />;
  }
  if (!data) {
    return null;
  }

  const { cycle, progress } = data;

  // Guard: progress có thể undefined nếu response từ cache cũ chưa có field này.
  const pct = progress?.percentage ?? 0;
  // "Nóng" khi đã đạt ≥ 90% ngưỡng milestone hiện tại.
  const isHot = pct >= 90;
  const isWarm = pct >= 60;

  const growthPct =
    cycle.seedAmount > 0 ? Math.round(((cycle.currentAmount - cycle.seedAmount) / cycle.seedAmount) * 100) : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 p-6",
        "from-game-mega645/90 via-info/70 to-profit/50 bg-linear-to-br",
        "from-game-mega645/50 via-info/40 to-profit/30",
        isHot ? "border-game-mega645" : "border-game-mega645",
      )}
    >
      {/* Decorative glows */}
      <div className="from-game-mega645/25 to-info/15 pointer-events-none absolute -top-10 -right-10 size-52 rounded-full bg-linear-to-br blur-3xl" />
      <div className="from-profit/20 to-game-mega645/10 pointer-events-none absolute bottom-0 -left-8 size-36 rounded-full bg-linear-to-tr blur-2xl" />

      <div className="relative space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="from-game-mega645 to-profit shadow-game-mega645/30 flex size-12 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-game-mega645/70 text-xs font-medium tracking-wider uppercase">
                Jackpot Mega 6/45 — Vòng #{cycle.cycleNo}
              </p>
              <p className="text-game-mega645 mt-0.5 text-3xl font-extrabold tracking-tight tabular-nums">
                {formatVND(cycle.currentAmount)}
              </p>
              {growthPct > 0 && (
                <p className="text-profit/80 mt-0.5 flex items-center gap-1 text-xs font-medium">
                  <MoveUpRight className="size-3.5" />+{growthPct}% so với khởi điểm
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isHot && (
              <Badge className="border-loss bg-loss text-loss gap-1">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
            <Badge variant="outline" className="border-game-mega645/60 bg-game-mega645/80 text-game-mega645">
              Tích lũy vô hạn
            </Badge>
          </div>
        </div>

        {/* Milestone progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-game-mega645/70 font-medium">
              Tiến trình đến{" "}
              <span className="font-semibold">{formatVNDCompact(progress?.milestoneThreshold ?? 0)}</span>
            </span>
            <span className="text-game-mega645 font-bold tabular-nums">{pct.toFixed(1)}%</span>
          </div>
          <div className="bg-game-mega645/60 h-3 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(pct, 100)}%`,
                background: isHot
                  ? "linear-gradient(90deg, #0d9488, #0891b2, #06b6d4)"
                  : isWarm
                    ? "linear-gradient(90deg, #14b8a6, #0d9488, #059669)"
                    : "linear-gradient(90deg, #5eead4, #2dd4bf, #14b8a6)",
              }}
            />
          </div>
          <div className="text-game-mega645/60 flex items-center justify-between text-xs">
            <span>
              {(progress?.remaining ?? 0) > 0
                ? `Còn thiếu ${formatVNDCompact(progress!.remaining)}`
                : progress
                  ? `Đã vượt mốc ×${progress.currentMultiple}`
                  : "Đang tải..."}
            </span>
            <span>
              Mốc ×{progress?.nextMultiple ?? "?"} · Khởi điểm {formatVNDCompact(cycle.seedAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── JackpotKpiCards ──────────────────────────────────────────────────────────

/**
 * Grid 4 KPI cards: tích luỹ, đóng góp, đỉnh cao, mốc tiếp theo.
 * Tự fetch data qua useJackpotCurrent — dùng độc lập, không kèm hero card.
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
        iconBg="bg-game-mega645"
        iconColor="text-game-mega645"
        label="Tích luỹ liên tiếp"
        value={`${cycle.drawCount} kỳ`}
        sub={cycle.startDrawId ? `Từ ${cycle.startDrawId}` : "Chưa bắt đầu"}
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
        icon={Sigma}
        iconBg="bg-info"
        iconColor="text-info"
        label="Đỉnh cao nhất"
        value={formatVNDCompact(cycle.peakAmount)}
        sub={`Vòng #${cycle.cycleNo}`}
      />
      <KpiCard
        icon={Target}
        iconBg="bg-game-mega645"
        iconColor="text-game-mega645"
        label="Mốc tiếp theo"
        value={formatVNDCompact(progress?.milestoneThreshold ?? 0)}
        sub={`×${progress?.nextMultiple ?? "?"} khởi điểm — mốc tham chiếu`}
      />
    </div>
  );
}

// ─── JackpotOverviewSection ───────────────────────────────────────────────────

/**
 * Section đầy đủ = JackpotHeroCard + JackpotKpiCards.
 * Dùng cho trang /games/mega645/jackpot.
 */
export function JackpotOverviewSection() {
  const { isLoading } = useJackpotCurrent();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-55 rounded-2xl" />
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
