"use client";

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
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";
import { cn } from "@/lib/utils";
import { formatVND } from "@megawin/shared/utils/number";
import { Pagination } from "@megawin/shared/constants/pagination";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNDate, formatVNTime, subDays, todayVN } from "@megawin/shared/utils/date";

import type { DrawSummary, ListDrawsParams } from "./use-draws";
import { useDrawsList } from "./use-draws";

const OPS_BASE = "/games/lotto535/operations";

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

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

function DateRangePicker({ value, onChange }: DateRangePickerProps) {
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

  const [appliedFilters, setAppliedFilters] = useState<ListDrawsParams>(() => ({
    size: Pagination.Default.Size,
    fromDate: formatVNDate(subDays(new Date(), 7)),
    toDate: todayVN(),
  }));

  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading, isFetching } = useDrawsList({
    ...appliedFilters,
    cursor: cursors[pageIndex],
  });

  const draws = data?.draws ?? [];
  const nextCursor = data?.nextCursor ?? null;

  const applyFilters = useCallback(() => {
    const params: ListDrawsParams = {
      size: Pagination.Default.Size,
      status: status !== "all" ? (status as DrawStatus) : undefined,
      fromDate: dateRange?.from ? formatVNDate(dateRange.from) : undefined,
      toDate: dateRange?.to ? formatVNDate(dateRange.to) : undefined,
    };
    setCursors([undefined]);
    setPageIndex(0);
    setAppliedFilters(params);
  }, [status, dateRange]);

  function goNext() {
    if (!nextCursor) return;
    const newIndex = pageIndex + 1;
    setCursors((prev) => {
      const copy = [...prev];
      copy[newIndex] = nextCursor;
      return copy;
    });
    setPageIndex(newIndex);
  }

  function goPrev() {
    if (pageIndex <= 0) return;
    setPageIndex(pageIndex - 1);
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
                <TableHead className="w-36">Kỳ quay</TableHead>
                <TableHead className="w-16">Giờ</TableHead>
                <TableHead className="w-28">Trạng thái</TableHead>
                <TableHead className="w-56">Kết quả</TableHead>
                <TableHead className="w-24 text-right">Entries</TableHead>
                <TableHead className="w-24 text-right">Lines</TableHead>
                <TableHead className="w-32 text-right">Doanh thu</TableHead>
                <TableHead className="w-36 text-right">Trả thưởng</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : draws.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">Trang {pageIndex + 1}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageIndex <= 0 || isFetching}
                onClick={goPrev}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextCursor || isFetching}
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

function DrawRow({ draw }: { draw: DrawSummary }) {
  const isSettled = draw.status === DrawStatus.Settled;

  return (
    <TableRow className={draw.isSplitCycle ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Link
            href={`${OPS_BASE}?draw=${draw.drawId}`}
            className="font-mono text-sm font-semibold hover:underline underline-offset-2"
          >
            {draw.drawId}
          </Link>
          {draw.isSplitCycle && (
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] px-1 py-0">
              Split
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="tabular-nums">{formatVNTime(new Date(draw.drawTime))}</TableCell>
      <TableCell>
        <DrawStatusBadge status={draw.status} />
      </TableCell>
      <TableCell>
        {draw.result ? (
          <div className="flex items-center gap-1 flex-wrap">
            {draw.result.winningMain.map((n) => (
              <LottoNumberBall key={n} number={n} variant="main" size="xs" />
            ))}
            <span className="w-px h-4 bg-border mx-0.5" />
            <LottoNumberBall number={draw.result.winningSpecial} variant="special" size="xs" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.ticketEntryCount != null && draw.ticketEntryCount > 0
          ? draw.ticketEntryCount.toLocaleString("vi-VN")
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalLineCount != null && draw.totalLineCount > 0
          ? draw.totalLineCount.toLocaleString("vi-VN")
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalRevenue != null && draw.totalRevenue > 0 ? formatVND(draw.totalRevenue) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {isSettled && draw.totalPrizesPayout != null
          ? formatVND(draw.totalPrizesPayout)
          : draw.totalPrizesPayout != null && draw.totalPrizesPayout > 0
            ? formatVND(draw.totalPrizesPayout)
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
