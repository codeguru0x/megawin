"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
  Sparkles,
  Split,
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
import { formatVND, formatVNDCompact, formatNumber } from "@megawin/shared/utils/number";
import {
  useJackpotCycles,
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
} from "./use-jackpot";

const PAGE_SIZE = 10;

const CLOSE_REASON_LABELS: Record<
  string,
  { label: string; variant: "winner" | "split" | "neutral" }
> = {
  jackpot1_winner: { label: "Trúng JP1", variant: "winner" },
  jackpot2_winner: { label: "Trúng JP2", variant: "winner" },
  both_winner: { label: "Trúng JP1 & JP2", variant: "winner" },
  split: { label: "Chia giải", variant: "split" },
};

export function JackpotCyclesSection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useJackpotCycles({
    page,
    size: PAGE_SIZE,
  });

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
          <h2 className="text-sm font-semibold text-foreground">
            Lịch sử chia giải / Trúng Jackpot
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Danh sách các Jackpot Cycle đã đóng ({formatNumber(total)} cycle)
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
            <p className="text-sm text-muted-foreground">
              Chưa có lịch sử chia giải hoặc trúng Jackpot.
            </p>
          </div>
        ) : (
          cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} />)
        )}

        {/* Pagination */}
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
  const reasonInfo = cycle.closedReason ? CLOSE_REASON_LABELS[cycle.closedReason] : undefined;
  const isWinner = reasonInfo?.variant === "winner";
  const isSplit = reasonInfo?.variant === "split";

  const totalJp = cycle.jackpot1Current + cycle.jackpot2Current;

  return (
    <Collapsible>
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm transition-colors",
          isSplit &&
            "border-amber-200 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-950/10",
          isWinner &&
            "border-green-200 bg-green-50/30 dark:border-green-800/50 dark:bg-green-950/10",
          !isSplit && !isWinner && "bg-card",
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
                  : isSplit
                    ? "bg-linear-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/20"
                    : "bg-muted",
              )}
            >
              {isWinner ? (
                <Trophy className="size-5 text-white" />
              ) : isSplit ? (
                <Split className="size-5 text-white" />
              ) : (
                <Split className="size-5 text-muted-foreground" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">
                  JP-{String(cycle.cycleNo).padStart(3, "0")}
                </span>
                <CycleReasonBadge reason={cycle.closedReason} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{cycle.drawCount} kỳ tích lũy</span>
                <span className="tabular-nums">Tổng: {formatVNDCompact(totalJp)}</span>
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

            {/* JP1 + JP2 amount */}
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-600 dark:text-red-400">
                  JP1: {formatVNDCompact(cycle.jackpot1Current)}
                </span>
                <span className="text-xs text-muted-foreground">+</span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  JP2: {formatVNDCompact(cycle.jackpot2Current)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{formatVND(totalJp)}</p>
            </div>

            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pb-4 pt-4">
            {/* Summary stats */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <StatMini label="JP1 Khởi điểm" value={formatVND(cycle.jackpot1Opening)} />
              <StatMini label="JP2 Khởi điểm" value={formatVND(cycle.jackpot2Opening)} />
              <StatMini label="JP1 Cuối" value={formatVND(cycle.jackpot1Current)} highlight="red" />
              <StatMini
                label="JP2 Cuối"
                value={formatVND(cycle.jackpot2Current)}
                highlight="blue"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <StatMini label="Số kỳ" value={formatNumber(cycle.drawCount)} />
              <StatMini
                label="Bắt đầu"
                value={
                  cycle.startedAt
                    ? new Date(cycle.startedAt).toLocaleDateString("vi-VN")
                    : cycle.startDrawId
                }
              />
              <StatMini
                label="Kết thúc"
                value={cycle.closedAt ? new Date(cycle.closedAt).toLocaleDateString("vi-VN") : "—"}
              />
            </div>

            {/* Split tier detail */}
            {isSplit && cycle.splitDetail && <SplitDetailTable detail={cycle.splitDetail} />}

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

function CycleReasonBadge({ reason }: { reason?: string }) {
  if (!reason) return <Badge variant="outline">Manual</Badge>;

  const info = CLOSE_REASON_LABELS[reason];
  if (!info) return <Badge variant="outline">{reason}</Badge>;

  if (info.variant === "winner") {
    return (
      <Badge className="gap-1 border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">
        <Sparkles className="size-3" />
        {info.label}
      </Badge>
    );
  }
  if (info.variant === "split") {
    return (
      <Badge className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
        <Split className="size-3" />
        {info.label}
      </Badge>
    );
  }
  return <Badge variant="outline">{info.label}</Badge>;
}

function SplitDetailTable({ detail }: { detail: NonNullable<JackpotCycleSummary["splitDetail"]> }) {
  type TierAlloc = { winnerCount: number; totalAmount: number; bonusPerWinner: number };
  const tiers = Object.entries(detail.tierAllocations) as [string, TierAlloc][];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Chi tiết chia giải
      </p>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold">Tier</TableHead>
              <TableHead className="text-right font-semibold">Số người trúng</TableHead>
              <TableHead className="text-right font-semibold">Tổng phân bổ</TableHead>
              <TableHead className="text-right font-semibold">Bonus / người</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map(([tier, d]) => (
              <TableRow key={tier}>
                <TableCell className="font-medium capitalize">{tier}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(d.winnerCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatVND(d.totalAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {formatVND(d.bonusPerWinner)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20 font-semibold">
              <TableCell>Tổng</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(detail.totalWinners)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatVND(detail.splitAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatVND(detail.totalPaid)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const JP_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  jackpot1: { label: "JP1", color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
  jackpot2: {
    label: "JP2",
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
          const jpInfo = JP_TYPE_LABELS[w.jackpotType];
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
                  {jpInfo && (
                    <span
                      className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", jpInfo.color)}
                    >
                      {jpInfo.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tài khoản: {w.accountId} · Đại lý: {w.tenantName ?? w.tenantId} · Entry:{" "}
                  {w.entryId}
                </p>
              </div>
              <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400">
                {formatVND(w.prizeAmount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
