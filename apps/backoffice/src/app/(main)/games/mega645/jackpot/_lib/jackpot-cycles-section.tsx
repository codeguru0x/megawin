"use client";

import { useState } from "react";

import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";
import { displayVNDateTime, formatNumber, formatVNDCompact, toTenantUsername } from "@megawin/shared/utils";
import { ChevronDown, Crown, Loader2, RefreshCcw, Sparkles, Trophy, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { Mega645EntryDetailDialog } from "../../reports/settle/_lib/sections/entry-detail-dialog";
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
      <div className="flex items-center gap-2.5">
        <div className="bg-game-mega645 flex size-8 items-center justify-center rounded-lg">
          <Crown className="text-game-mega645 size-4" />
        </div>
        <div>
          <h2 className="text-foreground text-sm font-semibold">Lịch sử vòng tích lũy</h2>
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
            <p className="text-muted-foreground text-sm">Chưa có vòng tích lũy nào đã đóng.</p>
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
          isWinner && "border-game-mega645 bg-game-mega645/30",
          isManual && "border-border bg-muted/30",
          !isWinner && !isManual && "bg-card",
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
                isWinner ? "from-game-mega645 to-profit shadow-game-mega645/20 bg-linear-to-br shadow-md" : "bg-muted",
              )}
            >
              {isWinner ? (
                <Trophy className="size-5 text-white" />
              ) : (
                <RefreshCcw className="text-muted-foreground size-5" />
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
              <p className={cn("text-lg font-bold tabular-nums", isWinner ? "text-game-mega645" : "text-foreground")}>
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
            <div className="grid gap-2 sm:grid-cols-5">
              <StatMini label="Số kỳ" value={formatNumber(cycle.drawCount)} />
              <StatMini label="Kỳ bắt đầu" value={cycle.startDrawId} />
              <StatMini label="Kỳ kết thúc" value={cycle.endDrawId ?? "—"} />
              <StatMini label="Khởi điểm" value={formatNumber(cycle.seedAmount)} />
              <StatMini label="Kết thúc" value={formatNumber(cycle.currentAmount)} />
            </div>

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
      <Badge className="border-game-mega645/30 bg-game-mega645/15 text-game-mega645 gap-1">
        <Sparkles className="size-3" />
        Trúng Jackpot
      </Badge>
    );
  }
  if (reason === "manual_reset") {
    return (
      <Badge variant="outline" className="border-border/40 text-muted-foreground">
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
      <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Người trúng Jackpot</p>
      <div className="space-y-2">
        {winners.map((w, idx) => (
          <button
            key={`${w.entryId}-${idx}`}
            type="button"
            onClick={() => setSelectedEntryId(w.entryId)}
            className="group border-game-mega645 bg-game-mega645/50 hover:border-game-mega645 hover:bg-game-mega645/60 focus-visible:ring-game-mega645/50 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="from-game-mega645 to-profit shadow-game-mega645/20 flex size-10 items-center justify-center rounded-lg bg-linear-to-br shadow-md">
              <User className="size-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toTenantUsername(w.username ?? "")}</p>
              <p className="text-muted-foreground text-xs">
                Đại lý: {w.tenantId} · Kỳ: {w.drawId}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <p className="text-game-mega645 text-lg font-bold tabular-nums">{formatNumber(w.prizeAmount)}</p>
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
