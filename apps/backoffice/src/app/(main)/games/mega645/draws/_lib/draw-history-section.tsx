"use client";

/**
 * Mega 6/45 — Draw History Section
 *
 * Danh sách lịch sử kỳ quay với filter theo trạng thái, khoảng ngày.
 * Offset pagination (page/size) — khác với lotto535 dùng cursor.
 * Mỗi row có link đến trang vận hành.
 *
 * Mega 6/45: không có specialNumbers trong kết quả, không có isSplitCycle.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Filter, Loader2, CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DrawStatusBadge } from "@/components/games/mega645/draw-status-badge";
import { MegaNumberBall } from "@/components/games/mega645/mega-number-ball";
import { cn } from "@/lib/utils";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { Pagination } from "@megawin/shared/constants/pagination";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNDate, formatVNTime, subDays, todayVN } from "@megawin/shared/utils/date";

import type { DrawSummary, ListDrawsParams } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/mega645/operations";

function defaultRange(): DateRange {
  return {
    from: subDays(new Date(), 7),
    to: new Date(),
  };
}

const HISTORY_STATUSES = [
  { value: "all", label: "Tất cả" },
  { value: DrawStatus.Settled, label: "Hoàn tất" },
  { value: DrawStatus.Published, label: "Đã công bố" },
  { value: DrawStatus.SalesClosed, label: "Đóng bán" },
  { value: DrawStatus.Void, label: "Đã huỷ" },
];

// ─── Date Range Picker ────────────────────────────────────────────────────────

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = value?.from
    ? value.to
      ? `${format(value.from, "dd/MM/yyyy")} – ${format(value.to, "dd/MM/yyyy")}`
      : format(value.from, "dd/MM/yyyy")
    : "Chọn khoảng thời gian";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-64 justify-start gap-2 font-normal",
            !value?.from && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0" />
          <span className="truncate text-sm">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
          defaultMonth={value?.from}
        />
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(defaultRange());
              setOpen(false);
            }}
          >
            Mặc định
          </Button>
          <Button size="sm" disabled={!value?.from} onClick={() => setOpen(false)}>
            Áp dụng
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function DrawHistorySection() {
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
  const [page, setPage] = useState(1);

  const [appliedFilters, setAppliedFilters] = useState<ListDrawsParams>(() => ({
    size: Pagination.Default.Size,
    fromDate: formatVNDate(subDays(new Date(), 7)),
    toDate: todayVN(),
    page: 1,
  }));

  const { data, isLoading, isFetching } = useDrawsList(appliedFilters);

  const draws = data?.draws ?? [];
  const totalPage = Math.ceil((data?.size ?? Pagination.Default.Size) / (data?.size ?? 1));
  const hasMore = draws.length === (appliedFilters.size ?? Pagination.Default.Size);

  const applyFilters = useCallback(() => {
    const params: ListDrawsParams = {
      size: Pagination.Default.Size,
      status: status !== "all" ? (status as DrawStatus) : undefined,
      fromDate: dateRange?.from ? formatVNDate(dateRange.from) : undefined,
      toDate: dateRange?.to ? formatVNDate(dateRange.to) : undefined,
      page: 1,
    };
    setPage(1);
    setAppliedFilters(params);
  }, [status, dateRange]);

  function goNext() {
    const nextPage = page + 1;
    setPage(nextPage);
    setAppliedFilters((prev) => ({ ...prev, page: nextPage }));
  }

  function goPrev() {
    if (page <= 1) return;
    const prevPage = page - 1;
    setPage(prevPage);
    setAppliedFilters((prev) => ({ ...prev, page: prevPage }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử kỳ quay</CardTitle>
        <CardDescription>Các kỳ quay đã hoàn thành, sắp xếp mới nhất trước.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {HISTORY_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <Button variant="outline" size="sm" onClick={applyFilters} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Filter className="mr-1 size-3.5" />
            )}
            Lọc
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Kỳ quay</TableHead>
                <TableHead className="w-20">Giờ</TableHead>
                <TableHead className="w-28">Trạng thái</TableHead>
                <TableHead className="min-w-52">Kết quả (6 số)</TableHead>
                <TableHead className="w-24 text-right">Entries</TableHead>
                <TableHead className="w-32 text-right">Doanh thu</TableHead>
                <TableHead className="w-32 text-right">Jackpot</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : draws.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Không có kỳ quay nào trong khoảng thời gian đã chọn.
                  </TableCell>
                </TableRow>
              ) : (
                draws.map((draw) => <DrawRow key={draw.drawId} draw={draw} />)
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {draws.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Trang {page}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={goPrev}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || isFetching}
                onClick={goNext}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Draw Row ─────────────────────────────────────────────────────────────────

function DrawRow({ draw }: { draw: DrawSummary }) {
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-0.5">
          <Link
            href={`${OPS_BASE}?draw=${draw.drawId}`}
            className="font-mono text-sm font-semibold hover:underline underline-offset-2"
          >
            {draw.drawDate}
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground/60">{draw.drawId}</p>
        </div>
      </TableCell>
      <TableCell className="tabular-nums text-sm">
        {formatVNTime(new Date(draw.drawTime))}
      </TableCell>
      <TableCell>
        <DrawStatusBadge status={draw.status} />
      </TableCell>
      <TableCell>
        {/* Mega 6/45: hiển thị 6 số chính, không có specialNumber */}
        {draw.result ? (
          <div className="flex items-center gap-1 flex-wrap">
            {draw.result.winningMain.map((n) => (
              <MegaNumberBall key={n} number={Number(n)} size="sm" />
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.ticketEntryCount != null && draw.ticketEntryCount > 0
          ? formatNumber(draw.ticketEntryCount)
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalRevenue != null && draw.totalRevenue > 0 ? formatVND(draw.totalRevenue) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.jackpotClosingAmount != null && draw.jackpotClosingAmount > 0
          ? formatVND(draw.jackpotClosingAmount)
          : "—"}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link href={`${OPS_BASE}?draw=${draw.drawId}`} title="Xem tại trang vận hành">
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
