"use client";

/**
 * Mega 6/45 — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) cho filter + page number,
 * fetch data, inject render props (kết quả 6 số, draw status badge)
 * vào DrawHistoryTable chung.
 */

import { useRouter } from "next/navigation";

import type { DrawStatus } from "@megawin/game-core/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import type { CommonDrawSummary } from "@/components/draws";
import { DrawHistoryTable } from "@/components/draws";
import { DrawStatusBadge } from "@/components/games/mega645/draw-status-badge";
import { MegaNumberBall } from "@/components/games/mega645/mega-number-ball";

import type { DrawSummary } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/mega645/operations";

function defaultFrom(): string {
  return formatVNDate(subDays(new Date(), 6));
}

function defaultTo(): string {
  return todayVN();
}

function toCommon(draw: DrawSummary): DrawSummary & CommonDrawSummary {
  return {
    ...draw,
    financialDate: draw.financialDate ?? draw.drawDate,
    closeAt: draw.closeAt ?? draw.drawTime,
    totalEntries: draw.ticketEntryCount,
    totalPayout: draw.totalPayout,
    // mega645 có actualCompanyTake riêng; dùng làm totalAgentCommission không đúng —
    // map đúng trường: hoa hồng đại lý
    totalAgentCommission: draw.financial?.totalAgentCommission,
  };
}

export function DrawHistorySection() {
  const router = useRouter();

  const [statusParam, setStatusParam] = useQueryState("histStatus", parseAsString.withDefault("all"));
  const [fromDate, setFromDate] = useQueryState("histFrom", parseAsString.withDefault(defaultFrom()));
  const [toDate, setToDate] = useQueryState("histTo", parseAsString.withDefault(defaultTo()));
  const [page, setPage] = useQueryState("histPage", parseAsInteger.withDefault(1).withOptions({ history: "push" }));

  const statusFilter = statusParam !== "all" ? (statusParam as DrawStatus) : undefined;

  const { data, isLoading, isFetching } = useDrawsList({
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
      renderStatusBadge={(status) => <DrawStatusBadge status={status as DrawStatus} />}
      renderResult={(draw) => {
        if (!draw.result) return null;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {draw.result.winningNumbers.map((n) => (
              <MegaNumberBall key={n} number={Number(n)} size="sm" />
            ))}
          </div>
        );
      }}
    />
  );
}
