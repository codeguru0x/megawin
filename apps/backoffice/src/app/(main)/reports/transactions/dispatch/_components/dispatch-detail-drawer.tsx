"use client";

import Link from "next/link";

import { toTenantUsername } from "@megawin/shared/utils";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { formatNumber } from "@megawin/shared/utils/number";
import type { TenantDispatchOrderEntity } from "@megawin/tenant-dispatch/entities";
import { DispatchOrderStatus } from "@megawin/tenant-dispatch/entities";
import {
  DISPATCH_ORDER_STATUS_LABELS,
  DISPATCH_ORDER_STATUS_VARIANT,
  DISPATCH_SOURCE_KIND_LABELS,
} from "@megawin/tenant-dispatch/shared/labels";
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { useDispatchDetail } from "../_lib/use-queries";

export interface DispatchDetailDrawerProps {
  /** `null` = đóng drawer. */
  tx: string | null;
  onClose: () => void;
  /** Callback mở dialog huỷ order. */
  onRequestCancel: (tx: string) => void;
}

/** Pretty-print JSON — null safe. */
function prettyJSON(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function DispatchDetailDrawer({ tx, onClose, onRequestCancel }: DispatchDetailDrawerProps) {
  const isOpen = !!tx;
  const { data: order, isLoading, error } = useDispatchDetail(tx);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-170">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-lg font-semibold">Chi tiết dispatch order</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Outbox entry — payload gửi tenant + timeline retry.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Đang tải…</span>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="size-8 text-destructive/60" />
              <p className="text-sm font-medium text-destructive">Không tải được chi tiết</p>
              <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
            </div>
          )}

          {!isLoading && !error && !order && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Không tìm thấy order với Tx này.</p>
            </div>
          )}

          {!isLoading && !error && order && (
            <div className="flex flex-col gap-5 px-5 py-4">
              {/* Summary row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={DISPATCH_ORDER_STATUS_VARIANT[order.status]} className="text-xs">
                  {DISPATCH_ORDER_STATUS_LABELS[order.status]}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {DISPATCH_SOURCE_KIND_LABELS[order.sourceKind]}
                </Badge>
                <span className="font-mono text-sm text-muted-foreground">{order.tenantId}</span>
                <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                  {displayVNDateTime(order.createdAt)}
                </span>
              </div>

              {/* Identity box */}
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <Field label="Tx ID">
                  <span className="truncate font-mono text-sm" title={order.tx}>
                    {order.tx}
                  </span>
                </Field>
                <Field label="Batch Key">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm" title={order.batchKey}>
                    {order.batchKey}
                  </span>
                  <Button asChild size="sm" variant="link" className="h-6 shrink-0 px-1 text-xs">
                    <Link prefetch={false} href={`/reports/transactions/dispatch/batches/${encodeURIComponent(order.batchKey)}`}>
                      Xem batch
                    </Link>
                  </Button>
                </Field>
                <Field label="Nguồn">
                  <span
                    className="truncate font-mono text-sm"
                    title={`${order.gameId} · ${order.sourceKind} · ${order.sourceId}`}
                  >
                    {order.gameId} · {order.sourceKind} · {order.sourceId}
                  </span>
                </Field>
                <Field label="Player">
                  <span className="truncate font-mono text-sm" title={order.username}>
                    {order.username}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">({order.accountId})</span>
                </Field>
                <Field label="Amount">
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatNumber(order.amount)}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">{order.currency}</span>
                </Field>
              </div>

              {/* Retry timeline — conditional: happy path (không retry) chỉ hiện 1 dòng */}
              <RetryTimelineBlock order={order} />

              {/* Payload — shape EXACT như gửi tenant qua BatchTransactionItem */}
              <PayloadSection
                title="Payload gửi tenant"
                json={prettyJSON({
                  action: order.action,
                  reason: order.reason,
                  tx: order.tx,
                  playerId: toTenantUsername(order.username),
                  amount: order.amount,
                  currency: order.currency,
                  gameId: order.gameId,
                  roundIds: order.roundIds,
                  description: order.description,
                  force: order.force,
                  metadata: order.metadata,
                })}
              />

              {/* Source context (internal) */}
              {order.sourceContext && (
                <PayloadSection title="Source context (internal)" json={prettyJSON(order.sourceContext)} />
              )}
            </div>
          )}
        </div>

        {order && order.status === DispatchOrderStatus.Pending && (
          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
            <Button size="sm" variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onRequestCancel(order.tx)} className="gap-1">
              <XCircle className="size-3.5" />
              Huỷ order
            </Button>
          </div>
        )}
        {order &&
          (order.status === DispatchOrderStatus.Dispatched || order.status === DispatchOrderStatus.Cancelled) && (
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {order.status === DispatchOrderStatus.Dispatched ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-profit" />
                    <span>
                      Đã dispatch thành công
                      {order.dispatchedAt && (
                        <>
                          {" lúc "}
                          <span className="font-mono tabular-nums text-foreground">
                            {displayVNDateTime(order.dispatchedAt)}
                          </span>
                        </>
                      )}
                      .
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5 text-muted-foreground" />
                    Order đã bị huỷ.
                  </>
                )}
              </span>
              <Button size="sm" variant="outline" onClick={onClose}>
                Đóng
              </Button>
            </div>
          )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[110px] shrink-0 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Retry timeline section — adaptive tùy tình trạng order:
 *
 * - **Dispatched + 0 retry** (happy path): chỉ 1 dòng `Dispatched at ...` inline,
 *   không render card "Retry timeline" (giảm noise cho 99% orders).
 * - **Có retry hoặc đang pending**: render full card với retry count, last/next
 *   attempt, last error (nếu có).
 * - **Cancelled**: render card gọn, không show next attempt.
 */
function RetryTimelineBlock({ order }: { order: TenantDispatchOrderEntity }) {
  const retryCount = order.retryCount ?? 0;
  const hasErrorOrRetry = retryCount > 0 || !!order.lastError;
  const isDispatched = order.status === DispatchOrderStatus.Dispatched;
  const isPending = order.status === DispatchOrderStatus.Pending;

  if (isDispatched && !hasErrorOrRetry) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm">
        <CheckCircle2 className="size-4 text-profit" />
        <span className="text-muted-foreground">Dispatch ngay lần đầu — không có retry.</span>
        {order.dispatchedAt && (
          <span className="ml-auto font-mono tabular-nums text-foreground">
            {displayVNDateTime(order.dispatchedAt)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Retry timeline</h3>
      <Field label="Retry count">
        <span className="font-mono text-sm tabular-nums">{retryCount}</span>
      </Field>
      {(retryCount > 0 || order.lastAttemptAt) && (
        <Field label="Last attempt">
          <span className="font-mono text-sm tabular-nums">
            {order.lastAttemptAt ? displayVNDateTime(order.lastAttemptAt) : "—"}
          </span>
        </Field>
      )}
      {isPending && order.nextAttemptAt && (
        <Field label="Next attempt">
          <span className="font-mono text-sm tabular-nums">{displayVNDateTime(order.nextAttemptAt)}</span>
        </Field>
      )}
      {order.dispatchedAt && (
        <Field label="Dispatched">
          <span className="font-mono text-sm tabular-nums text-profit">{displayVNDateTime(order.dispatchedAt)}</span>
        </Field>
      )}
      {order.lastError && (
        <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="wrap-break-words text-sm text-destructive">{order.lastError}</p>
        </div>
      )}
    </div>
  );
}

function PayloadSection({ title, json }: { title: string; json: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {json ? (
        <pre className="max-h-90 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {json}
        </pre>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}
