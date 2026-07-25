"use client";

import type { TicketEntryEntity } from "@megawin/game-max3d/entities";
import { toTenantUsername } from "@megawin/shared/utils";

import { type EntryRow, GamePlayerEntryList } from "@/components/reports/game/settle";

import { useMax3DEntries } from "../use-report-queries";
import { Max3dEntryDetailDialog } from "./entry-detail-dialog";
import { EmptyCard, ErrorCard, TableSkeleton } from "./shared-states";

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
  const { data, isLoading, error } = useMax3DEntries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const rows: EntryRow[] = data.map((entry) => ({
    id: entry.id,
    ticketNo: entry.entrySummary.ticketNo,
    boardCount: entry.entrySummary.boards?.length ?? 0,
    lineCount: entry.lineCount,
    // betUnitCount fallback cho data cũ chưa có field này
    betUnitCount: entry.betUnitCount ?? entry.lineCount,
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
        <Max3dEntryDetailDialog
          entry={selectedEntryId ? (entryMap.get(selectedEntryId) ?? null) : null}
          open={!!selectedEntryId}
          onClose={onClose}
        />
      )}
    />
  );
}
