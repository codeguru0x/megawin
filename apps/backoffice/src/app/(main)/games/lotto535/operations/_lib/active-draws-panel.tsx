"use client";

import { Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { useCurrentDraw, type CurrentDrawInfo } from "../../draws/_lib/use-draws";

export function ActiveDrawsPanel() {
  const { data, isLoading } = useCurrentDraw();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border bg-card">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const draws = data?.activeDraws ?? [];

  if (draws.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20">
        <Radio className="size-5 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Không có kỳ quay đang hoạt động.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
          <Radio className="size-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-sm font-semibold">Kỳ quay đang hoạt động</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {draws.length}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {draws.map((draw) => (
          <DrawMiniCard key={draw.drawId} draw={draw} />
        ))}
      </div>

      {data?.lastSettledDraw && <LastSettledBadge draw={data.lastSettledDraw} />}
    </div>
  );
}

function DrawMiniCard({ draw }: { draw: CurrentDrawInfo }) {
  const isSalesOpen = draw.status === "salesOpen";
  const closeAt = draw.sales.closeAt ? new Date(draw.sales.closeAt) : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isSalesOpen
          ? "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
          : "bg-card",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{draw.drawId}</span>
          <DrawStatusBadge status={draw.status} className="text-[10px]" />
        </div>
        <span className="text-xs text-muted-foreground">Kỳ {draw.drawNo}</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <MiniStat label="Entries" value={formatNumber(draw.stats?.ticketEntryCount ?? 0)} />
        <MiniStat label="Lines" value={formatNumber(draw.stats?.totalLineCount ?? 0)} />
        <MiniStat label="Doanh thu" value={formatVND(draw.stats?.totalSalesAmount ?? 0)} />
      </div>

      {isSalesOpen && closeAt && <Countdown closeAt={closeAt} />}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Countdown({ closeAt }: { closeAt: Date }) {
  const now = new Date();
  const diff = closeAt.getTime() - now.getTime();

  if (diff <= 0) return null;

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return (
    <div className="mt-2 flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
      <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
      Đóng sau {hours > 0 ? `${hours}h ` : ""}
      {mins}m
    </div>
  );
}

function LastSettledBadge({
  draw,
}: {
  draw: NonNullable<Awaited<ReturnType<typeof useCurrentDraw>>["data"]>["lastSettledDraw"];
}) {
  if (!draw?.result) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <span className="font-medium text-muted-foreground">
        Kết quả gần nhất ({draw.drawId}, Kỳ {draw.drawNo}):
      </span>
      <div className="flex items-center gap-1">
        {draw.result.winningMain.map((n) => (
          <LottoNumberBall key={n} number={n} variant="main" size="sm" />
        ))}
        <span className="mx-1 text-muted-foreground">+</span>
        <LottoNumberBall number={draw.result.winningSpecial} variant="special" size="sm" />
      </div>
    </div>
  );
}
