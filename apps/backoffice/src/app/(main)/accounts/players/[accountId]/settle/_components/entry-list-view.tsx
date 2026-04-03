"use client";

import { GAME_LABELS } from "@megawin/game-core/labels";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GameEntryDetailDialog } from "@/components/reports/game/game-entry-detail-dialog";
import {
  GamePlayerEntryList,
  type EntryRow,
} from "@/components/reports/game/settle/game-player-entry-list";

import {
  usePlayerEntries,
  usePlayerEntryDetail,
  type PlayerSettledEntryResponse,
} from "../../_shared/queries";

interface EntryListViewProps {
  accountId: string;
  financialDate: string;
  game: string;
  drawId: string;
  playerDisplayName?: string;
}

/** Map PlayerSettledEntryResponse → EntryRow cho GamePlayerEntryList. */
function toEntryRow(entry: PlayerSettledEntryResponse): EntryRow {
  return {
    id: entry.entryId,
    ticketNo: entry.ticketNo || entry.entryId.slice(-8),
    boardCount: entry.boardCount ?? 0,
    lineCount: entry.lineCount > 0 ? entry.lineCount : undefined,
    betUnitCount: entry.betUnitCount ?? entry.lineCount,
    amount: entry.amount,
    payoutAmount: entry.status !== "void" ? entry.payoutAmount : undefined,
    isSettled: entry.status === "settled",
  };
}

/**
 * View 4 — Entry list cho 1 kỳ quay cụ thể.
 *
 * Reuse GamePlayerEntryList (shared component).
 * Click row → fetch full entry doc → GameEntryDetailDialog.
 */
export function EntryListView({
  accountId,
  financialDate,
  game,
  drawId,
  playerDisplayName,
}: EntryListViewProps) {
  const {
    data: entries,
    isLoading,
    isError,
  } = usePlayerEntries(accountId, financialDate, game, drawId);

  const gameLabel = GAME_LABELS[game as GameProduct] ?? game;
  const tenantId = entries?.[0]?.tenantId ?? "";

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="space-y-0 p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b px-5 py-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-3 flex-1" />
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-[160px] items-center justify-center">
          <p className="text-sm text-destructive">Không thể tải danh sách entries.</p>
        </CardContent>
      </Card>
    );
  }

  if (!entries?.length) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-[160px] items-center justify-center">
          <p className="text-sm text-muted-foreground">Không có entry nào cho kỳ quay này.</p>
        </CardContent>
      </Card>
    );
  }

  const rows = entries.map(toEntryRow);

  return (
    <GamePlayerEntryList
      drawId={`${gameLabel} · ${drawId}`}
      tenantId={tenantId}
      accountId={accountId}
      playerDisplayName={playerDisplayName}
      rows={rows}
      renderDetailDialog={(selectedEntryId, onClose) => (
        <PlayerEntryDetailLoader
          accountId={accountId}
          entryId={selectedEntryId}
          game={game}
          open={!!selectedEntryId && !!entries.find((e) => e.entryId === selectedEntryId)}
          onClose={onClose}
        />
      )}
    />
  );
}

// ─── Detail Dialog Loader ─────────────────────────────────────────────────────

function PlayerEntryDetailLoader({
  accountId,
  entryId,
  game,
  open,
  onClose,
}: {
  accountId: string;
  entryId: string | null;
  game: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: entryDetail, isLoading } = usePlayerEntryDetail(accountId, entryId ?? "", game);

  return (
    <GameEntryDetailDialog
      game={game}
      entry={isLoading ? null : (entryDetail ?? null)}
      open={open && !isLoading}
      onClose={onClose}
    />
  );
}
