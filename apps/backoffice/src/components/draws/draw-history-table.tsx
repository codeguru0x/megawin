"use client";

/**
 * DrawHistoryTable — Bảng lịch sử kỳ quay dùng chung cho tất cả game.
 *
 * Chứa toàn bộ UI: filter bar (trạng thái + date range), bảng dữ liệu, phân trang.
 * Các game chỉ khác nhau ở cột Kết quả và badge trạng thái → truyền vào qua render props.
 *
 * Dữ liệu tài chính (tiền cược, trả thưởng, GGR, hoa hồng, lợi nhuận ròng) dùng chung
 * cho mọi game — tính từ CommonDrawSummary.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FinancialDateRangePicker } from "@/components/date-picker/financial-date-range-picker";
import { getNetProfitColor } from "@/components/reports/payout-ratio";
import { cn } from "@/lib/utils";
import { formatNumber, formatVNTime } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { DrawStatus } from "@megawin/game-core/entities";

// ─── Status options ───────────────────────────────────────────────────────────

/**
 * Danh sách tuỳ chọn trạng thái kỳ quay cho filter.
 * Dùng chung cho tất cả game.
 */
export const DRAW_HISTORY_STATUS_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: DrawStatus.Settled, label: "Hoàn tất" },
  { value: DrawStatus.Published, label: "Đã có kết quả" },
  { value: DrawStatus.SalesClosed, label: "Đóng bán" },
  { value: DrawStatus.Void, label: "Đã huỷ" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Dữ liệu chung của một kỳ quay dùng cho bảng lịch sử.
 * Tất cả game đều có các field này — financial fields optional vì chỉ có sau settle.
 */
export interface CommonDrawSummary {
  /** ID nội bộ. */
  id: string;
  /** Business key kỳ quay (ví dụ: "2026-03-07.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số thứ tự kỳ trong ngày hoặc trong năm. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở. */
  openAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt: string;
  /** Trạng thái kỳ quay (DrawStatus string). */
  status: string;
  /** Tổng số phiếu cược (entries). */
  totalEntries?: number;
  /** Tổng tiền cược (VND). */
  totalRevenue?: number;
  /**
   * Tổng trả thưởng thực tế (cố định + jackpot) (VND).
   * Chỉ có sau khi settle.
   */
  totalPayout?: number;
  /** Tổng hoa hồng đại lý (VND). Chỉ có sau khi settle. */
  totalAgentCommission?: number;
}

export interface DrawHistoryTableProps<T extends CommonDrawSummary> {
  /** Danh sách kỳ quay. */
  draws: T[];
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  hasMore: boolean;
  /** Ngày bắt đầu filter (YYYY-MM-DD). */
  fromDate: string;
  /** Ngày kết thúc filter (YYYY-MM-DD). */
  toDate: string;
  /** Giá trị trạng thái đang chọn ("all" hoặc DrawStatus). */
  statusValue: string;
  onDateChange: (from: string, to: string) => void;
  onStatusChange: (value: string) => void;
  onPageNext: () => void;
  onPagePrev: () => void;
  /** Gọi khi click vào row → thường là navigate sang trang vận hành. */
  onRowClick: (draw: T) => void;
  /**
   * Render cột Kết quả — khác nhau giữa các game.
   * Trả về `null` hoặc `undefined` → hiển thị "—".
   */
  renderResult: (draw: T) => ReactNode;
  /**
   * Render badge trạng thái — khác nhau giữa các game.
   */
  renderStatusBadge: (status: string) => ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Bảng lịch sử kỳ quay dùng chung cho tất cả game.
 *
 * Game-specific logic (kết quả, badge trạng thái) được inject qua render props.
 */
export function DrawHistoryTable<T extends CommonDrawSummary>({
  draws,
  isLoading,
  isFetching,
  page,
  hasMore,
  fromDate,
  toDate,
  statusValue,
  onDateChange,
  onStatusChange,
  onPageNext,
  onPagePrev,
  onRowClick,
  renderResult,
  renderStatusBadge,
}: DrawHistoryTableProps<T>) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Lịch sử kỳ quay</CardTitle>
          {isFetching && !isLoading && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-4 pt-0">
        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Select value={statusValue} onValueChange={onStatusChange}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {DRAW_HISTORY_STATUS_OPTIONS.map((s: { value: string; label: string }) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <FinancialDateRangePicker from={fromDate} to={toDate} onChange={onDateChange} label="" />
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.drawId}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.financialDate}
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Đóng cược
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Mở cược
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Trạng thái
                </TableHead>
                <TableHead className="min-w-52 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Kết quả
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.entryCount}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalStake}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalPayout}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.ggr}
                </TableHead>
                <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalCommission}
                </TableHead>
                <TableHead className="pr-5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {REPORT_COLUMN_LABELS.netProfit}
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : draws.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    Không có kỳ quay nào trong khoảng thời gian đã chọn.
                  </TableCell>
                </TableRow>
              ) : (
                draws.map((draw) => (
                  <DrawRow
                    key={draw.drawId}
                    draw={draw}
                    renderResult={renderResult}
                    renderStatusBadge={renderStatusBadge}
                    onClick={() => onRowClick(draw)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination ── */}
        {draws.length > 0 && (
          <div className="flex items-center justify-between px-5 pt-3">
            <p className="text-sm text-muted-foreground">Trang {page}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={onPagePrev}
                className="h-7 text-sm"
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || isFetching}
                onClick={onPageNext}
                className="h-7 text-sm"
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

function DrawRow<T extends CommonDrawSummary>({
  draw,
  renderResult,
  renderStatusBadge,
  onClick,
}: {
  draw: T;
  renderResult: (draw: T) => ReactNode;
  renderStatusBadge: (status: string) => ReactNode;
  onClick: () => void;
}) {
  // GGR = tiền cược - tổng trả thưởng thực tế (cố định + jackpot)
  const ggr =
    draw.totalRevenue != null && draw.totalPayout != null
      ? draw.totalRevenue - draw.totalPayout
      : undefined;

  // Lợi nhuận ròng = GGR - hoa hồng đại lý
  const netProfit =
    ggr != null && draw.totalAgentCommission != null ? ggr - draw.totalAgentCommission : undefined;

  const resultNode = renderResult(draw);

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      {/* Kỳ quay */}
      <TableCell className="pl-5 font-mono text-sm">{draw.drawId}</TableCell>

      {/* Ngày tài chính */}
      <TableCell className="font-mono text-sm tabular-nums">{draw.financialDate}</TableCell>

      {/* Đóng cược */}
      <TableCell className="font-mono text-sm tabular-nums">
        {formatVNTime(new Date(draw.closeAt))}
      </TableCell>

      {/* Mở cược */}
      <TableCell className="font-mono text-sm tabular-nums">
        {draw.openAt ? formatVNTime(new Date(draw.openAt)) : "—"}
      </TableCell>

      {/* Trạng thái */}
      <TableCell>{renderStatusBadge(draw.status)}</TableCell>

      {/* Kết quả — game-specific */}
      <TableCell>{resultNode ?? <span className="text-xs">—</span>}</TableCell>

      {/* Phiếu cược */}
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalEntries != null && draw.totalEntries > 0 ? formatNumber(draw.totalEntries) : "—"}
      </TableCell>

      {/* Tiền cược */}
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalRevenue != null && draw.totalRevenue > 0 ? formatNumber(draw.totalRevenue) : "—"}
      </TableCell>

      {/* Trả thưởng */}
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalPayout != null ? formatNumber(draw.totalPayout) : "—"}
      </TableCell>

      {/* Doanh thu thuần (GGR) */}
      <TableCell className="text-right tabular-nums text-sm">
        {ggr != null ? formatNumber(ggr) : "—"}
      </TableCell>

      {/* Hoa hồng đại lý */}
      <TableCell className="text-right tabular-nums text-sm">
        {draw.totalAgentCommission != null ? formatNumber(draw.totalAgentCommission) : "—"}
      </TableCell>

      {/* Lợi nhuận ròng — chỉ cột này có color */}
      <TableCell
        className={cn(
          "pr-5 text-right tabular-nums text-sm font-medium",
          netProfit != null ? getNetProfitColor(netProfit) : "",
        )}
      >
        {netProfit != null ? formatNumber(netProfit) : "—"}
      </TableCell>
    </TableRow>
  );
}
