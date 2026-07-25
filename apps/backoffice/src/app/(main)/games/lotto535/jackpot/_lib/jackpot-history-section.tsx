"use client";

import { useState } from "react";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { JackpotCycleStatus } from "@megawin/game-lotto535/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatNumber } from "@megawin/shared/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight, History, Loader2, Sparkles, Split } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  type JackpotCycleOption,
  type JackpotHistoryItem,
  useJackpotCycleOptions,
  useJackpotHistoryByCycle,
} from "./use-jackpot";

const PAGE_SIZE = Pagination.Default.Size;

// Sentinel value dùng trong Select — active cycle
const ACTIVE_CYCLE_VALUE = "0";

// ─────────────────────────────────────────────
// Column header labels (REPORT_COLUMN_LABELS + jackpot-specific)
// ─────────────────────────────────────────────
const COL = {
  drawId: REPORT_COLUMN_LABELS.drawId,
  totalRevenue: REPORT_COLUMN_LABELS.totalStake,
  totalFixedPrizes: REPORT_COLUMN_LABELS.totalPayout,
  actualCompanyTake: REPORT_COLUMN_LABELS.companyTake,
  openingAmount: REPORT_COLUMN_LABELS.jackpotOpeningAmount,
  contribution: REPORT_COLUMN_LABELS.jackpotContributionAmount,
  closingAmount: REPORT_COLUMN_LABELS.jackpotClosingAmount,
  hasWinner: REPORT_COLUMN_LABELS.jackpotWinner,
  isSplitCycle: REPORT_COLUMN_LABELS.jackpotSplit,
} as const;

export function JackpotHistorySection() {
  // "0" = active cycle; cycleNo string dùng cho Select
  const [selectedCycleValue, setSelectedCycleValue] = useState<string>(ACTIVE_CYCLE_VALUE);
  const [page, setPage] = useState(1);

  const { data: cycleOptionsData, isLoading: isCyclesLoading } = useJackpotCycleOptions();
  const cycles = cycleOptionsData?.cycles ?? [];

  const cycleNo = parseInt(selectedCycleValue, 10);
  const { data, isLoading, isFetching } = useJackpotHistoryByCycle({
    cycleNo,
    page,
  });

  const draws = data?.draws ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleCycleChange(value: string) {
    setSelectedCycleValue(value);
    // Reset về trang 1 khi đổi cycle
    setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Section header — title + cycle selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <History className="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Lịch sử Jackpot</h2>
            <p className="text-xs text-muted-foreground">Biến động Jackpot qua từng kỳ quay đã kết sổ</p>
          </div>
        </div>

        <CycleSelector
          cycles={cycles}
          value={selectedCycleValue}
          isLoading={isCyclesLoading}
          onChange={handleCycleChange}
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">{COL.drawId}</TableHead>
                  <TableHead className="text-right">{COL.totalRevenue}</TableHead>
                  <TableHead className="text-right">{COL.totalFixedPrizes}</TableHead>
                  <TableHead className="text-right">{COL.actualCompanyTake}</TableHead>
                  <TableHead className="text-right">{COL.openingAmount}</TableHead>
                  <TableHead className="text-right">{COL.contribution}</TableHead>
                  <TableHead className="text-right">{COL.closingAmount}</TableHead>
                  <TableHead className="text-center">{COL.hasWinner}</TableHead>
                  <TableHead className="pr-5 text-center">{COL.isSplitCycle}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : draws.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Chưa có dữ liệu</p>
                      <p className="text-xs text-muted-foreground">Vòng này chưa có kỳ quay nào đã tính thưởng.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  draws.map((item) => <HistoryRow key={item.drawId} item={item} />)
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {(draws.length > 0 || total > 0) && (
            <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                Trang {page} / {totalPages}
                {total > 0 && <span className="ml-1">({formatNumber(total)} kỳ)</span>}
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
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                  <ChevronRight className="ml-1 size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// Cycle Selector
// ─────────────────────────────────────────────

interface CycleSelectorProps {
  cycles: JackpotCycleOption[];
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
}

function CycleSelector({ cycles, value, isLoading, onChange }: CycleSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex h-9 w-52 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-52 text-sm">
        <SelectValue placeholder="Chọn vòng Jackpot" />
      </SelectTrigger>
      <SelectContent>
        {cycles.map((cycle) => (
          <SelectItem
            key={cycle.cycleNo}
            value={cycle.status === JackpotCycleStatus.Active ? ACTIVE_CYCLE_VALUE : String(cycle.cycleNo)}
          >
            <CycleSelectorLabel cycle={cycle} />
          </SelectItem>
        ))}
        {cycles.length === 0 && <SelectItem value={ACTIVE_CYCLE_VALUE}>Vòng hiện tại</SelectItem>}
      </SelectContent>
    </Select>
  );
}

function CycleSelectorLabel({ cycle }: { cycle: JackpotCycleOption }) {
  const isActive = cycle.status === JackpotCycleStatus.Active;

  return (
    <span className="flex items-center gap-2">
      <span className="tabular-nums">
        Vòng #{cycle.cycleNo}
        {isActive && <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">(hiện tại)</span>}
      </span>
      {!isActive && cycle.closeReason === "winner" && (
        <Sparkles className="size-3 text-green-600 dark:text-green-400" />
      )}
      {!isActive && cycle.closeReason === "split" && <Split className="size-3 text-amber-600 dark:text-amber-400" />}
    </span>
  );
}

// ─────────────────────────────────────────────
// Table Row
// ─────────────────────────────────────────────

function HistoryRow({ item }: { item: JackpotHistoryItem }) {
  const isSplit = item.isSplitCycle;
  const isWinner = item.hasWinner;

  // Tỷ lệ % công ty thu, hiển thị 1 chữ số thập phân
  const companyTakeRatePct = item.companyTakeRate > 0 ? `${(item.companyTakeRate * 100).toFixed(1)}%` : null;

  return (
    <TableRow
      className={cn(
        "transition-colors",
        isSplit && "bg-amber-50/50 dark:bg-amber-950/20",
        isWinner && "bg-green-50/50 dark:bg-green-950/20",
      )}
    >
      {/* Kỳ (DrawId) */}
      <TableCell className="pl-5 font-mono text-sm tabular-nums">{item.drawId}</TableCell>

      {/* Tiền cược */}
      <TableCell className="text-right text-sm tabular-nums">
        {item.totalRevenue > 0 ? formatNumber(item.totalRevenue) : "—"}
      </TableCell>

      {/* Trả thưởng */}
      <TableCell className="text-right text-sm tabular-nums">
        {item.totalFixedPrizes > 0 ? formatNumber(item.totalFixedPrizes) : "—"}
      </TableCell>

      {/* Công ty thu về — tooltip tỷ lệ % khi hover */}
      <TableCell className="text-right text-sm tabular-nums">
        {item.actualCompanyTake > 0 ? (
          companyTakeRatePct ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default underline decoration-dashed decoration-muted-foreground/50 underline-offset-2">
                  {formatNumber(item.actualCompanyTake)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Tỷ lệ công ty thu: <span className="font-semibold">{companyTakeRatePct}</span>
              </TooltipContent>
            </Tooltip>
          ) : (
            formatNumber(item.actualCompanyTake)
          )
        ) : (
          "—"
        )}
      </TableCell>

      {/* Đầu kỳ */}
      <TableCell className="text-right text-sm tabular-nums">{formatNumber(item.openingAmount)}</TableCell>

      {/* Tích luỹ */}
      <TableCell className="text-right">
        {item.contribution > 0 ? (
          <span className="inline-flex items-center justify-end gap-0.5 text-sm text-profit">
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="tabular-nums">{formatNumber(item.contribution)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Cuối kỳ */}
      <TableCell className="text-right text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
        {formatNumber(item.closingAmount)}
      </TableCell>

      {/* Jackpot (hasWinner) */}
      <TableCell className="text-center">
        {isWinner ? (
          <Badge className="gap-1 border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400">
            <Sparkles className="size-3" />
            Trúng
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Chia giải (isSplitCycle) */}
      <TableCell className="pr-5 text-center">
        {isSplit ? (
          <Badge className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Split className="size-3" />
            Chia giải
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
