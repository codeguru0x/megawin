"use client";

import { useState } from "react";
import { ChevronDown, Crown, Loader2, RefreshCcw, Sparkles, Trophy, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  formatVNDCompact,
  formatNumber,
  displayVNDateTime,
  toTenantUsername,
} from "@megawin/shared/utils";
import {
  useJackpotCycles,
  useJackpotEntryDetail,
  type JackpotCycleSummary,
  type JackpotWinnerSummary,
} from "./use-jackpot";
import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";
import { Mega645EntryDetailDialog } from "../../reports/settle/_lib/sections/entry-detail-dialog";

const LATEST_COUNT = 3;

export function JackpotCyclesSection() {
  const { data, isLoading } = useJackpotCycles({ page: 1, size: LATEST_COUNT });

  const cycles = data?.cycles ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/50">
          <Crown className="size-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lịch sử vòng tích lũy</h2>
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
                  isWinner ? "text-teal-700 dark:text-teal-400" : "text-foreground",
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
            <div className="grid gap-2 sm:grid-cols-5">
              <StatMini label="Số kỳ" value={formatNumber(cycle.drawCount)} />
              <StatMini label="Kỳ bắt đầu" value={cycle.startDrawId} />
              <StatMini label="Kỳ kết thúc" value={cycle.endDrawId ?? "—"} />
              <StatMini label="Khởi điểm" value={formatNumber(cycle.seedAmount)} />
              <StatMini label="Kết thúc" value={formatNumber(cycle.currentAmount)} />
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
  return <Badge variant="outline">Không rõ</Badge>;
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
            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 text-left transition-colors hover:border-teal-400 hover:bg-teal-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 dark:border-teal-800/50 dark:bg-teal-950/20 dark:hover:border-teal-700 dark:hover:bg-teal-950/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-teal-400 to-emerald-500 shadow-md shadow-teal-500/20">
              <User className="size-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toTenantUsername(w.username ?? "")}</p>
              <p className="text-xs text-muted-foreground">
                Đại lý: {w.tenantId} · Kỳ: {w.drawId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <p className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">
                {formatNumber(w.prizeAmount)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Mega645EntryDetailDialog
        entry={isLoading ? null : (entry ?? null)}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </div>
  );
}
