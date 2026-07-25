"use client";

import { useState } from "react";

import { JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";
import {
  displayVNDateTime,
  formatNumber,
  formatVNDCompact,
  toTenantUsername,
} from "@megawin/shared/utils";
import { ChevronDown, Crown, Loader2, Sparkles, Split, Trophy, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

import { Lotto535EntryDetailDialog } from "../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
  useJackpotCycles,
  useJackpotEntryDetail,
} from "./use-jackpot";

const LATEST_COUNT = 3;

export function JackpotCyclesSection() {
  const { data, isLoading } = useJackpotCycles({ page: 1, size: LATEST_COUNT });

  const cycles = data?.cycles ?? [];

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
          <p className="text-xs text-muted-foreground">
            Danh sách các vòng tích luỹ jackpot gần nhất
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
      </div>
    </div>
  );
}

function CycleCard({ cycle }: { cycle: JackpotCycleSummary }) {
  const isSplit = cycle.closeReason === JackpotCycleCloseReason.Split;
  const isWinner = cycle.closeReason === JackpotCycleCloseReason.Winner;

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
          <button
            type="button"
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/30"
          >
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
                <span className="font-mono text-sm font-bold">Vòng #{cycle.cycleNo}</span>
                <CycleReasonBadge reason={cycle.closeReason} />
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{displayVNDateTime(cycle.startedAt)}</span>
                {cycle.closedAt && (
                  <>
                    <span className="text-muted-foreground/40">→</span>
                    <span className="tabular-nums">{displayVNDateTime(cycle.closedAt)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="text-right">
              <p
                className={cn(
                  "text-lg font-bold tabular-nums",
                  isWinner
                    ? "text-green-700 dark:text-green-400"
                    : "text-amber-700 dark:text-amber-400",
                )}
              >
                {formatVNDCompact(cycle.currentAmount)}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                Tích lũy: {formatNumber(cycle.totalContribution)}
              </p>
            </div>

            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pb-4 pt-4">
            {/* Summary stats */}
            <div className="grid gap-2 sm:grid-cols-5">
              <StatMini label="Số kỳ" value={formatNumber(cycle.drawCount)} />
              <StatMini label="Kỳ bắt đầu" value={cycle.startDrawId} />
              <StatMini label="Kỳ kết thúc" value={cycle.endDrawId ?? "—"} />
              <StatMini label="Khởi điểm" value={formatNumber(cycle.seedAmount)} />
              <StatMini label="Kết thúc" value={formatNumber(cycle.currentAmount)} />
            </div>

            {/* Ngưỡng chia tier detail */}
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

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function CycleReasonBadge({ reason }: { reason?: string }) {
  if (reason === JackpotCycleCloseReason.Winner) {
    return (
      <Badge className="gap-1 border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">
        <Sparkles className="size-3" />
        Trúng Jackpot
      </Badge>
    );
  }
  if (reason === JackpotCycleCloseReason.Split) {
    return (
      <Badge className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
        <Split className="size-3" />
        Chia giải
      </Badge>
    );
  }
  return <Badge variant="outline">Manual</Badge>;
}

function SplitDetailTable({ detail }: { detail: NonNullable<JackpotCycleSummary["splitDetail"]> }) {
  const tiers = Object.entries(detail.tierAllocations);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Chi tiết chia giải
      </p>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tier
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Số người trúng
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tổng phân bổ
              </TableHead>
              <TableHead className="pr-5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Bonus / người
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map(([tier, d]) => (
              <TableRow key={tier}>
                <TableCell className="pl-5 font-medium capitalize">{tier}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(d.winnerCount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(d.totalAmount)}
                </TableCell>
                <TableCell className="pr-5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                  {formatNumber(d.bonusPerWinner)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20 font-semibold">
              <TableCell className="pl-5">Tổng</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(detail.totalWinners)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(detail.splitAmount)}
              </TableCell>
              <TableCell className="pr-5 text-right tabular-nums">
                {formatNumber(detail.totalPaid)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WinnerList({ winners }: { winners: JackpotWinnerSummary[] }) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const { data: entry, isLoading } = useJackpotEntryDetail(selectedEntryId, {
    onNotFound: () => setSelectedEntryId(null),
  });

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Người trúng Jackpot
      </p>
      <div className="space-y-2">
        {winners.map((w, idx) => (
          <button
            key={`${w.entryId}-${idx}`}
            type="button"
            onClick={() => setSelectedEntryId(w.entryId)}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-green-200 bg-green-50/50 p-3.5 text-left transition-colors hover:border-green-400 hover:bg-green-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 dark:border-green-800/50 dark:bg-green-950/20 dark:hover:border-green-700 dark:hover:bg-green-950/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-green-400 to-emerald-500 shadow-md shadow-green-500/20">
              <User className="size-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toTenantUsername(w.username ?? "")}</p>
              <p className="text-xs text-muted-foreground">
                Đại lý: {w.tenantId} · Kỳ: {w.drawId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400">
                {formatNumber(w.prizeAmount)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Lotto535EntryDetailDialog
        entry={isLoading ? null : (entry ?? null)}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </div>
  );
}
