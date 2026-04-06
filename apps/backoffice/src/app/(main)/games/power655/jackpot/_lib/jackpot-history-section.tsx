"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Sparkles,
  TrendingDown,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNumber } from "@megawin/shared/utils";
import { Pagination } from "@megawin/shared/constants";
import { JackpotCycleStatus } from "@megawin/game-power655/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import {
  useJackpotCycleOptions,
  useJackpotHistoryByCycle,
  type JackpotHistoryItem,
  type JackpotCycleOption,
} from "./use-jackpot";

const PAGE_SIZE = Pagination.Default.Size;

// Sentinel value dùng trong Select — active cycle
const ACTIVE_CYCLE_VALUE = "0";

// ─────────────────────────────────────────────
// Column header labels
// JP1/JP2 dual columns dùng labels từ REPORT_COLUMN_LABELS
// ─────────────────────────────────────────────
const COL = {
  drawId: REPORT_COLUMN_LABELS.drawId,
  totalRevenue: REPORT_COLUMN_LABELS.totalStake,
  totalFixedPrizes: REPORT_COLUMN_LABELS.totalPayout,
  actualCompanyTake: REPORT_COLUMN_LABELS.companyTake,
  jp1Opening: REPORT_COLUMN_LABELS.jp1OpeningAmount,
  jp1Contribution: REPORT_COLUMN_LABELS.jp1ContributionAmount,
  jp1Closing: REPORT_COLUMN_LABELS.jp1ClosingAmount,
  jp2Opening: REPORT_COLUMN_LABELS.jp2OpeningAmount,
  jp2Contribution: REPORT_COLUMN_LABELS.jp2ContributionAmount,
  jp2Closing: REPORT_COLUMN_LABELS.jp2ClosingAmount,
  jp1Overflow: REPORT_COLUMN_LABELS.jp1Overflow,
  hasWinner: REPORT_COLUMN_LABELS.jackpotWinner,
} as const;

// Tổng số cột trong bảng (dùng cho colSpan)
const COL_COUNT = 12;

export function JackpotHistorySection() {
  // "0" = active cycle; cycleNo string dùng cho Select
  const [selectedCycleValue, setSelectedCycleValue] = useState<string>(ACTIVE_CYCLE_VALUE);
  const [page, setPage] = useState(1);

  const { data: cycleOptionsData, isLoading: isCyclesLoading } = useJackpotCycleOptions();
  const cycleOptions = cycleOptionsData?.cycles ?? [];
  const activeCycleNo = cycleOptionsData?.activeCycleNo ?? null;

  // Resolve cycleNo thực từ selectedCycleValue
  // "0" = active cycle → dùng activeCycleNo
  const cycleNo =
    selectedCycleValue === ACTIVE_CYCLE_VALUE
      ? (activeCycleNo ?? 0)
      : parseInt(selectedCycleValue, 10);

  const { data, isLoading, isFetching } = useJackpotHistoryByCycle({ cycleNo, page });

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
            <p className="text-xs text-muted-foreground">
              Biến động JP1 / JP2 qua từng kỳ quay đã kết sổ
            </p>
          </div>
        </div>

        <CycleSelector
          cycles={cycleOptions}
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
                  {/* JP1 columns — red tint */}
                  <TableHead className="text-right text-red-700/80 dark:text-red-400/80">
                    {COL.jp1Opening}
                  </TableHead>
                  <TableHead className="text-right text-red-700/80 dark:text-red-400/80">
                    {COL.jp1Contribution}
                  </TableHead>
                  <TableHead className="text-right text-red-700/80 dark:text-red-400/80">
                    {COL.jp1Closing}
                  </TableHead>
                  {/* JP2 columns — blue tint */}
                  <TableHead className="text-right text-blue-700/80 dark:text-blue-400/80">
                    {COL.jp2Opening}
                  </TableHead>
                  <TableHead className="text-right text-blue-700/80 dark:text-blue-400/80">
                    {COL.jp2Contribution}
                  </TableHead>
                  <TableHead className="text-right text-blue-700/80 dark:text-blue-400/80">
                    {COL.jp2Closing}
                  </TableHead>
                  {/* JP1 Overflow */}
                  <TableHead className="text-right">{COL.jp1Overflow}</TableHead>
                  <TableHead className="pr-5 text-center">{COL.hasWinner}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="h-32 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : draws.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="h-32 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Chưa có dữ liệu</p>
                      <p className="text-xs text-muted-foreground">
                        Vòng này chưa có kỳ quay nào đã tính thưởng.
                      </p>
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
            value={
              cycle.status === JackpotCycleStatus.Active
                ? ACTIVE_CYCLE_VALUE
                : String(cycle.cycleNo)
            }
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
        {isActive && (
          <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">(hiện tại)</span>
        )}
      </span>
      {/* Power 6/55 đóng khi JP1 có winner — hiện Sparkles cho jackpot1_winner / both_winner */}
      {!isActive &&
        (cycle.closedReason === "jackpot1_winner" || cycle.closedReason === "both_winner") && (
          <Sparkles className="size-3 text-green-600 dark:text-green-400" />
        )}
    </span>
  );
}

// ─────────────────────────────────────────────
// Table Row
// ─────────────────────────────────────────────

function HistoryRow({ item }: { item: JackpotHistoryItem }) {
  const hasWinner = item.hasJackpot1Winner || item.hasJackpot2Winner;

  // Tỷ lệ % công ty thu, hiển thị 1 chữ số thập phân
  const companyTakeRatePct =
    item.companyTakeRate > 0 ? `${(item.companyTakeRate * 100).toFixed(1)}%` : null;

  return (
    <TableRow className={cn("transition-colors", hasWinner && "bg-blue-50/40 dark:bg-blue-950/20")}>
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

      {/* JP1 Đầu kỳ */}
      <TableCell className="text-right text-sm tabular-nums text-red-600/80 dark:text-red-400/80">
        {formatNumber(item.openingJackpot1)}
      </TableCell>

      {/* JP1 Tích lũy */}
      <TableCell className="text-right">
        {item.jackpot1Contribution > 0 ? (
          <span className="inline-flex items-center justify-end gap-0.5 text-sm text-red-600/80 dark:text-red-400/80">
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="tabular-nums">{formatNumber(item.jackpot1Contribution)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* JP1 Cuối kỳ */}
      <TableCell className="text-right text-sm font-semibold tabular-nums text-red-700 dark:text-red-400">
        {formatNumber(item.closingJackpot1)}
      </TableCell>

      {/* JP2 Đầu kỳ */}
      <TableCell className="text-right text-sm tabular-nums text-blue-600/80 dark:text-blue-400/80">
        {formatNumber(item.openingJackpot2)}
      </TableCell>

      {/* JP2 Tích lũy */}
      <TableCell className="text-right">
        {item.jackpot2Contribution > 0 ? (
          <span className="inline-flex items-center justify-end gap-0.5 text-sm text-blue-600/80 dark:text-blue-400/80">
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="tabular-nums">{formatNumber(item.jackpot2Contribution)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* JP2 Cuối kỳ */}
      <TableCell className="text-right text-sm font-semibold tabular-nums text-blue-700 dark:text-blue-400">
        {formatNumber(item.closingJackpot2)}
      </TableCell>

      {/* JP1 Overflow — chỉ hiển thị khi có overflow (> 0) */}
      <TableCell className="text-right">
        {item.jp1Overflow > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center justify-end gap-0.5 text-sm text-amber-600 dark:text-amber-400">
                <TrendingDown className="size-3 shrink-0" />
                <span className="tabular-nums">{formatNumber(item.jp1Overflow)}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              JP1 vượt ngưỡng — phần này chuyển sang JP2 kỳ này
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Jackpot (hasWinner) */}
      <TableCell className="pr-5 text-center">
        {hasWinner ? (
          <div className="flex flex-col items-center gap-0.5">
            {item.hasJackpot1Winner && (
              <Badge className="gap-1 border-red-500/30 bg-red-500/15 text-xs text-red-700 dark:text-red-400">
                <Sparkles className="size-3" />
                JP1
              </Badge>
            )}
            {item.hasJackpot2Winner && (
              <Badge className="gap-1 border-blue-500/30 bg-blue-500/15 text-xs text-blue-700 dark:text-blue-400">
                <Sparkles className="size-3" />
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
