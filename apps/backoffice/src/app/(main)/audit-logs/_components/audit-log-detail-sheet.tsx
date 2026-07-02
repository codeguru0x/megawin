"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import type { AuditLogEntity } from "@megawin/audit/entities";
import {
  AuditActionLabel,
  AuditActorTypeLabel,
  AuditCategoryLabel,
  AuditStatus,
  AuditStatusLabel,
  AuditTargetTypeLabel,
} from "@megawin/audit/entities";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GameBadge } from "@/components/game-badge";
import { cn } from "@/lib/utils";

import { useAuditLogDetail } from "../_lib/use-queries";

export interface AuditLogDetailSheetProps {
  /** `null` = đóng drawer. */
  id: string | null;
  onClose: () => void;
}

/**
 * Pretty-print 1 value trong diff.
 *
 * - Mảng (winningNumbers, `rates=0.2`…) → nối bằng ", " cho dễ đọc trên 1 dòng.
 * - Object → JSON indent 2 (fallback, hiếm khi xảy ra vì `changes` đã phẳng hoá).
 * - Primitive → `String`.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Tập hợp key thay đổi giữa before/after (shallow) để tô sáng ở diff view.
 * Chỉ so sánh top-level key — đủ cho hầu hết mutation config/draw.
 */
function changedKeys(before: unknown, after: unknown): Set<string> {
  const keys = new Set<string>();
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || typeof a !== "object") return keys;
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) keys.add(k);
  }
  return keys;
}

export function AuditLogDetailSheet({ id, onClose }: AuditLogDetailSheetProps) {
  const isOpen = !!id;
  const { data: log, isLoading, error } = useAuditLogDetail(id);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-lg font-semibold">Chi tiết thao tác</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Bản ghi audit — ai làm gì, lên đối tượng nào, kết quả ra sao.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex h-[240px] items-center justify-center gap-2 text-muted-foreground">
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

          {!isLoading && !error && log && <DetailBody log={log} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ log }: { log: AuditLogEntity }) {
  const isSuccess = log.status === AuditStatus.Success;
  const actionLabel = AuditActionLabel[log.action] ?? log.action;
  const http = log.metadata?.http;
  const worker = log.metadata?.worker;
  const extra = log.metadata?.extra;
  const hasChanges =
    log.changes && (log.changes.before !== undefined || log.changes.after !== undefined);
  const diffKeys = hasChanges
    ? changedKeys(log.changes?.before, log.changes?.after)
    : new Set<string>();

  return (
    <div className="flex flex-col gap-5 px-5 py-4">
      {/* Summary — action là tiêu đề chính, badge trạng thái/nhóm phía trên, thời gian nhỏ dưới */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              isSuccess ? "bg-profit/10 text-profit" : "bg-destructive/10 text-destructive",
            )}
          >
            {AuditStatusLabel[log.status]}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {AuditCategoryLabel[log.category]}
          </span>
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
            {displayVNDateTime(log.ts)}
          </span>
        </div>
        <h2 className="text-base font-semibold leading-tight">{actionLabel}</h2>
      </div>

      {/* Actor + target — 2 khối gọn, mã ID inline nhỏ dưới tên */}
      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Thực hiện bởi
          </span>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{log.actorName}</span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {AuditActorTypeLabel[log.actorType]}
            </span>
          </div>
          {log.actorRoles.length > 0 && (
            <span
              className="truncate text-xs text-muted-foreground"
              title={log.actorRoles.join(", ")}
            >
              {log.actorRoles.join(", ")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Đối tượng
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-sm">{AuditTargetTypeLabel[log.targetType]}</span>
            {log.game && <GameBadge gameProduct={log.game} />}
          </div>
          {(log.targetLabel || log.targetId) && (
            <span
              className="truncate font-mono text-[11px] text-muted-foreground/70"
              title={log.targetLabel || log.targetId}
            >
              {log.targetLabel || log.targetId}
            </span>
          )}
          {log.tenantId && (
            <span className="truncate text-xs text-muted-foreground">Tenant: {log.tenantId}</span>
          )}
        </div>
      </div>

      {/* Error box — chỉ hiện khi failure */}
      {!isSuccess && (log.errorCode || log.errorMessage) && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          {log.errorCode && (
            <span className="w-fit rounded bg-destructive/15 px-2 py-0.5 font-mono text-xs font-semibold text-destructive">
              {log.errorCode}
            </span>
          )}
          {log.errorMessage && (
            <p className="wrap-break-words text-sm text-destructive">{log.errorMessage}</p>
          )}
        </div>
      )}

      {/* Diff before/after. Config chỉ ghi `after` → hiển thị 1 cột. Status
          transition có cả before/after → 2 cột so sánh. */}
      {hasChanges && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Thay đổi
            {diffKeys.size > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300">
                {diffKeys.size}
              </span>
            )}
          </h3>
          {log.changes?.before !== undefined ? (
            <div className="grid grid-cols-2 gap-2">
              <DiffPane title="Trước" value={log.changes.before} highlight={diffKeys} />
              <DiffPane title="Sau" value={log.changes?.after} highlight={diffKeys} />
            </div>
          ) : (
            <DiffPane title="Giá trị mới" value={log.changes?.after} highlight={diffKeys} />
          )}
        </div>
      )}

      {/* Metadata */}
      {(http || worker || extra) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nội dung
          </h3>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            {http && (
              <>
                {http.method && http.path && (
                  <Field label="Request">
                    <span className="break-all font-mono text-xs">
                      {http.method} {http.path}
                    </span>
                  </Field>
                )}
                {http.ip && (
                  <Field label="IP">
                    <span className="font-mono text-xs">{http.ip}</span>
                  </Field>
                )}
                {http.userAgent && (
                  <Field label="User-Agent">
                    <span className="break-all text-xs text-muted-foreground">
                      {http.userAgent}
                    </span>
                  </Field>
                )}
                {http.requestId && (
                  <Field label="Request ID">
                    <span className="break-all font-mono text-xs">{http.requestId}</span>
                  </Field>
                )}
              </>
            )}
            {worker && (
              <>
                {worker.workerName && (
                  <Field label="Worker">
                    <span className="font-mono text-xs">{worker.workerName}</span>
                  </Field>
                )}
                {worker.trigger && (
                  <Field label="Trigger">
                    <span className="font-mono text-xs">{worker.trigger}</span>
                  </Field>
                )}
                {worker.executionId && (
                  <Field label="Execution">
                    <span className="break-all font-mono text-xs">{worker.executionId}</span>
                  </Field>
                )}
              </>
            )}
            {extra && Object.keys(extra).length > 0 && (
              <Field label="Bổ sung">
                <pre className="max-h-[200px] overflow-auto rounded bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                  {formatValue(extra)}
                </pre>
              </Field>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-[90px] shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DiffPane({
  title,
  value,
  highlight,
}: {
  title: string;
  value: unknown;
  highlight: Set<string>;
}) {
  const formatted = formatValue(value);
  const isObject = value !== null && typeof value === "object";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {formatted ? (
        isObject ? (
          <div className="flex flex-col gap-0.5 rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  "wrap-break-words",
                  highlight.has(k) &&
                    "rounded bg-amber-500/15 px-1 text-amber-800 dark:text-amber-300",
                )}
              >
                <span className="text-muted-foreground">{k}:</span> {formatValue(v)}
              </div>
            ))}
          </div>
        ) : (
          <pre className="wrap-break-words rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {formatted}
          </pre>
        )
      ) : (
        <p className="rounded-md border border-dashed px-2 py-3 text-center text-xs text-muted-foreground">
          —
        </p>
      )}
    </div>
  );
}
