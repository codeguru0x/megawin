"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, Loader2, MoreHorizontal, XCircle } from "lucide-react";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { formatNumber } from "@megawin/shared/utils/number";
import { TRANSACTION_ACTION_LABELS, TRANSACTION_REASON_LABELS } from "@megawin/game-core/labels";
import type { TenantDispatchOrderEntity } from "@megawin/tenant-dispatch/entities";
import { DispatchOrderStatus } from "@megawin/tenant-dispatch/entities";
import {
  DISPATCH_ORDER_STATUS_LABELS,
  DISPATCH_SOURCE_KIND_LABELS,
} from "@megawin/tenant-dispatch/shared/labels";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getGameLabel } from "@/lib/game-labels";
import { cn } from "@/lib/utils";

/** Ngưỡng mặc định để highlight retry — match `RETRY_ALERT_THRESHOLD` ở package. */
const STUCK_RETRY_THRESHOLD = 50;

/**
 * Parse batchKey format `{gameId}:{operation}:{entityRef}:{purpose}`.
 *
 * Ví dụ: `"keno:settle:2026-04-11.007:payout"` → `{ game: "keno", op: "settle",
 * ref: "2026-04-11.007", purpose: "payout" }`.
 *
 * Nếu format không khớp, fallback về batchKey gốc ở `ref`.
 */
function parseBatchKey(key: string): {
  game: string;
  op: string;
  ref: string;
  purpose: string;
} {
  const parts = key.split(":");
  if (parts.length < 4) {
    return { game: "", op: "", ref: key, purpose: "" };
  }
  return {
    game: parts[0] ?? "",
    op: parts[1] ?? "",
    ref: parts[2] ?? "",
    purpose: parts[3] ?? "",
  };
}

/** Trả về class màu tương ứng tier retry. */
function getRetryClass(retryCount: number | undefined): string {
  if (!retryCount) return "text-muted-foreground";
  if (retryCount >= STUCK_RETRY_THRESHOLD) return "text-loss font-semibold";
  if (retryCount >= 10) return "text-warning";
  return "text-muted-foreground";
}

export interface DispatchTableProps {
  rows: TenantDispatchOrderEntity[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onOpenDetail: (tx: string) => void;
  onCancel: (tx: string) => void;
  /** Ẩn cột Batch khi đang ở trang batch detail (đã filter sẵn). */
  hideBatchColumn?: boolean;
}

/**
 * Bảng dispatch orders với behavior "progressive disclosure" cho retry/error:
 *
 * - Nếu toàn bộ rows visible không có order nào `retryCount > 0` và không có
 *   `lastError` → ẩn cột gộp "Retry & Lỗi" để giải phóng viewport (happy path).
 * - Ngược lại, cột "Retry & Lỗi" render: số retry (có màu theo ngưỡng) +
 *   truncated error message phía dưới.
 *
 * Amount dùng `formatNumber` (không ký hiệu đơn vị, đồng nhất với report tables
 * theo `financial-report-ui.mdc` §6). Batch key render 2 dòng compact:
 * dòng trên là `{game} · {op} · {purpose}`, dòng dưới là reference (drawId).
 */
export function DispatchTable({
  rows,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onOpenDetail,
  onCancel,
  hideBatchColumn,
}: DispatchTableProps) {
  const router = useRouter();

  // Ẩn cột Retry & Lỗi nếu toàn bộ rows là happy path.
  const showRetryColumn = useMemo(() => {
    return rows.some((r) => (r.retryCount ?? 0) > 0 || !!r.lastError);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải orders…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-1 text-center">
        <Inbox className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Không có dispatch order nào</p>
        <p className="text-xs text-muted-foreground">Thử nới khoảng thời gian hoặc xoá bộ lọc.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40 pl-5">Thời gian</TableHead>
              <TableHead className="w-15 text-center">Trạng thái</TableHead>
              <TableHead className="w-25">Loại</TableHead>
              <TableHead className="w-30">Tenant</TableHead>
              <TableHead className="w-25">Action</TableHead>
              <TableHead className="w-30">Lý do</TableHead>
              <TableHead className="w-35">Người chơi</TableHead>
              <TableHead className="w-30">Game</TableHead>
              <TableHead className="w-35 text-right">Số tiền</TableHead>
              {showRetryColumn && <TableHead>Retry & Lỗi</TableHead>}
              {!hideBatchColumn && <TableHead className="w-50">Batch</TableHead>}
              <TableHead className="w-[50px] pr-5 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isPending = row.status === DispatchOrderStatus.Pending;
              const isCancelled = row.status === DispatchOrderStatus.Cancelled;
              const isDispatched = row.status === DispatchOrderStatus.Dispatched;
              const errMsg = row.lastError;
              const retryCount = row.retryCount ?? 0;
              const batch = parseBatchKey(row.batchKey);

              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onOpenDetail(row.tx)}
                >
                  <TableCell className="pl-5 font-mono text-sm tabular-nums">
                    {displayVNDateTime(row.createdAt)}
                  </TableCell>

                  <TableCell className="text-center">
                    {isPending && (
                      <Loader2
                        className="inline-block size-4 animate-spin text-amber-500"
                        aria-label={DISPATCH_ORDER_STATUS_LABELS[row.status]}
                      />
                    )}
                    {isDispatched && (
                      <CheckCircle2
                        className="inline-block size-4 text-profit"
                        aria-label={DISPATCH_ORDER_STATUS_LABELS[row.status]}
                      />
                    )}
                    {isCancelled && (
                      <XCircle
                        className="inline-block size-4 text-muted-foreground"
                        aria-label={DISPATCH_ORDER_STATUS_LABELS[row.status]}
                      />
                    )}
                    <span className="sr-only">{DISPATCH_ORDER_STATUS_LABELS[row.status]}</span>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {DISPATCH_SOURCE_KIND_LABELS[row.sourceKind]}
                  </TableCell>

                  <TableCell className="font-mono text-sm">{row.tenantId}</TableCell>

                  <TableCell className="text-sm">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                        row.action === "debit"
                          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {TRANSACTION_ACTION_LABELS[row.action]}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {TRANSACTION_REASON_LABELS[row.reason]}
                  </TableCell>

                  <TableCell
                    className="max-w-35 truncate font-mono text-sm"
                    title={row.username}
                  >
                    {row.username}
                  </TableCell>

                  <TableCell className="text-sm">{getGameLabel(row.gameId)}</TableCell>

                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatNumber(row.amount)}
                  </TableCell>

                  {/* Retry & Lỗi — gộp 1 cell */}
                  {showRetryColumn && (
                    <TableCell className="max-w-90 text-sm">
                      {retryCount === 0 && !errMsg ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {retryCount > 0 && (
                            <span
                              className={cn(
                                "font-mono text-sm tabular-nums",
                                getRetryClass(retryCount),
                              )}
                            >
                              {retryCount}× retry
                            </span>
                          )}
                          {errMsg && (
                            <span
                              className="block truncate text-xs text-muted-foreground"
                              title={errMsg}
                            >
                              {errMsg}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}

                  {/* Batch — chip 2 dòng */}
                  {!hideBatchColumn && (
                    <TableCell>
                      <button
                        type="button"
                        className="group flex flex-col items-start gap-0.5 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(
                            `/reports/transactions/dispatch/batches/${encodeURIComponent(row.batchKey)}`,
                          );
                        }}
                        title={row.batchKey}
                      >
                        {batch.op && batch.purpose && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{batch.op}</span>
                            <span className="opacity-40">·</span>
                            <span>{batch.purpose}</span>
                          </span>
                        )}
                        <span className="truncate font-mono text-sm text-primary group-hover:underline">
                          {batch.ref || row.batchKey}
                        </span>
                      </button>
                    </TableCell>
                  )}

                  <TableCell className="pr-5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Mở menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => onOpenDetail(row.tx)}>
                          Xem chi tiết
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!isPending}
                          onClick={() => isPending && onCancel(row.tx)}
                          className={isPending ? "text-destructive focus:text-destructive" : ""}
                        >
                          <XCircle className="size-3.5" />
                          Huỷ order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {hasNextPage && (
        <div className="flex items-center justify-center border-t px-5 py-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Đang tải…
              </>
            ) : (
              "Tải thêm"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
