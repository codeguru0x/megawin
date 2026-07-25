"use client";

import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { toTenantUsername } from "@megawin/shared/utils";

import { type EntryRow, GamePlayerEntryList } from "@/components/reports/game/settle";

import { useMega645Entries } from "../use-report-queries";
import { Mega645EntryDetailDialog } from "./entry-detail-dialog";
import { EmptyCard, ErrorCard, TableSkeleton } from "./shared-states";

/** Cấp 4: Danh sách entries của 1 player cho 1 draw × 1 tenant. */
export function EntryList({
  drawId,
  tenantId,
  accountId,
  playerDisplayName,
}: {
  drawId: string;
  tenantId: string;
  accountId: string;
  playerDisplayName?: string;
}) {
  const { data, isLoading, error } = useMega645Entries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const rows: EntryRow[] = data.map((entry) => ({
    id: entry.id,
    ticketNo: entry.entrySummary.ticketNo,
    boardCount: entry.entrySummary.boards?.length ?? 0,
    lineCount: entry.lineCount,
    betUnitCount: entry.betUnitCount,
    amount: entry.amount,
    payoutAmount: entry.payout?.payoutAmount,
    isSettled: entry.status === "settled",
  }));

  const entryMap = new Map<string, TicketEntryEntity>(data.map((e) => [e.id, e]));

  const playerLabel = toTenantUsername(playerDisplayName ?? accountId) ?? accountId;

  return (
    <GamePlayerEntryList
      drawId={drawId}
      tenantId={tenantId}
      accountId={accountId}
      playerDisplayName={playerLabel}
      rows={rows}
      renderDetailDialog={(selectedEntryId, onClose) => (
        <Mega645EntryDetailDialog
          entry={selectedEntryId ? (entryMap.get(selectedEntryId) ?? null) : null}
          open={!!selectedEntryId}
          onClose={onClose}
        />
      )}
    />
  );
}
