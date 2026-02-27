"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  MoreHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import {
  JackpotDisplay,
  formatVND,
} from "@/components/games/lotto535/jackpot-display";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNTime, yesterdayVN } from "@megawin/shared/utils/date";

import type { DrawSummary, ListDrawsParams } from "./use-draws";
import { useDrawsList } from "./use-draws";

const PAGE_SIZE = 20;

const HISTORY_STATUSES = [
  { value: "all", label: "Tất cả" },
  { value: DrawStatus.Settled, label: "Hoàn tất" },
  { value: DrawStatus.Published, label: "Đã công bố" },
  { value: DrawStatus.SalesClosed, label: "Đóng bán" },
  { value: DrawStatus.Void, label: "Đã huỷ" },
];

export function DrawHistorySection() {
  const [status, setStatus] = useState("all");
  const [selectedDate, setSelectedDate] = useState(yesterdayVN());
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState<ListDrawsParams>({
    page: 1,
    size: PAGE_SIZE,
    fromDate: yesterdayVN(),
    toDate: yesterdayVN(),
  });

  const { data, isLoading, isFetching } = useDrawsList(appliedFilters);
  const draws = data?.draws ?? [];
  const hasNext = draws.length === PAGE_SIZE;

  function applyFilters() {
    const params: ListDrawsParams = {
      page: 1,
      size: PAGE_SIZE,
      status: status !== "all" ? (status as DrawStatus) : undefined,
      fromDate: selectedDate || undefined,
      toDate: selectedDate || undefined,
    };
    setPage(1);
    setAppliedFilters(params);
  }

  function goToPage(p: number) {
    setPage(p);
    setAppliedFilters((prev) => ({ ...prev, page: p }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử kỳ quay</CardTitle>
        <CardDescription>
          Các kỳ quay đã hoàn thành, sắp xếp mới nhất trước.
        </CardDescription>
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
          <Input
            type="date"
            className="w-40"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={applyFilters}
            disabled={isFetching}
          >
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
                <TableHead className="w-44">Draw ID</TableHead>
                <TableHead className="w-20">Kỳ</TableHead>
                <TableHead className="w-20">Giờ</TableHead>
                <TableHead className="w-28">Trạng thái</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="w-32 text-right">Jackpot</TableHead>
                <TableHead className="w-24 text-right">Vé</TableHead>
                <TableHead className="w-32 text-right">Doanh thu</TableHead>
                <TableHead className="w-14" />
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
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Không có kỳ quay nào.
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
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="mr-1 size-4" />
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || isFetching}
                onClick={() => goToPage(page + 1)}
              >
                Sau
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DrawRow({ draw }: { draw: DrawSummary }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{draw.drawId}</TableCell>
      <TableCell>
        <Badge variant="outline">Kỳ {draw.drawNo}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">
        {formatVNTime(new Date(draw.drawTime))}
      </TableCell>
      <TableCell>
        <DrawStatusBadge status={draw.status} />
      </TableCell>
      <TableCell>
        {draw.hasResult ? (
          <span className="text-sm text-muted-foreground">Có kết quả</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <JackpotDisplay amount={draw.jackpotAmount} size="sm" />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {draw.ticketEntryCount != null && draw.ticketEntryCount > 0
          ? draw.ticketEntryCount.toLocaleString("vi-VN")
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {draw.totalRevenue != null && draw.totalRevenue > 0
          ? formatVND(draw.totalRevenue)
          : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Eye className="mr-2 size-4" />
              Xem chi tiết
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
