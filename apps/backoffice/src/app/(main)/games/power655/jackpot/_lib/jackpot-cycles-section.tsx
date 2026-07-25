"use client";

import { useState } from "react";

import { displayVNDateTime, formatNumber, formatVNDCompact, toTenantUsername } from "@megawin/shared/utils";
import { ChevronDown, Crown, Loader2, RefreshCcw, Sparkles, Trophy, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { Power655EntryDetailDialog } from "../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
  useJackpotCycles,
  useJackpotEntryDetail,
} from "./use-jackpot";

const LATEST_COUNT = 3;

/** Mapping closedReason → label + variant cho Power 6/55 dual jackpot. */
const CLOSE_REASON_MAP: Record<string, { label: string; variant: "winner" | "neutral" }> = {
  jackpot1_winner: { label: "Trúng Jackpot 1", variant: "winner" },
  jackpot2_winner: { label: "Trúng Jackpot 2", variant: "winner" },
  both_winner: { label: "Trúng Jackpot 1 & 2", variant: "winner" },
  manual_reset: { label: "Reset thủ công", variant: "neutral" },
};

/** Style badge hiển thị loại Jackpot bên cạnh tên người trúng. */
const JP_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  jackpot1: {
    label: "Jackpot 1",
    className: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
  jackpot2: {
    label: "Jackpot 2",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
};

export function JackpotCyclesSection() {
  const { data, isLoading } = useJackpotCycles({ page: 1, size: LATEST_COUNT });

  const cycles = data?.cycles ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
          <Crown className="size-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lịch sử vòng tích lũy</h2>
          <p className="text-xs text-muted-foreground">Danh sách các vòng tích luỹ jackpot gần nhất</p>
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
            <p className="text-sm text-muted-foreground">Chưa có vòng tích lũy nào đã đóng.</p>
          </div>
        ) : (
          cycles.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} />)
        )}
      </div>
    </div>
  );
}

function CycleCard({ cycle }: { cycle: JackpotCycleSummary }) {
  const reasonInfo = cycle.closedReason ? CLOSE_REASON_MAP[cycle.closedReason] : undefined;
  const isWinner = reasonInfo?.variant === "winner";

  const jp1 = cycle.jackpot1CurrentAmount;
  const jp2 = cycle.jackpot2CurrentAmount;

  return (
    <Collapsible>
      <div
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm transition-colors",
          isWinner && "border-orange-200 bg-orange-50/30 dark:border-orange-800/50 dark:bg-orange-950/10",
          !isWinner && "bg-card",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/30">
            {/* Icon */}
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                isWinner ? "bg-linear-to-br from-orange-400 to-red-500 shadow-md shadow-orange-500/20" : "bg-muted",
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold">Vòng #{cycle.cycleNo}</span>
                <CycleReasonBadge reason={cycle.closedReason} />
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

            {/* Dual jackpot amounts */}
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs font-bold tabular-nums text-red-600 dark:text-red-400">
                  JP1: {formatVNDCompact(jp1)}
                </span>
                <span className="text-xs text-muted-foreground">+</span>
                <span className="text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  JP2: {formatVNDCompact(jp2)}
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">Tổng: {formatNumber(jp1 + jp2)}</p>
            </div>

            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 pb-4 pt-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <StatMini label="Số kỳ tích lũy" value={formatNumber(cycle.drawCount)} />
              <StatMini label="Kỳ bắt đầu" value={cycle.startDrawId || "—"} />
              <StatMini label="Kỳ kết thúc" value={cycle.endDrawId || "—"} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <StatMini label="Jackpot 1 - Khởi điểm" value={formatNumber(cycle.jackpot1SeedAmount)} />
              <StatMini label="Jackpot 1 - Kết thúc" value={formatNumber(jp1)} highlight="red" />
              <StatMini label="Jackpot 2 - Khởi điểm" value={formatNumber(cycle.jackpot2SeedAmount)} />
              <StatMini label="Jackpot 2 - Kết thúc" value={formatNumber(jp2)} highlight="blue" />
            </div>
            {isWinner && cycle.winners && cycle.winners.length > 0 && <WinnerList winners={cycle.winners} />}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function StatMini({ label, value, highlight }: { label: string; value: string; highlight?: "red" | "blue" }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
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
  if (!reason) return <Badge variant="outline">Reset thủ công</Badge>;

  const info = CLOSE_REASON_MAP[reason];
  if (!info) return <Badge variant="outline">{reason}</Badge>;

  if (info.variant === "winner") {
    return (
      <Badge className="gap-1 border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-400">
        <Sparkles className="size-3" />
        {info.label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-slate-400/40 text-slate-600 dark:text-slate-400">
      <RefreshCcw className="mr-1 size-3" />
      {info.label}
    </Badge>
  );
}

function WinnerList({ winners }: { winners: JackpotWinnerSummary[] }) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const { data: entry, isLoading } = useJackpotEntryDetail(selectedEntryId, {
    onNotFound: () => setSelectedEntryId(null),
  });

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Người trúng Jackpot</p>
      <div className="space-y-2">
        {winners.map((w, idx) => {
          const jpBadge = JP_TYPE_BADGE[w.jackpotType];
          return (
            <button
              key={`${w.entryId}-${idx}`}
              type="button"
              onClick={() => setSelectedEntryId(w.entryId)}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3.5 text-left transition-colors hover:border-orange-400 hover:bg-orange-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:border-orange-800/50 dark:bg-orange-950/20 dark:hover:border-orange-700 dark:hover:bg-orange-950/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-red-500 shadow-md shadow-orange-500/20">
                <User className="size-4.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{toTenantUsername(w.username ?? "")}</p>
                  {jpBadge && (
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", jpBadge.className)}>
                      {jpBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Đại lý: {w.tenantId} · Kỳ: {w.drawId}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <p className="text-lg font-bold tabular-nums text-orange-700 dark:text-orange-400">
                  {formatNumber(w.prizeAmount)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Power655EntryDetailDialog
        entry={isLoading ? null : (entry ?? null)}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </div>
  );
}
