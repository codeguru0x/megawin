"use client";

import type { TicketEntryEntity } from "@megawin/game-bingo18/entities";
import { toTenantUsername } from "@megawin/shared/utils";

import { type EntryRow, GamePlayerEntryList } from "@/components/reports/game/settle";

import { useBingo18Entries } from "../use-report-queries";
import { Bingo18EntryDetailDialog } from "./entry-detail-dialog";
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
  const { data, isLoading, error } = useBingo18Entries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const rows: EntryRow[] = data.map((entry) => {
    const p = entry.payout as any;
    const boardCount = entry.entrySummary?.boards?.length ?? 0;
    // Bingo18 không có lineCount — betUnitCount = Σ(board.betCount)
    const betUnitCount = entry.entrySummary?.boards?.reduce((sum: number, b: any) => sum + (b.betCount ?? 1), 0) ?? 0;
    return {
      id: entry.id,
      ticketNo: entry.entrySummary?.ticketNo ?? entry.id.slice(-8),
      boardCount,
      // lineCount không truyền → component hiển thị chỉ "Boards"
      betUnitCount,
      amount: entry.amount,
      payoutAmount: p?.payoutAmount,
      isSettled: entry.status === "settled",
    };
  });

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
        <Bingo18EntryDetailDialog
          entry={selectedEntryId ? (entryMap.get(selectedEntryId) ?? null) : null}
          open={!!selectedEntryId}
          onClose={onClose}
        />
      )}
    />
  );
}
