"use client";

import { useState } from "react";

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import { toTenantUsername } from "@megawin/shared/utils/player-username";

import type { VoidDrawRow, VoidEntryRow, VoidPlayerRow, VoidTenantRow } from "@/components/reports/game/void";
import { VoidContent } from "@/components/reports/game/void";
import { GAME_COLORS } from "@/lib/game-colors";

import { Power655EntryDetailDialog } from "../../settle/_lib/sections/entry-detail-dialog";
import {
  usePower655VoidDrawTenants,
  usePower655VoidPlayerEntries,
  usePower655VoidReports,
  usePower655VoidTenantPlayers,
} from "../../settle/_lib/use-report-queries";
import { usePower655VoidFilters } from "./use-void-filters";

const c = GAME_COLORS[GameProduct.Power655];

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
 * Wrapper cho Power 6/55 Void Reports — kết nối game-specific hooks vào shared VoidContent.
 *
 * toTenantUsername áp dụng tại mapPlayerRow: bỏ suffix @local / @tenantId.
 */
export function Power655VoidReportsContent() {
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
  } = usePower655VoidFilters();

  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);

  const drawsQuery = usePower655VoidReports(from, to);
  const tenantQuery = usePower655VoidDrawTenants(drawId);
  const playerQuery = usePower655VoidTenantPlayers(drawId ?? "", tenantId);
  const entryQuery = usePower655VoidPlayerEntries(drawId ?? "", tenantId ?? "", playerId);

  const mappedDraws = (drawsQuery.data ?? []).map(mapDrawRow);
  const mappedTenants = (tenantQuery.data ?? []).map(mapTenantRow);
  const mappedPlayers = (playerQuery.data ?? []).map(mapPlayerRow);
  const mappedEntries = (entryQuery.data ?? []).map(mapEntryRow);

  const entryEntityMap = new Map((entryQuery.data ?? []).map((e) => [e.id, e]));

  return (
    <>
      <VoidContent
        gameName="Power 6/55"
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

      <Power655EntryDetailDialog entry={selectedEntry} open={!!selectedEntry} onClose={() => setSelectedEntry(null)} />
    </>
  );
}
