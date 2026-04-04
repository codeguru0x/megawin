"use client";

/**
 * Lotto 5/35 — Draw History Section
 *
 * Wrapper game-specific: quản lý URL state (nuqs) cho filter + page number.
 * Cursor map lưu trong useRef — khi page thay đổi (kể cả do bấm back),
 * tra cursor tương ứng từ map. Browser back button hoạt động đúng vì
 * page number được push vào history stack qua nuqs.
 *
 * Giới hạn đã biết: refresh trang ở page > 1 sẽ fetch lại từ page 1
 * vì cursor là opaque string, không thể persist trên URL.
 */

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";

import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import { DrawHistoryTable } from "@/components/draws";
import type { CommonDrawSummary } from "@/components/draws";
import { formatVNDate, subDays, todayVN } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants";
import type { DrawStatus } from "@megawin/game-core/entities";

import type { DrawSummary } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/lotto535/operations";

// ─── Default range helpers ────────────────────────────────────────────────────

function defaultFrom(): string {
  return formatVNDate(subDays(new Date(), 6));
}

function defaultTo(): string {
  return todayVN();
}

// ─── Adapter — DrawSummary → CommonDrawSummary ────────────────────────────────

function toCommon(draw: DrawSummary): DrawSummary & CommonDrawSummary {
  return {
    ...draw,
    // financialDate và closeAt được populate từ list-draws.ts.
    // Fallback về drawDate/drawTime cho data cũ chưa có field này.
    financialDate: draw.financialDate ?? draw.drawDate,
    closeAt: draw.closeAt ?? draw.drawTime,
    totalEntries: draw.ticketEntryCount,
    totalPayout: draw.totalPayout,
    totalAgentCommission: draw.financial?.totalAgentCommission,
  };
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function DrawHistorySection() {
  const router = useRouter();

  // URL state — filter + page persist trên URL và push vào history stack.
  // Bấm back sẽ khôi phục đúng page number đã xem.
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

  // Cursor map: page number → cursor string.
  // Lưu trong ref (không trigger re-render), tồn tại suốt phiên.
  // Khi refresh trang ở page > 1: cursor không có → fetch lại từ page 1.
  const cursorMap = useRef<Map<number, string>>(new Map());

  const statusFilter = statusParam !== "all" ? (statusParam as DrawStatus) : undefined;

  // Page 1 không cần cursor; các trang sau tra từ map
  const cursor = page > 1 ? (cursorMap.current.get(page) ?? undefined) : undefined;

  const { data, isLoading, isFetching } = useDrawsList({
    size: Pagination.Default.Size,
    status: statusFilter,
    fromDate,
    toDate,
    cursor,
  });

  const rawDraws = data?.draws ?? [];
  const draws = rawDraws.map(toCommon);
  const nextCursor = data?.nextCursor ?? null;
  const hasMore = !!nextCursor;

  // Mỗi khi nhận được nextCursor, pre-populate map để navigate tiếp được
  useEffect(() => {
    if (nextCursor) {
      cursorMap.current.set(page + 1, nextCursor);
    }
  }, [nextCursor, page]);

  // ─── Filter handlers ────────────────────────────────────────────────────────

  function handleDateChange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
    // Reset cursor map và về page 1 khi filter thay đổi
    cursorMap.current.clear();
    setPage(null);
  }

  function handleStatusChange(value: string) {
    setStatusParam(value === "all" ? null : value);
    cursorMap.current.clear();
    setPage(null);
  }

  // ─── Pagination handlers ─────────────────────────────────────────────────────

  function handlePageNext() {
    if (!hasMore) return;
    // cursor page+1 đã được lưu vào map bởi useEffect trên
    setPage(page + 1);
  }

  function handlePagePrev() {
    if (page <= 1) return;
    setPage(page - 1);
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
      onPageNext={handlePageNext}
      onPagePrev={handlePagePrev}
      onRowClick={(draw) => router.push(`${OPS_BASE}?draw=${draw.drawId}`)}
      renderStatusBadge={(status) => <DrawStatusBadge status={status} />}
      renderResult={(draw) => {
        if (!draw.result) return null;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {draw.result.winningMain.map((n) => (
              <LottoNumberBall key={n} number={n} variant="main" size="sm" />
            ))}
            <span className="mx-0.5 w-px h-4 bg-border" />
            <LottoNumberBall number={draw.result.winningSpecial} variant="special" size="sm" />
          </div>
        );
      }}
    />
  );
}
