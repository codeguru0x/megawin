"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Sparkles,
  Trophy,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants";
import {
  useJackpotCycles,
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
} from "./use-jackpot";

const PAGE_SIZE = Pagination.Default.Size;

/** Mapping closedReason → label + variant cho Power 6/55 dual jackpot. */
const CLOSE_REASON_MAP: Record<string, { label: string; variant: "winner" | "neutral" }> = {
  jackpot1_winner: { label: "Trúng Jackpot 1", variant: "winner" },
  jackpot2_winner: { label: "Trúng Jackpot 2", variant: "winner" },
  both_winner: { label: "Trúng Jackpot 1 & 2", variant: "winner" },
  manual_reset: { label: "Manual Reset", variant: "neutral" },
};

export function JackpotCyclesSection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useJackpotCycles({ page });

  const cycles = data?.cycles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50">
          <Crown className="size-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lịch sử Trúng Jackpot</h2>
          <p className="text-[11px] text-muted-foreground">
            Danh sách Jackpot Cycle đã đóng ({formatNumber(total)} cycle)
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
            <p className="text-sm text-muted-foreground">Chưa có lịch sử trúng Jackpot.</p>
          </div>
        ) : (
          cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} />)
        )}

        {cycles.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground tabular-nums">
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
  const reasonInfo = cycle.closedReason ? CLOSE_REASON_MAP[cycle.closedReason] : undefined;
  const isWinner = reasonInfo?.variant === "winner";
  const isActive = cycle.status === "active";

  const jp1 = cycle.jackpot1CurrentAmount;
  const jp2 = cycle.jackpot2CurrentAmount;
  const totalJp = jp1 + jp2;

  return (
    <Collapsible>
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm transition-colors",
          isWinner &&
            "border-green-200 bg-green-50/30 dark:border-green-800/50 dark:bg-green-950/10",
          isActive &&
            !isWinner &&
            "border-red-200 bg-red-50/20 dark:border-red-800/40 dark:bg-red-950/10",
          !isActive && !isWinner && "bg-card",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/30">
            {/* Icon */}
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                isWinner
                  ? "bg-linear-to-br from-green-400 to-emerald-500 shadow-md shadow-green-500/20"
                  : isActive
                    ? "bg-linear-to-br from-red-400 to-orange-500 shadow-md shadow-red-500/20"
                    : "bg-muted",
              )}
            >
              <Trophy
                className={cn(
                  "size-5",
                  isWinner || isActive ? "text-white" : "text-muted-foreground",
                )}
              />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">
                  CY-{String(cycle.cycleNo).padStart(3, "0")}
                </span>
                <CycleReasonBadge reason={cycle.closedReason} isActive={isActive} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{cycle.drawCount} kỳ tích lũy</span>
                {cycle.startedAt && (
                  <span>
                    Từ{" "}
                    {new Date(cycle.startedAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                )}
                {cycle.closedAt && (
                  <span>
                    →{" "}
                    {new Date(cycle.closedAt).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>

            {/* Dual jackpot amounts */}
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs font-bold tabular-nums text-red-600 dark:text-red-400">
                  JP1 {formatVNDCompact(jp1)}
                </span>
                <span className="text-[10px] text-muted-foreground">+</span>
                <span className="text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  JP2 {formatVNDCompact(jp2)}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Tổng {formatVND(totalJp)}</p>
            </div>

            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pb-4 pt-4">
            {/* Dual JP stats */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <StatMini label="Jackpot 1 Khởi điểm" value={formatVND(cycle.jackpot1SeedAmount)} />
              <StatMini label="Jackpot 1 Cuối" value={formatVND(jp1)} highlight="red" />
              <StatMini label="Jackpot 2 Khởi điểm" value={formatVND(cycle.jackpot2SeedAmount)} />
              <StatMini label="Jackpot 2 Cuối" value={formatVND(jp2)} highlight="blue" />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <StatMini label="Số kỳ tích lũy" value={formatNumber(cycle.drawCount)} />
              <StatMini label="Draw bắt đầu" value={cycle.startDrawId || "—"} />
              <StatMini label="Draw kết thúc" value={cycle.endDrawId || "—"} />
            </div>

            {/* Winners */}
            {isWinner && cycle.winners && cycle.winners.length > 0 && (
              <WinnerList winners={cycle.winners} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── CycleReasonBadge ─────────────────────────────────────────────────────────

function CycleReasonBadge({ reason, isActive }: { reason?: string; isActive?: boolean }) {
  if (isActive) {
    return (
      <Badge className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300">
        Đang tích lũy
      </Badge>
    );
  }
  if (!reason) return <Badge variant="outline">Manual</Badge>;

  const info = CLOSE_REASON_MAP[reason];
  if (!info) return <Badge variant="outline">{reason}</Badge>;

  if (info.variant === "winner") {
    return (
      <Badge className="gap-1 border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">
        <Sparkles className="size-3" />
        {info.label}
      </Badge>
    );
  }
  return <Badge variant="outline">{info.label}</Badge>;
}

// ─── StatMini ─────────────────────────────────────────────────────────────────

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "red" | "blue";
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          highlight === "red"
            ? "text-red-700 dark:text-red-400"
            : highlight === "blue"
              ? "text-blue-700 dark:text-blue-400"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── WinnerList ───────────────────────────────────────────────────────────────

const JP_TYPE_STYLE: Record<string, { label: string; color: string }> = {
  jackpot1: {
    label: "Jackpot 1",
    color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
  jackpot2: {
    label: "Jackpot 2",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
};

function WinnerList({ winners }: { winners: JackpotWinnerSummary[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Người trúng Jackpot
      </p>
      <div className="space-y-2">
        {winners.map((w, idx) => {
          const jpStyle = JP_TYPE_STYLE[w.jackpotType];
          return (
            <div
              key={`${w.entryId}-${idx}`}
              className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/50 p-3.5 dark:border-green-800/50 dark:bg-green-950/20"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-green-400 to-emerald-500 shadow-md shadow-green-500/20">
                <User className="size-4.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{w.username ?? w.accountId}</p>
                  {jpStyle && (
                    <span
                      className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", jpStyle.color)}
                    >
                      {jpStyle.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tài khoản: {w.accountId} · Đại lý: {w.tenantId} · Entry: {w.entryId}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400">
                  {formatVND(w.prizeAmount)}
                </p>
                <p className="text-[10px] text-muted-foreground">Draw: {w.drawId}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
