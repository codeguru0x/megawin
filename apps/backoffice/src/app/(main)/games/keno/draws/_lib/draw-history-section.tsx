"use client";

/**
 * Keno — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) cho filter + page,
 * fetch data, inject render props vào DrawHistoryTable chung.
 *
 * Keno ~120 kỳ/ngày — mặc định filter 1 ngày gần nhất thay vì 7 ngày.
 * Keno không có Jackpot: companyTake = profit.
 * Kết quả: 20 số (01-80) dùng KenoNumberBall.
 */

import { useRouter } from "next/navigation";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";

import { KenoNumberBall } from "@/components/games/keno/keno-number-ball";
import { KenoDrawStatusBadge } from "@/components/games/keno/draw-status-badge";
import { DrawHistoryTable } from "@/components/draws";
import type { CommonDrawSummary } from "@/components/draws";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants";
import type { DrawStatus } from "@megawin/game-core/entities";

import type { DrawSummary } from "./use-draws";
import { useKenoDrawsList } from "./use-draws";

const OPS_BASE = "/games/keno/operations";

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
    // Keno: financial dùng totalPrizes; map vào totalPayout nếu chưa có từ stats
    totalAgentCommission: draw.financial?.totalAgentCommission,
  };
}

export function DrawHistorySection() {
  const router = useRouter();

  const [statusParam, setStatusParam] = useQueryState(
    "histStatus",
    parseAsString.withDefault("all"),
  );
  const [fromDate, setFromDate] = useQueryState(
    "histFrom",
    parseAsString.withDefault(defaultFrom()),
  );
  const [toDate, setToDate] = useQueryState("histTo", parseAsString.withDefault(defaultTo()));
  const [page, setPage] = useQueryState(
    "histPage",
    parseAsInteger.withDefault(1).withOptions({ history: "push" }),
  );

  const statusFilter = statusParam !== "all" ? (statusParam as DrawStatus) : undefined;

  const { data, isLoading, isFetching } = useKenoDrawsList({
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
      renderStatusBadge={(status) => <KenoDrawStatusBadge status={status as DrawStatus} />}
      renderResult={(draw) => {
        const result = draw.result as { winningNumbers?: string[] } | undefined;
        if (!result?.winningNumbers?.length) return null;
        return (
          <div className="flex flex-wrap items-center gap-0.5">
            {[...result.winningNumbers]
              .sort((a, b) => Number(a) - Number(b))
              .map((n) => (
                <KenoNumberBall key={n} number={Number(n)} size="sm" />
              ))}
          </div>
        );
      }}
    />
  );
}
