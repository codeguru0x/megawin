"use client";

import { useState } from "react";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { toTenantUsername } from "@megawin/shared/utils/player-username";
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import { KenoEntryDetailDialog } from "../../settle/_lib/sections/entry-detail-dialog";
import { OutstandingContent } from "@/components/reports/game/outstanding";
import type {
  OutstandingDrawRow,
  OutstandingTenantRow,
  OutstandingPlayerRow,
  OutstandingEntryRow,
} from "@/components/reports/game/outstanding";
import {
  useKenoOutstanding,
  useKenoOutstandingDrawTenants,
  useKenoOutstandingTenantPlayers,
  useKenoOutstandingPlayerEntries,
} from "../../settle/_lib/use-report-queries";
import { useKenoOutstandingFilters } from "./use-outstanding-filters";

const c = GAME_COLORS[GameProduct.Keno];

/** Map OutstandingDrawReport entity → shared OutstandingDrawRow. Keno không có lineCount. */
function mapDrawRow(r: {
  drawId: string;
  financialDate: string;
  playerCount: number;
  tenantCount: number;
  entryCount: number;
  lineCount?: number | null;
  estimatedCommission: number;
  totalStake: number;
}): OutstandingDrawRow {
  return {
    drawId: r.drawId,
    financialDate: r.financialDate,
    playerCount: r.playerCount,
    tenantCount: r.tenantCount,
    entryCount: r.entryCount,
    // Keno không có line — bỏ qua lineCount để shared component ẩn cột
    lineCount: undefined,
    estimatedCommission: r.estimatedCommission,
    totalStake: r.totalStake,
  };
}

/** Map OutstandingTenantBreakdownRow → shared OutstandingTenantRow. */
function mapTenantRow(r: {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  lineCount?: number | null;
  estimatedCommission: number;
  totalStake: number;
}): OutstandingTenantRow {
  return {
    tenantId: r.tenantId,
    playerCount: r.playerCount,
    entryCount: r.entryCount,
    lineCount: undefined,
    estimatedCommission: r.estimatedCommission,
    totalStake: r.totalStake,
  };
}

/** Map OutstandingPlayerBreakdownRow → shared OutstandingPlayerRow (áp dụng toTenantUsername). */
function mapPlayerRow(r: {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount?: number | null;
  totalStake: number;
  commissionAmount: number;
}): OutstandingPlayerRow {
  return {
    accountId: r.accountId,
    // Bỏ phần @tenantId suffix — hiển thị tên tài khoản sạch
    displayName: toTenantUsername(r.username || r.accountId),
    entryCount: r.entryCount,
    lineCount: undefined,
    totalStake: r.totalStake,
    commissionAmount: r.commissionAmount,
  };
}

/** Map entry entity → shared OutstandingEntryRow. Keno không có lineCount. */
function mapEntryRow(entry: {
  id: string;
  entrySummary?: { ticketNo?: string | null; boards?: unknown[] | null } | null;
  createdAt: string | Date;
  betUnitCount?: number;
  tenant?: { commissionAmount?: number } | null;
  amount: number;
}): OutstandingEntryRow {
  return {
    id: entry.id,
    ticketNo: entry.entrySummary?.ticketNo,
    createdAt: entry.createdAt,
    boardCount: entry.entrySummary?.boards?.length,
    betUnitCount: entry.betUnitCount,
    lineCount: undefined,
    commissionAmount: entry.tenant?.commissionAmount ?? 0,
    totalStake: entry.amount,
  };
}

/**
 * Wrapper cho Keno Outstanding — kết nối game-specific hooks vào shared OutstandingContent.
 *
 * showLineCount=false vì Keno không có "bộ số" — chỉ có entries theo boards.
 * toTenantUsername áp dụng tại mapPlayerRow: bỏ suffix @local / @tenantId.
 */
export function KenoOutstandingContent() {
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
  } = useKenoOutstandingFilters();

  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);

  // Level 1 — draws outstanding
  const drawsQuery = useKenoOutstanding();

  // Level 2 — tenant breakdown cho draw đang drill
  const tenantQuery = useKenoOutstandingDrawTenants(drawId);

  // Level 3 — player breakdown cho draw × tenant đang drill
  const playerQuery = useKenoOutstandingTenantPlayers(drawId ?? "", tenantId);

  // Level 4 — entries của player đang drill
  const entryQuery = useKenoOutstandingPlayerEntries(drawId ?? "", tenantId ?? "", playerId);

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
        gameName="Keno"
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
        showLineCount={false}
      />
      <KenoEntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
