"use client";

import { toTenantUsername } from "@megawin/shared/utils";
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import { useKenoEntries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";
import { KenoEntryDetailDialog } from "./entry-detail-dialog";
import { GamePlayerEntryList, type EntryRow } from "@/components/reports/game/settle";

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
  const { data, isLoading, error } = useKenoEntries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const rows: EntryRow[] = data.map((entry) => {
    // Keno không có lineCount — boardCount lấy từ boardPayouts (sau settle) hoặc selectionCount
    const p = entry.payout as any;
    const boardCount = p?.boardPayouts?.length ?? (entry as any).selectionCount ?? 0;
    return {
      id: entry.id,
      ticketNo: entry.entrySummary?.ticketNo ?? entry.id.slice(-8),
      boardCount,
      // lineCount không truyền → component hiển thị chỉ "Boards"
      betUnitCount: entry.betUnitCount,
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
        <KenoEntryDetailDialog
          entry={selectedEntryId ? (entryMap.get(selectedEntryId) ?? null) : null}
          open={!!selectedEntryId}
          onClose={onClose}
        />
      )}
    />
  );
}
