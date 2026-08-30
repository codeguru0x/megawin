"use client";

/**
 * Bingo 18 — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) cho filter + page,
 * fetch data, inject render props vào DrawHistoryTable chung.
 *
 * Bingo 18 ~158 kỳ/ngày — mặc định filter hôm nay.
 * Bingo 18 không có Jackpot: companyTake = profit.
 * Kết quả: 3 xúc xắc (1-6) dùng DiceDisplay.
 */

import { useRouter } from "next/navigation";

import type { DrawStatus } from "@megawin/game-core/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import type { CommonDrawSummary } from "@/components/draws";
import { DrawHistoryTable } from "@/components/draws";
import { DiceDisplay } from "@/components/games/bingo18/dice-display";
import { Bingo18DrawStatusBadge } from "@/components/games/bingo18/draw-status-badge";

import type { Bingo18DrawSummary } from "./use-draws";
import { useBingo18DrawsList } from "./use-draws";

const OPS_BASE = "/games/bingo18/operations";

function defaultFrom(): string {
  return formatVNDate(subDays(new Date(), 6));
}

function defaultTo(): string {
  return todayVN();
}

function toCommon(draw: Bingo18DrawSummary): Bingo18DrawSummary & CommonDrawSummary {
  return {
    ...draw,
    financialDate: draw.financialDate ?? draw.drawDate,
    closeAt: draw.closeAt ?? draw.drawTime,
    totalEntries: draw.ticketEntryCount,
    totalPayout: draw.totalPayout,
    totalAgentCommission: draw.financial?.totalAgentCommission,
  };
}

export function Bingo18DrawHistorySection() {
  const router = useRouter();

  const [statusParam, setStatusParam] = useQueryState("histStatus", parseAsString.withDefault("all"));
  const [fromDate, setFromDate] = useQueryState("histFrom", parseAsString.withDefault(defaultFrom()));
  const [toDate, setToDate] = useQueryState("histTo", parseAsString.withDefault(defaultTo()));
  const [page, setPage] = useQueryState("histPage", parseAsInteger.withDefault(1).withOptions({ history: "push" }));

  const statusFilter = statusParam !== "all" ? (statusParam as DrawStatus) : undefined;

  const { data, isLoading, isFetching } = useBingo18DrawsList({
    size: Pagination.Default.Size,
    status: statusFilter,
    fromDate,
    toDate,
    page,
  });

  const rawDraws = data?.draws ?? [];
  const draws = rawDraws.map(toCommon);
  const hasMore = rawDraws.length === (data?.size ?? Pagination.Default.Size);

  function handleDateChange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
    setPage(null);
  }

  function handleStatusChange(value: string) {
    setStatusParam(value === "all" ? null : value);
    setPage(null);
  }

  return (
    <DrawHistoryTable
      draws={draws}
      isLoading={isLoading}
      isFetching={isFetching}
      page={page}
      hasMore={hasMore}
      fromDate={fromDate}
      toDate={toDate}
      statusValue={statusParam}
      onDateChange={handleDateChange}
      onStatusChange={handleStatusChange}
      onPageNext={() => setPage(page + 1)}
      onPagePrev={() => page > 1 && setPage(page - 1)}
      onRowClick={(draw) => router.push(`${OPS_BASE}?drawId=${draw.drawId}`)}
      renderStatusBadge={(status) => <Bingo18DrawStatusBadge status={status as DrawStatus} />}
      renderResult={(draw) => {
        const result = draw.result as { diceNumbers?: number[] } | undefined;
        if (!result?.diceNumbers?.length) return null;
        return <DiceDisplay numbers={result.diceNumbers} size="sm" showSum />;
      }}
    />
  );
}
