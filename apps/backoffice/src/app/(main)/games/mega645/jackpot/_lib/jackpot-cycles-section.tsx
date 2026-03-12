"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trophy,
  User,
} from "lucide-react";
import { Pagination } from "@megawin/shared/constants/pagination";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import {
  useJackpotCycles,
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
} from "./use-jackpot";
import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";

export function JackpotCyclesSection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useJackpotCycles({ page });

  const cycles = data?.cycles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / Pagination.Default.Size);
  const hasNext = page * Pagination.Default.Size < total;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/50">
          <Crown className="size-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lịch sử Jackpot Cycle</h2>
          <p className="text-[11px] text-muted-foreground">
            Danh sách các chu kỳ tích lũy đã kết thúc ({formatNumber(total)} cycle)
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center rounded-xl border bg-card">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : cycles.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20">
            <Crown className="size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Chưa có Jackpot Cycle nào đã đóng.</p>
          </div>
        ) : (
          cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} />)
        )}

        {cycles.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs tabular-nums text-muted-foreground">
              Trang {page} / {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CycleCard({ cycle }: { cycle: JackpotCycleSummary }) {
  const isWinner = cycle.closeReason === JackpotCycleCloseReason.Winner;
  const isManual = cycle.closeReason === "manual_reset";

  return (
    <Collapsible>
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm transition-colors",
          isWinner && "border-teal-200 bg-teal-50/30 dark:border-teal-800/50 dark:bg-teal-950/10",
          isManual &&
            "border-slate-200 bg-slate-50/30 dark:border-slate-700/40 dark:bg-slate-950/10",
          !isWinner && !isManual && "bg-card",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/30">
            {/* Icon */}
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                isWinner
                  ? "bg-linear-to-br from-teal-400 to-emerald-500 shadow-md shadow-teal-500/20"
                  : "bg-muted",
              )}
            >
              {isWinner ? (
                <Trophy className="size-5 text-white" />
              ) : (
                <RefreshCcw className="size-5 text-muted-foreground" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">
                  Cycle #{String(cycle.cycleNo).padStart(3, "0")}
                </span>
                <CycleReasonBadge reason={cycle.closeReason} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{cycle.drawCount} kỳ tích lũy</span>
                <span className="tabular-nums">Đỉnh: {formatVNDCompact(cycle.peakAmount)}</span>
                {cycle.closedAt && (
                  <span>
                    {new Date(cycle.closedAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="text-right">
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  isWinner ? "text-teal-700 dark:text-teal-400" : "text-foreground",
                )}
              >
                {formatVNDCompact(cycle.currentAmount)}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatVND(cycle.currentAmount)}</p>
            </div>

            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pb-4 pt-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <StatMini label="Seed khởi điểm" value={formatVND(cycle.seedAmount)} />
              <StatMini label="Tổng tích lũy" value={formatVND(cycle.totalContribution)} />
              <StatMini
                label="Đỉnh cao nhất"
                value={formatVND(cycle.peakAmount)}
                highlight={isWinner}
              />
              <StatMini label="Số kỳ quay" value={formatNumber(cycle.drawCount)} />
            </div>

            {isWinner && cycle.winners && cycle.winners.length > 0 && (
              <WinnerList winners={cycle.winners} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          highlight ? "text-teal-700 dark:text-teal-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CycleReasonBadge({ reason }: { reason?: string }) {
  if (reason === JackpotCycleCloseReason.Winner) {
    return (
      <Badge className="gap-1 border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-400">
        <Sparkles className="size-3" />
        Trúng Jackpot
      </Badge>
    );
  }
  if (reason === "manual_reset") {
    return (
      <Badge variant="outline" className="border-slate-400/40 text-slate-600 dark:text-slate-400">
        <RefreshCcw className="mr-1 size-3" />
        Reset thủ công
      </Badge>
    );
  }
  // Active cycle — không nên hiện trong closed list nhưng guard lại an toàn.
  return <Badge variant="outline">Không rõ</Badge>;
}

function WinnerList({ winners }: { winners: JackpotWinnerSummary[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Người trúng Jackpot
      </p>
      <div className="space-y-2">
        {winners.map((w, idx) => (
          <div
            key={`${w.entryId}-${idx}`}
            className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 dark:border-teal-800/50 dark:bg-teal-950/20"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-teal-400 to-emerald-500 shadow-md shadow-teal-500/20">
              <User className="size-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{w.username ?? w.accountId}</p>
              <p className="text-xs text-muted-foreground">
                Đại lý: {w.tenantName ?? w.tenantId} · Entry: {w.entryId}
              </p>
            </div>
            <p className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
              {formatVND(w.prizeAmount)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
