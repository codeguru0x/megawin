"use client";

import { useState } from "react";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { JackpotCycleStatus } from "@megawin/game-mega645/entities";
import { Pagination } from "@megawin/shared/constants";
import { formatNumber } from "@megawin/shared/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight, History, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  useJackpotCycleOptions,
  useJackpotHistoryByCycle,
  type JackpotCycleOption,
  type JackpotHistoryItem,
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
} as const;

export function JackpotHistorySection() {
  // "0" = active cycle; cycleNo string dùng cho Select
  const [selectedCycleValue, setSelectedCycleValue] = useState<string>(ACTIVE_CYCLE_VALUE);
  const [page, setPage] = useState(1);

  const { data: cycleOptionsData, isLoading: isCyclesLoading } = useJackpotCycleOptions();
  const cycles = cycleOptionsData?.cycles ?? [];

  const cycleNo = parseInt(selectedCycleValue, 10);
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
          <div className="bg-game-mega645 flex size-8 items-center justify-center rounded-lg">
            <History className="text-game-mega645 size-4" />
          </div>
          <div>
            <h2 className="text-foreground text-sm font-semibold">Lịch sử Jackpot</h2>
            <p className="text-muted-foreground text-xs">Biến động Jackpot qua từng kỳ quay đã kết sổ</p>
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
        <CardContent className="px-0 pt-0 pb-0">
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
                  <TableHead className="pr-5 text-center">{COL.hasWinner}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : draws.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <p className="text-muted-foreground text-sm font-medium">Chưa có dữ liệu</p>
                      <p className="text-muted-foreground text-xs">Vòng này chưa có kỳ quay nào đã tính thưởng.</p>
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
            <div className="bg-muted/20 flex items-center justify-between border-t px-5 py-3">
              <p className="text-muted-foreground text-xs tabular-nums">
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
      <div className="bg-muted/30 flex h-9 w-52 items-center justify-center rounded-md border">
        <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
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
        {isActive && <span className="text-profit ml-1 text-xs">(hiện tại)</span>}
      </span>
      {/* Mega 6/45 chỉ đóng khi có winner — không có split */}
      {!isActive && cycle.closeReason === "winner" && <Sparkles className="text-profit size-3" />}
    </span>
  );
}

// ─────────────────────────────────────────────
// Table Row
// ─────────────────────────────────────────────

function HistoryRow({ item }: { item: JackpotHistoryItem }) {
  const isWinner = item.hasWinner;

  // Tỷ lệ % công ty thu, hiển thị 1 chữ số thập phân
  const companyTakeRatePct = item.companyTakeRate > 0 ? `${(item.companyTakeRate * 100).toFixed(1)}%` : null;

  return (
    <TableRow className={cn("transition-colors", isWinner && "bg-game-mega645/50")}>
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
                <span className="decoration-muted-foreground/50 cursor-default underline decoration-dashed underline-offset-2">
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
          <span className="text-profit inline-flex items-center justify-end gap-0.5 text-sm">
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="tabular-nums">{formatNumber(item.contribution)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      {/* Cuối kỳ */}
      <TableCell className="text-game-mega645 text-right text-sm font-semibold tabular-nums">
        {formatNumber(item.closingAmount)}
      </TableCell>

      {/* Jackpot (hasWinner) */}
      <TableCell className="pr-5 text-center">
        {isWinner ? (
          <Badge className="border-game-mega645/30 bg-game-mega645/15 text-game-mega645 gap-1">
            <Sparkles className="size-3" />
            Trúng
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
