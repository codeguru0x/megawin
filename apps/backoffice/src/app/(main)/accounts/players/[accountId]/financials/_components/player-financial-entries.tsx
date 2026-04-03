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

interface PlayerFinancialEntriesViewProps {
  accountId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Game product string. */
  game: string;
}

/** Map PlayerSettledEntryResponse → EntryRow cho GamePlayerEntryList. */
function toEntryRow(entry: PlayerSettledEntryResponse): EntryRow {
  return {
    id: entry.entryId,
    ticketNo: entry.ticketNo || entry.entryId.slice(-8),
    // boardCount từ API (optional) — fallback 0 để hiện số
    boardCount: entry.boardCount ?? 0,
    // lineCount > 0 → game có lines; = 0 → không có (keno, bingo18)
    lineCount: entry.lineCount > 0 ? entry.lineCount : undefined,
    betUnitCount: entry.betUnitCount ?? entry.lineCount,
    amount: entry.amount,
    payoutAmount: entry.status !== "void" ? entry.payoutAmount : undefined,
    isSettled: entry.status === "settled",
  };
}

/**
 * View drill cấp 2 — entries settled/voided của player trong 1 ngày × 1 game.
 *
 * Dùng lại GamePlayerEntryList (shared component) để đảm bảo hiển thị
 * đồng nhất với trang Financial Reports theo kỳ quay.
 *
 * Click row → fetch full entry doc → hiển thị EntryDetailDialog game-specific.
 */
export function PlayerFinancialEntriesView({
  accountId,
  financialDate,
  game,
}: PlayerFinancialEntriesViewProps) {
  const { data: entries, isLoading, isError } = usePlayerEntries(accountId, financialDate, game);

  const gameLabel = GAME_LABELS[game as GameProduct] ?? game;

  // tenantId từ entry đầu tiên (1 player = 1 tenant)
  const tenantId = entries?.[0]?.tenantId ?? "";
  const drawId = entries?.[0]?.drawId ?? financialDate;

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
          <p className="text-sm text-muted-foreground">Không có entry nào cho ngày này.</p>
        </CardContent>
      </Card>
    );
  }

  const rows = entries.map(toEntryRow);

  return (
    <GamePlayerEntryList
      drawId={`${gameLabel} · ${financialDate}`}
      tenantId={tenantId}
      accountId={accountId}
      rows={rows}
      renderDetailDialog={(selectedEntryId, onClose) => {
        // Lấy game từ entry đầu (tất cả entries cùng game)
        const selectedEntry = selectedEntryId
          ? entries.find((e) => e.entryId === selectedEntryId)
          : null;

        return (
          <PlayerEntryDetailLoader
            accountId={accountId}
            entryId={selectedEntryId}
            game={game}
            drawId={drawId}
            open={!!selectedEntryId && !!selectedEntry}
            onClose={onClose}
          />
        );
      }}
    />
  );
}

// ─── Detail Dialog Loader ─────────────────────────────────────────────────────

/**
 * Fetch full entry doc và truyền vào GameEntryDetailDialog.
 * Tách ra component riêng để tránh gọi hook ở trong render prop.
 */
function PlayerEntryDetailLoader({
  accountId,
  entryId,
  game,
  drawId: _drawId,
  open,
  onClose,
}: {
  accountId: string;
  entryId: string | null;
  game: string;
  drawId: string;
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
