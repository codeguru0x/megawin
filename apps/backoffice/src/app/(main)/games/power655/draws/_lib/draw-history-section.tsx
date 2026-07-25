"use client";

/**
 * Power 6/55 — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) + fetch data + inject
 * render props game-cụ thể (kết quả 6+1, draw status badge) vào DrawHistoryTable.
 */

import { useRouter } from "next/navigation";

import type { DrawStatus } from "@megawin/game-core/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";

import type { CommonDrawSummary } from "@/components/draws";
import { DrawHistoryTable } from "@/components/draws";
import { Power655DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import { PowerNumberBall } from "@/components/games/power655/power-number-ball";

import type { DrawSummary } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/power655/operations";

// ─── Default range helpers ────────────────────────────────────────────────────

function defaultFrom(): string {
  return formatVNDate(subDays(new Date(), 6));
}

function defaultTo(): string {
  return todayVN();
}

// ─── Adapter — DrawSummary → CommonDrawSummary ────────────────────────────────

/**
 * Map Power 6/55 DrawSummary sang CommonDrawSummary.
 * Giữ nguyên reference khi dùng render props (T = DrawSummary)
 * để có thể truy cập `.result` (6 số + bonus) trong renderResult.
 */
function toCommon(draw: DrawSummary): DrawSummary & CommonDrawSummary {
  return {
    ...draw,
    totalAgentCommission: draw.financial?.totalAgentCommission,
  };
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function DrawHistorySection() {
  const router = useRouter();

  // URL state — persist qua refresh, browser back
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
      renderStatusBadge={(status) => <Power655DrawStatusBadge status={status as DrawStatus} />}
      renderResult={(draw) => {
        if (!draw.result) return null;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {draw.result.winningMain.map((n) => (
              <PowerNumberBall key={n} number={Number(n)} variant="main" size="sm" />
            ))}
            <span className="mx-0.5 w-px h-4 bg-border" />
            <PowerNumberBall number={Number(draw.result.bonusNumber)} variant="bonus" size="sm" />
          </div>
        );
      }}
    />
  );
}
