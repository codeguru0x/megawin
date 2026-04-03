"use client";

import { toTenantUsername } from "@megawin/shared/utils";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import { usePower655Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";
import { Power655EntryDetailDialog } from "./entry-detail-dialog";
import { GamePlayerEntryList, type EntryRow } from "@/components/reports/game/settle";

/** Cấp 4 drill-down: entries của 1 player × 1 draw × 1 tenant — Power 6/55. */
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
  const { data, isLoading, error } = usePower655Entries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length)
    return <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có entry nào." />;

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
        <Power655EntryDetailDialog
          entry={selectedEntryId ? (entryMap.get(selectedEntryId) ?? null) : null}
          open={!!selectedEntryId}
          onClose={onClose}
        />
      )}
    />
  );
}
