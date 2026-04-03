"use client";

import { useState } from "react";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { toTenantUsername } from "@megawin/shared/utils/player-username";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { Mega645EntryDetailDialog } from "../../settle/_lib/sections/entry-detail-dialog";
import { VoidContent } from "@/components/reports/game/void";
import type {
  VoidDrawRow,
  VoidTenantRow,
  VoidPlayerRow,
  VoidEntryRow,
} from "@/components/reports/game/void";
import {
  useMega645VoidReports,
  useMega645VoidDrawTenants,
  useMega645VoidTenantPlayers,
  useMega645VoidPlayerEntries,
} from "../../settle/_lib/use-report-queries";
import { useMega645VoidFilters } from "./use-void-filters";

const c = GAME_COLORS[GameProduct.Mega645];

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
    refundStatus: entry.voidInfo?.refundStatus,
  };
}

/**
 * Wrapper cho Mega 6/45 Void Reports — kết nối game-specific hooks vào shared VoidContent.
 *
 * toTenantUsername áp dụng tại mapPlayerRow: bỏ suffix @local / @tenantId.
 */
export function Mega645VoidReportsContent() {
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
  } = useMega645VoidFilters();

  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);

  const drawsQuery = useMega645VoidReports(from, to);
  const tenantQuery = useMega645VoidDrawTenants(drawId);
  const playerQuery = useMega645VoidTenantPlayers(drawId ?? "", tenantId);
  const entryQuery = useMega645VoidPlayerEntries(drawId ?? "", tenantId ?? "", playerId);

  const mappedDraws = (drawsQuery.data ?? []).map(mapDrawRow);
  const mappedTenants = (tenantQuery.data ?? []).map(mapTenantRow);
  const mappedPlayers = (playerQuery.data ?? []).map(mapPlayerRow);
  const mappedEntries = (entryQuery.data ?? []).map(mapEntryRow);

  const entryEntityMap = new Map((entryQuery.data ?? []).map((e) => [e.id, e]));

  return (
    <>
      <VoidContent
        gameName="Mega 6/45"
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

      <Mega645EntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
