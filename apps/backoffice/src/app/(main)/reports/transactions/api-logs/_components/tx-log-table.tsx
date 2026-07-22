"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, Loader2, XCircle } from "lucide-react";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { formatNumber } from "@megawin/shared/utils/number";
import { TRANSACTION_ACTION_LABELS, TRANSACTION_REASON_LABELS } from "@megawin/game-core/labels";
import type { TransactionAction, TransactionReason } from "@megawin/shared/types";
import type { TxLogEntity } from "@megawin/tenant-gateway/entities";
import { TxLogEventType, TxLogStatus } from "@megawin/tenant-gateway/entities";
import {
  TX_LOG_STATUS_LABELS,
  TX_LOG_EVENT_TYPE_LABELS,
} from "@megawin/tenant-gateway/shared/labels";

import { Button } from "@/components/ui/button";
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

/**
 * Shape rút gọn từ `TxLogDoc.requestPayload` — dùng để hiển thị cột
 * action / reason / player / amount / game trong bảng.
 *
 * Payload raw JSON string (xem `TxLogDoc.requestPayload`) — nội dung là
 * {@link TransactionRequest} hoặc {@link BatchTransactionItem}, cả 2 share
 * cùng 5 field này ở top-level.
 */
interface RequestPayloadSummary {
  action?: TransactionAction;
  reason?: TransactionReason;
  playerId?: string;
  amount?: number;
  currency?: string;
  gameId?: string;
}

/**
 * Parse `requestPayload` JSON string → summary dùng cho render cell.
 *
 * Defensive — truncated / malformed payload → trả object rỗng, cell hiển thị "—".
 */
function parseRequestSummary(raw: string | undefined): RequestPayloadSummary {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.__truncated) return {};
    return {
      action: parsed.action as TransactionAction | undefined,
      reason: parsed.reason as TransactionReason | undefined,
      playerId: typeof parsed.playerId === "string" ? parsed.playerId : undefined,
      amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
      currency: typeof parsed.currency === "string" ? parsed.currency : undefined,
      gameId: typeof parsed.gameId === "string" ? parsed.gameId : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Truncate string ở giữa — e.g. "abc…xyz".
 * Dùng cho batchId để hiển thị 8 ký tự đầu.
 */
function shortId(value: string, head = 8): string {
  if (value.length <= head) return value;
  return `${value.slice(0, head)}…`;
}

export interface TxLogTableProps {
  /** Data đã flatten từ infinite query pages. */
  rows: TxLogEntity[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onOpenDetail: (tx: string) => void;
  /** Khi true, ẩn cột BatchId (trang batch detail đã filter sẵn 1 batch). */
  hideBatchColumn?: boolean;
}

export function TxLogTable({
  rows,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onOpenDetail,
  hideBatchColumn,
}: TxLogTableProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải nhật ký…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-1 text-center">
        <Inbox className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Không có dữ liệu</p>
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
              <TableHead className="w-[170px] pl-5">Thời gian</TableHead>
              <TableHead className="w-15 text-center">Trạng thái</TableHead>
              <TableHead className="w-[90px]">Loại</TableHead>
              <TableHead className="w-30">Tenant</TableHead>
              <TableHead className="w-25">Action</TableHead>
              <TableHead className="w-30">Lý do</TableHead>
              <TableHead className="w-35">Người chơi</TableHead>
              <TableHead className="w-30">Game</TableHead>
              <TableHead className="w-35 text-right">Số tiền</TableHead>
              <TableHead className="w-70">Tx ID</TableHead>
              {!hideBatchColumn && <TableHead className="w-35">Batch</TableHead>}
              <TableHead className="pr-5">Lỗi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isBatch = row.eventType === TxLogEventType.BatchTransaction;
              const isSuccess = row.status === TxLogStatus.Success;
              const errCode = row.error?.code;
              const errMsg = row.error?.message;
              const req = parseRequestSummary(row.requestPayload);

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
                    {isSuccess ? (
                      <CheckCircle2
                        className="inline-block size-4 text-profit"
                        aria-label={TX_LOG_STATUS_LABELS[row.status]}
                      />
                    ) : (
                      <XCircle
                        className="inline-block size-4 text-loss"
                        aria-label={TX_LOG_STATUS_LABELS[row.status]}
                      />
                    )}
                    <span className="sr-only">{TX_LOG_STATUS_LABELS[row.status]}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {TX_LOG_EVENT_TYPE_LABELS[row.eventType]}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.tenantId}</TableCell>

                  {/* Action — pill semantic color (debit rose / credit emerald) */}
                  <TableCell className="text-sm">
                    {req.action ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                          req.action === "debit"
                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {TRANSACTION_ACTION_LABELS[req.action]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {req.reason ? TRANSACTION_REASON_LABELS[req.reason] : "—"}
                  </TableCell>

                  {/* Player ID — đây là tenant-side playerId gửi đi (đã strip @tenantId) */}
                  <TableCell
                    className="max-w-35 truncate font-mono text-sm"
                    title={req.playerId ?? undefined}
                  >
                    {req.playerId ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  <TableCell className="text-sm">
                    {req.gameId ? getGameLabel(req.gameId) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {typeof req.amount === "number" ? (
                      formatNumber(req.amount)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <span className="truncate font-mono text-sm">{row.tx}</span>
                  </TableCell>
                  {!hideBatchColumn && (
                    <TableCell>
                      {isBatch ? (
                        <button
                          type="button"
                          className="font-mono text-sm text-primary underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/reports/transactions/api-logs/batches/${row.batchId}`);
                          }}
                          title={row.batchId}
                        >
                          {shortId(row.batchId)}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="pr-5 text-sm text-muted-foreground">
                    {errCode ? (
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive">
                          {errCode}
                        </span>
                        <span className="truncate">{errMsg}</span>
                      </div>
                    ) : (
                      "—"
                    )}
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
