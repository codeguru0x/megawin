"use client";

import { useState } from "react";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { toTenantUsername } from "@megawin/shared/utils/player-username";
import type { TicketEntryEntity } from "@megawin/game-lotto535/entities";
import { Lotto535EntryDetailDialog } from "../../settle/_lib/sections/entry-detail-dialog";
import { VoidContent } from "@/components/reports/game/void";
import type {
  VoidDrawRow,
  VoidTenantRow,
  VoidPlayerRow,
  VoidEntryRow,
} from "@/components/reports/game/void";
import {
  useLotto535VoidReports,
  useLotto535VoidDrawTenants,
  useLotto535VoidTenantPlayers,
  useLotto535VoidPlayerEntries,
} from "../../settle/_lib/use-report-queries";
import { useLotto535VoidFilters } from "./use-void-filters";

const c = GAME_COLORS[GameProduct.Lotto535];

/** Map VoidDrawReport entity → shared VoidDrawRow. */
function mapDrawRow(r: {
  drawId: string;
  financialDate: string;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  totalOriginalStake: number;
  totalRefundAmount: number;
}): VoidDrawRow {
  return {
    drawId: r.drawId,
    financialDate: r.financialDate,
    entryCount: r.entryCount,
    playerCount: r.playerCount,
    tenantCount: r.tenantCount,
    totalOriginalStake: r.totalOriginalStake,
    totalRefundAmount: r.totalRefundAmount,
  };
}

/** Map VoidTenantBreakdownRow (API trả về) → shared VoidTenantRow. */
function mapTenantRow(r: {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  totalOriginalStake: number;
  totalRefundAmount: number;
}): VoidTenantRow {
  return {
    tenantId: r.tenantId,
    playerCount: r.playerCount,
    entryCount: r.entryCount,
    totalOriginalStake: r.totalOriginalStake,
    totalRefundAmount: r.totalRefundAmount,
  };
}

/** Map VoidPlayerBreakdownRow (API trả về) → shared VoidPlayerRow (áp dụng toTenantUsername). */
function mapPlayerRow(r: {
  accountId: string;
  username: string;
  entryCount: number;
  totalOriginalStake: number;
  totalRefundAmount: number;
}): VoidPlayerRow {
  return {
    accountId: r.accountId,
    displayName: toTenantUsername(r.username || r.accountId),
    entryCount: r.entryCount,
    totalOriginalStake: r.totalOriginalStake,
    totalRefundAmount: r.totalRefundAmount,
  };
}

/** Map TicketEntryEntity → shared VoidEntryRow. */
function mapEntryRow(entry: TicketEntryEntity): VoidEntryRow {
  return {
    id: entry.id,
    ticketNo: entry.entrySummary?.ticketNo,
    createdAt: entry.createdAt,
    boardCount: entry.entrySummary?.boards?.length,
    lineCount: entry.lineCount ?? undefined,
    originalAmount: entry.amount,
    refundAmount: entry.voidInfo?.refundAmount ?? entry.amount,
  };
}

/**
 * Wrapper cho Lotto 5/35 Void Reports — kết nối game-specific hooks vào shared VoidContent.
 *
 * toTenantUsername áp dụng tại mapPlayerRow: bỏ suffix @local / @tenantId.
 */
export function Lotto535VoidReportsContent() {
  const {
    from,
    to,
    onDateChange,
    drawId,
    tenantId,
    playerId,
    playerName,
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenant,
    navigateToPlayer,
  } = useLotto535VoidFilters();

  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);

  // Level 1 — draws void
  const drawsQuery = useLotto535VoidReports(from, to);

  // Level 2 — tenant breakdown cho draw void
  const tenantQuery = useLotto535VoidDrawTenants(drawId);

  // Level 3 — player breakdown cho draw × tenant void
  const playerQuery = useLotto535VoidTenantPlayers(drawId ?? "", tenantId);

  // Level 4 — entries void của player
  const entryQuery = useLotto535VoidPlayerEntries(drawId ?? "", tenantId ?? "", playerId);

  // Map data sang shared types
  const mappedDraws = (drawsQuery.data ?? []).map(mapDrawRow);
  const mappedTenants = (tenantQuery.data ?? []).map(mapTenantRow);
  const mappedPlayers = (playerQuery.data ?? []).map(mapPlayerRow);
  const mappedEntries = (entryQuery.data ?? []).map(mapEntryRow);

  // Tìm lại entry entity gốc để truyền vào dialog
  const entryEntityMap = new Map((entryQuery.data ?? []).map((e) => [e.id, e]));

  return (
    <>
      <VoidContent
        gameName="Lotto 5/35"
        iconGradient={c.iconGradient}
        from={from}
        to={to}
        onDateChange={onDateChange}
        drawId={drawId}
        tenantId={tenantId}
        playerId={playerId}
        playerName={playerName}
        level={level}
        navigation={{
          navigateToList,
          navigateToDraw,
          navigateToTenant,
          navigateToPlayer,
        }}
        drawsData={{
          data: mappedDraws,
          isLoading: drawsQuery.isLoading,
          error: drawsQuery.error,
          refetch: drawsQuery.refetch,
        }}
        tenantData={{
          data: mappedTenants,
          isLoading: tenantQuery.isLoading,
          error: tenantQuery.error,
          refetch: tenantQuery.refetch,
        }}
        playerData={{
          data: mappedPlayers,
          isLoading: playerQuery.isLoading,
          error: playerQuery.error,
          refetch: playerQuery.refetch,
        }}
        entryData={{
          data: mappedEntries,
          isLoading: entryQuery.isLoading,
          error: entryQuery.error,
          refetch: entryQuery.refetch,
        }}
        onEntryClick={(row) => {
          const entity = entryEntityMap.get(row.id);
          if (entity) setSelectedEntry(entity);
        }}
        showLineCount={true}
        lineCountLabel="Bộ số"
      />

      <Lotto535EntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
