"use client";

/**
 * Power 6/55 — Draw History Section
 *
 * Danh sách lịch sử kỳ quay với filter theo trạng thái, khoảng ngày.
 * Offset pagination (page/size).
 * Mỗi row có link đến trang vận hành để xem chi tiết.
 *
 * Power 6/55: 3 kỳ/tuần, có số kỳ (drawNo), hiển thị kết quả 6 số chính + 1 bonus,
 * dual jackpot (JP1 + JP2).
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
import { Power655DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import { PowerNumberBall } from "@/components/games/power655/power-number-ball";
import { cn } from "@/lib/utils";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { Pagination } from "@megawin/shared/constants/pagination";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNDate, formatVNTime, subDays, todayVN } from "@megawin/shared/utils/date";

import type { DrawSummary, ListDrawsParams } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/power655/operations";

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
                <TableHead className="w-16">Giờ</TableHead>
                <TableHead className="w-28">Trạng thái</TableHead>
                {/* Power 6/55: 6 số chính + 1 bonus */}
                <TableHead className="min-w-64">Kết quả (6+1)</TableHead>
                <TableHead className="w-24 text-right">Entries</TableHead>
                <TableHead className="w-32 text-right">Doanh thu</TableHead>
                <TableHead className="w-44 text-right">JP1 / JP2</TableHead>
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
            className="flex items-center gap-1.5 font-mono text-sm font-semibold hover:underline underline-offset-2"
          >
            {/* Power 6/55: hiển thị ngày + số kỳ */}
            {draw.drawDate}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              #{draw.drawNo}
            </Badge>
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground/60">{draw.drawId}</p>
        </div>
      </TableCell>
      <TableCell className="tabular-nums text-sm">
        {formatVNTime(new Date(draw.drawTime))}
      </TableCell>
      <TableCell>
        <Power655DrawStatusBadge status={draw.status} />
      </TableCell>
      <TableCell>
        {/* Hiển thị 6 số chính + 1 bonus (riêng biệt) */}
        {draw.result ? (
          <div className="flex items-center gap-1 flex-wrap">
            {draw.result.winningMain.map((n) => (
              <PowerNumberBall key={n} number={Number(n)} variant="main" size="sm" />
            ))}
            <span className="text-muted-foreground/40 text-xs mx-0.5">+</span>
            <PowerNumberBall number={Number(draw.result.bonusNumber)} variant="bonus" size="sm" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalEntries != null && draw.totalEntries > 0 ? formatNumber(draw.totalEntries) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalRevenue != null && draw.totalRevenue > 0 ? formatVND(draw.totalRevenue) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {/* Dual jackpot: JP1 closing / JP2 closing */}
        {draw.jackpot1ClosingAmount != null ? (
          <div className="space-y-0.5">
            <p className="text-[11px] tabular-nums">
              <span className="text-muted-foreground text-[10px] mr-1">JP1</span>
              {formatVND(draw.jackpot1ClosingAmount)}
            </p>
            {draw.jackpot2ClosingAmount != null && (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                <span className="text-[10px] mr-1">JP2</span>
                {formatVND(draw.jackpot2ClosingAmount)}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
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
