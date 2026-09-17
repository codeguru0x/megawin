"use client";

import { useState } from "react";

import { JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";
import { displayVNDateTime, formatNumber, formatVNDCompact, toTenantUsername } from "@megawin/shared/utils";
import { ChevronDown, Crown, Loader2, Sparkles, Split, Trophy, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Lotto535EntryDetailDialog } from "../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  useJackpotCycles,
  useJackpotEntryDetail,
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
} from "./use-jackpot";

const LATEST_COUNT = 3;

export function JackpotCyclesSection() {
  const { data, isLoading } = useJackpotCycles({ page: 1, size: LATEST_COUNT });

  const cycles = data?.cycles ?? [];

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="bg-game-max3d flex size-8 items-center justify-center rounded-lg">
          <Crown className="text-game-max3d size-4" />
        </div>
        <div>
          <h2 className="text-foreground text-sm font-semibold">Lịch sử chia giải / Trúng Jackpot</h2>
          <p className="text-muted-foreground text-xs">Danh sách các vòng tích luỹ jackpot gần nhất</p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-card flex h-32 items-center justify-center rounded-xl border">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : cycles.length === 0 ? (
          <div className="bg-muted/20 flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
            <Crown className="text-muted-foreground/40 size-6" />
            <p className="text-muted-foreground text-sm">Chưa có lịch sử chia giải hoặc trúng Jackpot.</p>
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
          isSplit && "border-warning bg-warning/30",
          isWinner && "border-profit bg-profit/30",
          !isSplit && !isWinner && "bg-card",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="hover:bg-accent/30 flex w-full items-center gap-4 p-4 text-left transition-colors"
          >
            {/* Icon */}
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                isWinner
                  ? "from-profit to-game-mega645 shadow-profit/20 bg-linear-to-br shadow-md"
                  : isSplit
                    ? "from-warning to-loss shadow-warning/20 bg-linear-to-br shadow-md"
                    : "bg-muted",
              )}
            >
              {isWinner ? (
                <Trophy className="size-5 text-white" />
              ) : isSplit ? (
                <Split className="size-5 text-white" />
              ) : (
                <Split className="text-muted-foreground size-5" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">Vòng #{cycle.cycleNo}</span>
                <CycleReasonBadge reason={cycle.closeReason} />
              </div>
              <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
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
              <p className={cn("text-lg font-bold tabular-nums", isWinner ? "text-profit" : "text-warning")}>
                {formatVNDCompact(cycle.currentAmount)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                Tích lũy: {formatNumber(cycle.totalContribution)}
              </p>
            </div>

            <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pt-4 pb-4">
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
            {isWinner && cycle.winners && cycle.winners.length > 0 && <WinnerList winners={cycle.winners} />}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">{label}</p>
      <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CycleReasonBadge({ reason }: { reason?: string }) {
  if (reason === JackpotCycleCloseReason.Winner) {
    return (
      <Badge className="border-profit/30 bg-profit/15 text-profit gap-1">
        <Sparkles className="size-3" />
        Trúng Jackpot
      </Badge>
    );
  }
  if (reason === JackpotCycleCloseReason.Split) {
    return (
      <Badge className="border-warning/30 bg-warning/15 text-warning gap-1">
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
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Chi tiết chia giải</p>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-muted-foreground pl-5 text-xs font-medium tracking-wider uppercase">
                Tier
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs font-medium tracking-wider uppercase">
                Số người trúng
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs font-medium tracking-wider uppercase">
                Tổng phân bổ
              </TableHead>
              <TableHead className="text-muted-foreground pr-5 text-right text-xs font-medium tracking-wider uppercase">
                Bonus / người
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map(([tier, d]) => (
              <TableRow key={tier}>
                <TableCell className="pl-5 font-medium capitalize">{tier}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(d.winnerCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(d.totalAmount)}</TableCell>
                <TableCell className="text-warning pr-5 text-right font-semibold tabular-nums">
                  {formatNumber(d.bonusPerWinner)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/20 font-semibold">
              <TableCell className="pl-5">Tổng</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(detail.totalWinners)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(detail.splitAmount)}</TableCell>
              <TableCell className="pr-5 text-right tabular-nums">{formatNumber(detail.totalPaid)}</TableCell>
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
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Người trúng Jackpot</p>
      <div className="space-y-2">
        {winners.map((w, idx) => (
          <button
            key={`${w.entryId}-${idx}`}
            type="button"
            onClick={() => setSelectedEntryId(w.entryId)}
            className="group border-profit bg-profit/50 hover:border-profit hover:bg-profit/60 focus-visible:ring-profit/50 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="from-profit to-game-mega645 shadow-profit/20 flex size-10 items-center justify-center rounded-lg bg-linear-to-br shadow-md">
              <User className="size-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toTenantUsername(w.username ?? "")}</p>
              <p className="text-muted-foreground text-xs">
                Đại lý: {w.tenantId} · Kỳ: {w.drawId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <p className="text-profit text-lg font-bold tabular-nums">{formatNumber(w.prizeAmount)}</p>
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
