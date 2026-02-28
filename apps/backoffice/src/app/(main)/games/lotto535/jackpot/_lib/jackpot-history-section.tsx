"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { useJackpotHistory, type JackpotHistoryItem } from "./use-jackpot";

const PAGE_SIZE = 20;

export function JackpotHistorySection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useJackpotHistory({
    page,
    size: PAGE_SIZE,
  });

  const draws = data?.draws ?? [];
  const hasNext = draws.length === PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
          <History className="size-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Lịch sử Jackpot
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Biến động Jackpot qua từng kỳ quay đã kết sổ
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-40 font-semibold">Draw ID</TableHead>
                <TableHead className="w-16 text-center font-semibold">
                  Kỳ
                </TableHead>
                <TableHead className="w-32 text-right font-semibold">
                  Đầu kỳ
                </TableHead>
                <TableHead className="w-28 text-right font-semibold">
                  Tích luỹ
                </TableHead>
                <TableHead className="w-32 text-right font-semibold">
                  Cuối kỳ
                </TableHead>
                <TableHead className="w-24 text-right font-semibold">
                  Entries
                </TableHead>
                <TableHead className="w-28 text-right font-semibold">
                  Doanh thu
                </TableHead>
                <TableHead className="w-24 text-center font-semibold">
                  Trúng JP
                </TableHead>
                <TableHead className="w-24 text-center font-semibold">
                  Chia giải
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : draws.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Chưa có dữ liệu Jackpot.
                  </TableCell>
                </TableRow>
              ) : (
                draws.map((item) => (
                  <HistoryRow key={item.drawId} item={item} />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {draws.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              Trang {page}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ item }: { item: JackpotHistoryItem }) {
  const isSplit = item.isSplitCycle;
  const isWinner = item.hasWinner;

  return (
    <TableRow
      className={cn(
        "transition-colors",
        isSplit && "bg-amber-50/50 dark:bg-amber-950/20",
        isWinner && "bg-green-50/50 dark:bg-green-950/20"
      )}
    >
      <TableCell className="font-mono text-xs">{item.drawId}</TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className="text-xs tabular-nums">
          {item.drawNo}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {formatVND(item.openingAmount)}
      </TableCell>
      <TableCell className="text-right">
        {item.contribution > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-sm text-green-600 dark:text-green-400">
            <ArrowUpRight className="size-3" />
            <span className="tabular-nums">{formatVND(item.contribution)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
        {formatVND(item.closingAmount)}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {item.ticketEntryCount > 0 ? formatNumber(item.ticketEntryCount) : "—"}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {item.totalRevenue > 0 ? formatVND(item.totalRevenue) : "—"}
      </TableCell>
      <TableCell className="text-center">
        {isWinner ? (
          <Badge className="border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">
            Trúng
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {isSplit ? (
          <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
            Split
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
