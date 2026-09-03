"use client";

import Link from "next/link";

import { displayVNDateTime } from "@megawin/shared/utils/date";
import { TxLogEventType, TxLogStatus } from "@megawin/tenant-gateway/entities";
import {
  TX_LOG_EVENT_TYPE_LABELS,
  TX_LOG_STATUS_LABELS,
  TX_LOG_STATUS_VARIANT,
} from "@megawin/tenant-gateway/shared/labels";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { useTxLogDetail } from "../_lib/use-queries";

export interface TxLogDetailDrawerProps {
  /** `null` = đóng drawer. */
  tx: string | null;
  onClose: () => void;
}

/**
 * Pretty-print JSON string đã lưu trong log.
 *
 * Payload trong DB là raw JSON string (xem `TxLogDoc.requestPayload/responsePayload`).
 * Parse → stringify lại với indent 2 để hiển thị đẹp. Nếu parse fail (data
 * cũ hoặc corrupt), trả về string gốc để vẫn có thể đọc thô.
 *
 * Return `""` khi không có payload hoặc là `"null"` — FE sẽ render empty state.
 */
function formatPayload(payload: string | undefined): string {
  if (!payload || payload === "null") return "";
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

export function TxLogDetailDrawer({ tx, onClose }: TxLogDetailDrawerProps) {
  const isOpen = !!tx;
  const { data, isLoading, error } = useTxLogDetail(tx);
  const log = data?.data;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-160">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-lg font-semibold">Chi tiết giao dịch</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Audit trail — request/response gửi đến tenant.
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

          {!isLoading && !error && log && (
            <div className="flex flex-col gap-5 px-5 py-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={TX_LOG_STATUS_VARIANT[log.status]} className="text-xs">
                  {TX_LOG_STATUS_LABELS[log.status]}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {TX_LOG_EVENT_TYPE_LABELS[log.eventType]}
                </Badge>
                <span className="font-mono text-sm text-muted-foreground">{log.tenantId}</span>
                <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                  {displayVNDateTime(log.createdAt)}
                </span>
              </div>

              {/* Identity */}
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <Field label="Tx ID">
                  <span className="break-all font-mono text-sm">{log.tx}</span>
                </Field>
                <Field label="Batch ID">
                  <div className="flex items-center gap-2">
                    <span className="break-all font-mono text-sm">{log.batchId}</span>
                    {log.eventType === TxLogEventType.BatchTransaction && (
                      <Button asChild size="sm" variant="link" className="h-6 px-1 text-xs">
                        <Link prefetch={false} href={`/reports/transactions/api-logs/batches/${log.batchId}`}>Xem batch</Link>
                      </Button>
                    )}
                  </div>
                </Field>
              </div>

              {/* Error box — chỉ hiện khi failed */}
              {log.status === TxLogStatus.Failed && log.error && (
                <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-semibold text-destructive">
                      {log.error.code}
                    </span>
                    {log.error.httpStatus !== undefined && (
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        HTTP {log.error.httpStatus}
                      </span>
                    )}
                    {log.error.batchOuterRejected && (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Batch bị reject toàn bộ
                      </span>
                    )}
                  </div>
                  <p className="wrap-break-words text-sm text-destructive">{log.error.message}</p>
                </div>
              )}

              {/* Request */}
              <PayloadSection title="Request payload" json={formatPayload(log.requestPayload)} />

              {/* Response */}
              <PayloadSection
                title="Response payload"
                json={formatPayload(log.responsePayload)}
                emptyHint="Không có response (timeout / network / HTTP error không parse được body)."
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[70px] shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PayloadSection({ title, json, emptyHint }: { title: string; json: string; emptyHint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {json ? (
        <pre className="max-h-90 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {json}
        </pre>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {emptyHint ?? "—"}
        </p>
      )}
    </div>
  );
}
