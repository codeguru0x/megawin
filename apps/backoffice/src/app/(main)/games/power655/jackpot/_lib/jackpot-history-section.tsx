"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";

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
import { formatVND, formatNumber } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants";
import { useJackpotHistory, type JackpotHistoryItem } from "./use-jackpot";

const PAGE_SIZE = Pagination.Default.Size;

export function JackpotHistorySection() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useJackpotHistory({ page });

  const draws: JackpotHistoryItem[] = data?.draws ?? [];
  const hasNext = draws.length === PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
          <History className="size-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Lịch sử Jackpot</h2>
          <p className="text-[11px] text-muted-foreground">
            Biến động Jackpot 1 / Jackpot 2 qua từng kỳ quay đã kết sổ
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-40 font-semibold">Draw ID</TableHead>
                <TableHead className="w-16 text-center font-semibold">Kỳ</TableHead>
                {/* Jackpot 1 columns — red tint header */}
                <TableHead className="w-28 text-right font-semibold text-red-700/80 dark:text-red-400/80">
                  JP1 Đầu kỳ
                </TableHead>
                <TableHead className="w-24 text-right font-semibold text-red-700/80 dark:text-red-400/80">
                  JP1 Tích luỹ
                </TableHead>
                <TableHead className="w-28 text-right font-semibold text-red-700/80 dark:text-red-400/80">
                  JP1 Cuối kỳ
                </TableHead>
                {/* Jackpot 2 columns — blue tint header */}
                <TableHead className="w-28 text-right font-semibold text-blue-700/80 dark:text-blue-400/80">
                  JP2 Đầu kỳ
                </TableHead>
                <TableHead className="w-24 text-right font-semibold text-blue-700/80 dark:text-blue-400/80">
                  JP2 Tích luỹ
                </TableHead>
                <TableHead className="w-28 text-right font-semibold text-blue-700/80 dark:text-blue-400/80">
                  JP2 Cuối kỳ
                </TableHead>
                {/* Common */}
                <TableHead className="w-24 text-right font-semibold">Entries</TableHead>
                <TableHead className="w-28 text-right font-semibold">Doanh thu</TableHead>
                <TableHead className="w-24 text-center font-semibold">Trúng JP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : draws.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                    Chưa có dữ liệu Jackpot.
                  </TableCell>
                </TableRow>
              ) : (
                draws.map((item) => <HistoryRow key={item.drawId} item={item} />)
              )}
            </TableBody>
          </Table>
        </div>

        {draws.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground tabular-nums">Trang {page}</p>
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

function ContribCell({ value }: { value: number }) {
  if (value <= 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-sm text-green-600 dark:text-green-400">
      <ArrowUpRight className="size-3" />
      <span className="tabular-nums">{formatVND(value)}</span>
    </span>
  );
}

function HistoryRow({ item }: { item: JackpotHistoryItem }) {
  const hasWinner = item.hasJackpot1Winner || item.hasJackpot2Winner;

  return (
    <TableRow
      className={cn("transition-colors", hasWinner && "bg-green-50/50 dark:bg-green-950/20")}
    >
      <TableCell className="font-mono text-xs">{item.drawId}</TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className="text-xs tabular-nums">
          {item.drawNo}
        </Badge>
      </TableCell>

      {/* JP1 columns */}
      <TableCell className="text-right text-sm tabular-nums text-red-600/80 dark:text-red-400/80">
        {formatVND(item.openingJackpot1)}
      </TableCell>
      <TableCell className="text-right">
        <ContribCell value={item.jackpot1Contribution} />
      </TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums text-red-700 dark:text-red-400">
        {formatVND(item.closingJackpot1)}
      </TableCell>

      {/* JP2 columns */}
      <TableCell className="text-right text-sm tabular-nums text-blue-600/80 dark:text-blue-400/80">
        {formatVND(item.openingJackpot2)}
      </TableCell>
      <TableCell className="text-right">
        <ContribCell value={item.jackpot2Contribution} />
      </TableCell>
      <TableCell className="text-right text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400">
        {formatVND(item.closingJackpot2)}
      </TableCell>

      <TableCell className="text-right text-sm tabular-nums">
        {item.totalEntries > 0 ? formatNumber(item.totalEntries) : "—"}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {item.totalRevenue > 0 ? formatVND(item.totalRevenue) : "—"}
      </TableCell>

      {/* Winner badges */}
      <TableCell className="text-center">
        {hasWinner ? (
          <div className="flex flex-col items-center gap-0.5">
            {item.hasJackpot1Winner && (
              <Badge className="border-red-500/30 bg-red-500/15 text-[10px] text-red-700 dark:text-red-400">
                JP1
              </Badge>
            )}
            {item.hasJackpot2Winner && (
              <Badge className="border-blue-500/30 bg-blue-500/15 text-[10px] text-blue-700 dark:text-blue-400">
                JP2
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
