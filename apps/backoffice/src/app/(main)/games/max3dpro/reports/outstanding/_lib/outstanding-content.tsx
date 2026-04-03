"use client";

import { useState } from "react";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { toTenantUsername } from "@megawin/shared/utils/player-username";
import type { TicketEntryEntity } from "@megawin/game-max3dpro/entities";
import { Max3dproEntryDetailDialog } from "../../settle/_lib/sections/entry-detail-dialog";
import { OutstandingContent } from "@/components/reports/game/outstanding";
import type {
  OutstandingDrawRow,
  OutstandingTenantRow,
  OutstandingPlayerRow,
  OutstandingEntryRow,
} from "@/components/reports/game/outstanding";
import {
  useMax3DProOutstanding,
  useMax3DProOutstandingDrawTenants,
  useMax3DProOutstandingTenantPlayers,
  useMax3DProOutstandingPlayerEntries,
} from "../../settle/_lib/use-report-queries";
import { useMax3DProOutstandingFilters } from "./use-outstanding-filters";

const c = GAME_COLORS[GameProduct.Max3dpro];

/** Map OutstandingDrawReport entity → shared OutstandingDrawRow. */
function mapDrawRow(r: {
  drawId: string;
  financialDate: string;
  playerCount: number;
  tenantCount: number;
  entryCount: number;
  lineCount: number;
  estimatedCommission: number;
  totalStake: number;
}): OutstandingDrawRow {
  return {
    drawId: r.drawId,
    financialDate: r.financialDate,
    playerCount: r.playerCount,
    tenantCount: r.tenantCount,
    entryCount: r.entryCount,
    lineCount: r.lineCount,
    estimatedCommission: r.estimatedCommission,
    totalStake: r.totalStake,
  };
}

/** Map OutstandingTenantBreakdownRow → shared OutstandingTenantRow. */
function mapTenantRow(r: {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  lineCount: number;
  estimatedCommission: number;
  totalStake: number;
}): OutstandingTenantRow {
  return {
    tenantId: r.tenantId,
    playerCount: r.playerCount,
    entryCount: r.entryCount,
    lineCount: r.lineCount,
    estimatedCommission: r.estimatedCommission,
    totalStake: r.totalStake,
  };
}

/** Map OutstandingPlayerBreakdownRow → shared OutstandingPlayerRow (áp dụng toTenantUsername). */
function mapPlayerRow(r: {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  totalStake: number;
  commissionAmount: number;
}): OutstandingPlayerRow {
  return {
    accountId: r.accountId,
    // Bỏ phần @tenantId suffix — hiển thị tên tài khoản sạch
    displayName: toTenantUsername(r.username || r.accountId),
    entryCount: r.entryCount,
    lineCount: r.lineCount,
    totalStake: r.totalStake,
    commissionAmount: r.commissionAmount,
  };
}

/** Map entry entity → shared OutstandingEntryRow. Max 3D Pro dùng lineCount cho số cặp số. */
function mapEntryRow(entry: {
  id: string;
  entrySummary?: { ticketNo?: string | null; boards?: unknown[] | null } | null;
  createdAt: string | Date;
  lineCount?: number | null;
  betUnitCount?: number;
  tenant?: { commissionAmount?: number } | null;
  amount: number;
}): OutstandingEntryRow {
  return {
    id: entry.id,
    ticketNo: entry.entrySummary?.ticketNo,
    createdAt: entry.createdAt,
    boardCount: entry.entrySummary?.boards?.length,
    lineCount: entry.lineCount ?? undefined,
    betUnitCount: entry.betUnitCount,
    commissionAmount: entry.tenant?.commissionAmount ?? 0,
    totalStake: entry.amount,
  };
}

/**
 * Wrapper cho Max 3D Pro Outstanding — kết nối game-specific hooks vào shared OutstandingContent.
 *
 * showLineCount=true vì Max 3D Pro có "cặp số" (lineCount = số ordered pairs TripletPair).
 * toTenantUsername áp dụng tại mapPlayerRow: bỏ suffix @local / @tenantId.
 */
export function Max3DProOutstandingContent() {
  const {
    drawId,
    tenantId,
    playerId,
    playerName,
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenant,
    navigateToPlayer,
  } = useMax3DProOutstandingFilters();

  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);

  // Level 1 — draws outstanding
  const drawsQuery = useMax3DProOutstanding();

  // Level 2 — tenant breakdown cho draw đang drill
  const tenantQuery = useMax3DProOutstandingDrawTenants(drawId);

  // Level 3 — player breakdown cho draw × tenant đang drill
  const playerQuery = useMax3DProOutstandingTenantPlayers(drawId ?? "", tenantId);

  // Level 4 — entries của player đang drill
  const entryQuery = useMax3DProOutstandingPlayerEntries(drawId ?? "", tenantId ?? "", playerId);

  // Map data sang shared types
  const mappedDraws = (drawsQuery.data ?? []).map(mapDrawRow);
  const mappedTenants = (tenantQuery.data ?? []).map(mapTenantRow);
  const mappedPlayers = (playerQuery.data ?? []).map(mapPlayerRow);
  const mappedEntries = (entryQuery.data ?? []).map(mapEntryRow);

  // Lookup map: row.id → entity gốc để truyền vào dialog
  const entryEntityMap = new Map((entryQuery.data ?? []).map((e) => [e.id, e]));

  return (
    <>
      <OutstandingContent
        gameName="Max 3D Pro"
        iconGradient={c.iconGradient}
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
      <Max3dproEntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
