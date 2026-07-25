"use client";

/**
 * Max 3D Pro — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) cho filter + page,
 * fetch data, inject render props vào DrawHistoryTable chung.
 *
 * Max 3D Pro không có Jackpot: companyTake = profit thực.
 * Kết quả 20 bộ ba số — hiển thị compact dưới dạng TripletDisplay.
 */

import { useRouter } from "next/navigation";

import type { DrawStatus } from "@megawin/game-core/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import type { CommonDrawSummary } from "@/components/draws";
import { DrawHistoryTable } from "@/components/draws";
import { DrawStatusBadge } from "@/components/games/max3dpro/draw-status-badge";
import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";

import type { DrawSummary } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/max3dpro/operations";

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
      onRowClick={(draw) => router.push(`${OPS_BASE}?draw=${draw.drawId}`)}
      renderStatusBadge={(status) => <DrawStatusBadge status={status as DrawStatus} />}
      renderResult={(draw) => {
        // Max3D Pro: 20 bộ ba số chia 4 hạng — hiển thị compact per tier
        if (!draw.result) return null;
        const { special, first, second, third } = draw.result as {
          special: string[];
          first: string[];
          second: string[];
          third: string[];
        };
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap gap-0.5">
              {special?.map((v, i) => (
                <TripletDisplay key={`s${i}`} value={v} variant="special" size="sm" />
              ))}
            </div>
            <div className="flex flex-wrap gap-0.5">
              {first?.map((v, i) => (
                <TripletDisplay key={`f${i}`} value={v} variant="first" size="sm" />
              ))}
            </div>
            <div className="flex flex-wrap gap-0.5">
              {second?.map((v, i) => (
                <TripletDisplay key={`sc${i}`} value={v} variant="second" size="sm" />
              ))}
            </div>
            <div className="flex flex-wrap gap-0.5">
              {third?.map((v, i) => (
                <TripletDisplay key={`t${i}`} value={v} variant="third" size="sm" />
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}
