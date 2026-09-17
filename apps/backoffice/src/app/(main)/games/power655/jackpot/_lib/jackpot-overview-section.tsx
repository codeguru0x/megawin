"use client";

import { formatVND, formatVNDCompact } from "@megawin/shared/utils";
import { CircleDollarSign, Flame, Hash, Layers, TrendingUp, Trophy, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  if (isLoading) {
    return <Skeleton className="h-70 rounded-2xl" />;
  }
  if (!data) {
    return null;
  }

  const { cycle, config } = data;

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
        "from-loss/90 via-warning/70 to-warning/50 bg-linear-to-br",
        "from-loss/50 via-warning/40 to-warning/30",
        isOverflow ? "border-game-max3d" : isHot ? "border-loss" : "border-loss",
      )}
    >
      {/* Decorative orbs */}
      <div className="from-loss/20 to-warning/10 pointer-events-none absolute -top-10 -right-10 size-52 rounded-full bg-linear-to-br blur-3xl" />
      <div className="from-warning/15 to-warning/8 pointer-events-none absolute bottom-0 -left-8 size-36 rounded-full bg-linear-to-tr blur-2xl" />

      <div className="relative space-y-5">
        {/* ── Top row ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="from-loss to-warning shadow-loss/30 flex size-12 items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
              <Trophy className="size-6 text-white" />
            </div>
            <div>
              <p className="text-loss/70 text-xs font-medium tracking-wider uppercase">
                Power 6/55 Dual Jackpot — Vòng #{cycle.cycleNo}
              </p>
              {/* JP1 primary — dòng lớn */}
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="bg-loss text-loss rounded-md px-1.5 py-0.5 text-xs font-bold">Jackpot 1</span>
                <span className="text-loss text-3xl font-extrabold tracking-tight tabular-nums">{formatVND(jp1)}</span>
              </div>
              {/* JP2 secondary — dòng nhỏ */}
              <div className="mt-1 flex items-center gap-2">
                <span className="bg-info text-info rounded-md px-1.5 py-0.5 text-xs font-bold">Jackpot 2</span>
                <span className="text-info text-sm font-semibold tabular-nums">{formatVND(jp2)}</span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {isOverflow && (
              <Badge className="border-game-max3d bg-game-max3d text-game-max3d gap-1">
                <Zap className="size-3" />
                Overflow
              </Badge>
            )}
            {!isOverflow && isHot && (
              <Badge className="border-loss bg-loss text-loss gap-1">
                <Flame className="size-3" />
                Nóng
              </Badge>
            )}
          </div>
        </div>

        {/* ── JP1 overflow progress bar ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-loss/70 font-medium">
              Tiến trình đến overflow — <span className="font-semibold">{formatVNDCompact(overflowThreshold)}</span>
            </span>
            <span className="text-loss font-bold tabular-nums">{jp1Pct.toFixed(1)}%</span>
          </div>
          <div className="bg-loss/50 h-3 w-full overflow-hidden rounded-full">
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
          <div className="text-loss/60 flex items-center justify-between text-xs">
            <span>
              {isOverflow
                ? `Đã vượt +${formatVNDCompact(jp1 - overflowThreshold)}`
                : `Còn thiếu ${formatVNDCompact(jp1Remaining)}`}
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-loss text-loss rounded-md px-1.5 py-0.5 text-xs font-bold">JP1 {jp1ContribPct}%</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="bg-info text-info rounded-md px-1.5 py-0.5 text-xs font-bold">JP2 {jp2ContribPct}%</span>
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
          <Skeleton key={i} className="h-22 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { cycle, jackpot1Progress, jackpot2Progress } = data;

  // Phần tích luỹ thuần = current - seed (không tính seed ban đầu).
  // Tương đương cycle.totalContribution của Lotto 5/35 / Mega 6/45.
  const jp1Contribution = jackpot1Progress.current - jackpot1Progress.seed;
  const jp2Contribution = jackpot2Progress.current - jackpot2Progress.seed;

  // % tăng JP1 so với khởi điểm seed
  const jp1GrowthPct = jackpot1Progress.seed > 0 ? Math.round((jp1Contribution / jackpot1Progress.seed) * 100) : 0;

  // % tăng JP2 so với khởi điểm seed hiện tại (seed reset mỗi lần JP2 trao thưởng)
  const jp2GrowthPct = jackpot2Progress.seed > 0 ? Math.round((jp2Contribution / jackpot2Progress.seed) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Card 1: Số kỳ tích luỹ liên tiếp */}
      <KpiCard
        icon={Layers}
        iconBg="bg-info"
        iconColor="text-info"
        label="Tích luỹ liên tiếp"
        value={`${cycle.drawCount} kỳ`}
        sub={`Từ ${cycle.startDrawId || "—"}`}
      />
      {/* Card 2: Tổng tích luỹ JP1 + % tăng so với khởi điểm */}
      <KpiCard
        icon={CircleDollarSign}
        iconBg="bg-loss"
        iconColor="text-loss"
        label="Tổng tích luỹ JP1"
        value={formatVNDCompact(jp1Contribution)}
        sub={
          jp1GrowthPct > 0 ? (
            <>
              <span className="text-profit font-semibold">+{jp1GrowthPct}%</span>
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
        iconBg="bg-info"
        iconColor="text-info"
        label="Tổng tích luỹ JP2"
        value={formatVNDCompact(jp2Contribution)}
        sub={
          jp2GrowthPct > 0 ? (
            <>
              <span className="text-profit font-semibold">+{jp2GrowthPct}%</span>
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
        iconBg="bg-warning"
        iconColor="text-warning"
        label="Số lần JP2 trao thưởng"
        value={`${cycle.jackpot2ResetCount} lần`}
        sub={cycle.jackpot2ResetCount > 0 ? "JP2 đã reset, JP1 vẫn tích luỹ" : "JP2 chưa trao thưởng vòng này"}
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
        <Skeleton className="h-70 rounded-2xl" />
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
