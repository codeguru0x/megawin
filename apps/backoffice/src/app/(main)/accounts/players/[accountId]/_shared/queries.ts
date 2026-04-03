"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import type { PlayerOverviewResult } from "@megawin/game-core-application/repos";

import { playerDetailKeys } from "@/lib/query-keys/player-detail";

// ─── Response types ───────────────────────────────────────────────────────────

export interface PlayerProfileResponse {
  accountId: string;
  username: string;
  displayName: string;
  status: string;
  roles: string[];
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Lấy thông tin identity của 1 player.
 * Dùng cho Profile Card trong trang Player Detail.
 */
export function usePlayerProfile(accountId: string) {
  return useQuery({
    queryKey: playerDetailKeys.profile(accountId),
    queryFn: () => apiClient.get<PlayerProfileResponse>(`/accounts/players/${accountId}`),
    enabled: !!accountId,
  });
}

/**
 * KPIs + game breakdown của player trong date range.
 * Dùng cho tab "Tổng quan" — KPI strip + game breakdown table.
 */
export function usePlayerOverview(accountId: string, from: string, to: string) {
  return useQuery({
    queryKey: playerDetailKeys.overview(accountId, { from, to }),
    queryFn: () =>
      apiClient.get<{ data: PlayerOverviewResult }>(
        `/accounts/players/${accountId}/overview?from=${from}&to=${to}`,
      ),
    enabled: !!accountId && !!from && !!to,
    select: (res) => res.data,
  });
}

/**
 * Chi tiết ngày × game của player trong date range.
 * Dùng cho tab "Tài chính" — bảng daily records.
 */
export function usePlayerFinancials(accountId: string, from: string, to: string, game?: string) {
  const gameParam = game && game !== "all" ? `&game=${game}` : "";
  return useQuery({
    queryKey: playerDetailKeys.financials(accountId, { from, to, game }),
    queryFn: () =>
      apiClient.get<{ data: PlayerFinancialRecord[] }>(
        `/accounts/players/${accountId}/financials?from=${from}&to=${to}${gameParam}`,
      ),
    enabled: !!accountId && !!from && !!to,
    select: (res) => res.data,
  });
}

/** Một row trong bảng tài chính chi tiết ngày × game. */
export interface PlayerFinancialRecord {
  financialDate: string;
  gameProduct: string;
  drawCount: number;
  entryCount: number;
  settledCount: number;
  winCount: number;
  lossCount: number;
  voidCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}

// ─── Outstanding types ───────────────────────────────────────────────────────

/** Một entry outstanding đang chờ kết quả. */
export interface PlayerOutstandingEntryResponse {
  gameProduct: string;
  /** Entry ID (ObjectId hex string) — dùng để fetch full doc cho EntryDetailDialog. */
  entryId: string;
  /** Ticket ID liên kết. */
  ticketId: string;
  /** Ticket number hiển thị (vd: "6/45-2026-0000123"). */
  ticketNo: string;
  /** Tenant ID — 1 player chỉ thuộc 1 tenant duy nhất. */
  tenantId: string;
  drawId: string;
  financialDate: string;
  amount: number;
  commissionAmount: number;
  /** Số boards trong vé. Undefined khi data cũ chưa có field này. */
  boardCount?: number;
  /** Số lines (games có lines). Undefined khi game không có lines (keno, bingo18). */
  lineCount?: number;
  /** Số đơn vị cược. Undefined khi data cũ chưa có field này. */
  betUnitCount?: number;
  createdAt: string;
}

/** Summary + danh sách entries outstanding. */
export interface PlayerOutstandingSummaryResponse {
  totalEntryCount: number;
  totalStake: number;
  totalCommission: number;
  activeGameCount: number;
  entries: PlayerOutstandingEntryResponse[];
}

// ─── Outstanding hook ────────────────────────────────────────────────────────

/**
 * Đơn cược đang chờ của 1 player — on-demand, cross-game.
 *
 * staleTime = 0: dữ liệu outstanding thay đổi liên tục (entries settle/void bất cứ lúc nào).
 * refetchOnWindowFocus: tự động refresh khi operator quay lại tab.
 */
export function usePlayerOutstanding(accountId: string) {
  return useQuery({
    queryKey: playerDetailKeys.outstanding(accountId),
    queryFn: () =>
      apiClient.get<{ data: PlayerOutstandingSummaryResponse }>(
        `/accounts/players/${accountId}/outstanding`,
      ),
    enabled: !!accountId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    select: (res) => res.data,
  });
}

// ─── Entry drill hooks ────────────────────────────────────────────────────────

/** Một row trong bảng entries settled/voided (drill tab Tài chính). */
export interface PlayerSettledEntryResponse {
  entryId: string;
  ticketId: string;
  ticketNo: string;
  drawId: string;
  tenantId: string;
  status: string;
  outcome: string | null;
  amount: number;
  /** Số boards trong vé. Undefined khi data cũ chưa có field này. */
  boardCount?: number;
  /** Số lines (games có lines) hoặc selections (keno/bingo18). */
  lineCount: number;
  /** Số đơn vị cược. Undefined khi data cũ chưa có field này. */
  betUnitCount?: number;
  commissionAmount: number;
  winAmount: number;
  payoutAmount: number;
  createdAt: string;
  settledAt: string | null;
}

/**
 * Danh sách entries settled/voided của 1 player trong 1 ngày × 1 game.
 * Drill cấp 2/4 từ bảng tài chính. Optional drawId filter cho View 4.
 */
export function usePlayerEntries(
  accountId: string,
  financialDate: string,
  game: string,
  drawId?: string,
) {
  const drawParam = drawId ? `&drawId=${drawId}` : "";
  return useQuery({
    queryKey: playerDetailKeys.entries(accountId, { financialDate, game, drawId }),
    queryFn: () =>
      apiClient.get<{ data: PlayerSettledEntryResponse[] }>(
        `/accounts/players/${accountId}/entries?financialDate=${financialDate}&game=${game}${drawParam}`,
      ),
    enabled: !!accountId && !!financialDate && !!game,
    select: (res) => res.data,
  });
}

/**
 * Full entry doc để hiển thị EntryDetailDialog.
 *
 * Dùng chung cho cả outstanding (scheduled) lẫn settled/voided entries.
 * Outstanding: data không có payout/result/outcome.
 * Settled: data có payout (nếu win), result, outcome.
 * Voided: data có voidInfo.
 */
export function usePlayerEntryDetail(accountId: string, entryId: string, game: string) {
  return useQuery({
    queryKey: playerDetailKeys.entryDetail(accountId, entryId, game),
    queryFn: () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiClient.get<{ data: any }>(
        `/accounts/players/${accountId}/entries/${entryId}?game=${game}`,
      ),
    enabled: !!accountId && !!entryId && !!game,
    select: (res) => res.data,
  });
}

// ─── Draw breakdown types + hook ──────────────────────────────────────────────

/** Breakdown 1 kỳ quay (drawId) của player trong 1 ngày × 1 game (View 3). */
export interface PlayerDrawBreakdownResponse {
  drawId: string;
  entryCount: number;
  totalStake: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}

/**
 * Breakdown theo kỳ quay trong 1 ngày × 1 game.
 * View 3 Player Detail → Tài chính drill-down.
 */
export function usePlayerDrawBreakdown(accountId: string, financialDate: string, game: string) {
  return useQuery({
    queryKey: playerDetailKeys.drawBreakdown(accountId, { financialDate, game }),
    queryFn: () =>
      apiClient.get<{ data: PlayerDrawBreakdownResponse[] }>(
        `/accounts/players/${accountId}/draws?financialDate=${financialDate}&game=${game}`,
      ),
    enabled: !!accountId && !!financialDate && !!game,
    select: (res) => res.data,
  });
}
