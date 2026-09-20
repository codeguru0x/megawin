"use client";

import {
  AuditActionLabel,
  AuditActorTypeLabel,
  AuditCategoryLabel,
  AuditStatus,
  AuditStatusLabel,
  AuditTargetTypeLabel,
  type AuditLogEntity,
} from "@megawin/audit/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { AlertCircle, Loader2 } from "lucide-react";

import { GameBadge } from "@/components/game-badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface AuditLogDetailSheetProps {
  /** `null` = đóng drawer. */
  id: string | null;
  onClose: () => void;
  /**
   * Kết quả fetch chi tiết record — dependency-injected bởi parent (admin hoặc
   * self-scoped). Sheet chỉ render, KHÔNG tự chọn endpoint. Trang admin truyền
   * `useAuditLogDetail(id)`; trang "Nhật ký của tôi" truyền hook self-scoped gọi
   * `/me/audit-logs/{id}`. Nhờ vậy 1 component UISheet dùng chung cho cả hai.
   */
  query: {
    data: AuditLogEntity | undefined;
    isLoading: boolean;
    error: Error | null;
  };
}

/**
 * Pretty-print 1 value trong diff.
 *
 * - Mảng (winningNumbers, `rates=0.2`…) → nối bằng ", " cho dễ đọc trên 1 dòng.
 * - Object → JSON indent 2 (fallback, hiếm khi xảy ra vì `changes` đã phẳng hoá).
 * - Primitive → `String`.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[unserializable]";
    }
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return "";
}

/**
 * Tập hợp key thay đổi giữa before/after (shallow) để tô sáng ở diff view.
 * Chỉ so sánh top-level key — đủ cho hầu hết mutation config/draw.
 */
function changedKeys(before: unknown, after: unknown): Set<string> {
  const keys = new Set<string>();
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (typeof b !== "object" || typeof a !== "object") {
    return keys;
  }
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      keys.add(k);
    }
  }
  return keys;
}

export function AuditLogDetailSheet({ id, onClose, query }: AuditLogDetailSheetProps) {
  const isOpen = !!id;
  const { data: log, isLoading, error } = query;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-160">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="text-lg font-semibold">Chi tiết thao tác</SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            Bản ghi audit — ai làm gì, lên đối tượng nào, kết quả ra sao.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="text-muted-foreground flex h-60 items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Đang tải…</span>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="text-destructive/60 size-8" />
              <p className="text-destructive text-sm font-medium">Không tải được chi tiết</p>
              <p className="text-muted-foreground text-xs">{error.message}</p>
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
  const worker = log.metadata?.worker;
  const extra = log.metadata?.extra;
  // IP là top-level indexed field (forensic) — hiển thị cạnh actor ("Thực hiện
  // bởi"). userAgent/requestId gom trong metadata.http (không index, chỉ hiển
  // thị/correlation) → thuộc khối "Nội dung" kỹ thuật.
  const ip = log.ip;
  const http = log.metadata?.http;
  const hasChanges = log.changes && (log.changes.before !== undefined || log.changes.after !== undefined);
  const diffKeys = hasChanges ? changedKeys(log.changes?.before, log.changes?.after) : new Set<string>();

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
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
            {AuditCategoryLabel[log.category]}
          </span>
          <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
            {displayVNDateTime(log.ts)}
          </span>
        </div>
        <h2 className="text-base leading-tight font-semibold">{actionLabel}</h2>
      </div>

      {/* Actor + target — 2 khối gọn, mã ID inline nhỏ dưới tên */}
      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">Thực hiện bởi</span>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{log.actorName}</span>
            <span className="bg-muted text-muted-foreground text-3xs shrink-0 rounded px-1.5 py-0.5 font-medium tracking-wide uppercase">
              {AuditActorTypeLabel[log.actorType]}
            </span>
          </div>
          {/* Roles + IP trên cùng 1 hàng flex-wrap: roles là text (truncate khi
              dài), IP là badge shrink-0 (như badge actorType) — luôn cạnh actor,
              không đẩy layout xuống dòng lệch với cột "Đối tượng". IP thuộc
              "who/where", luôn có với thao tác của người (chỉ vắng ở worker). */}
          {(log.actorRoles.length > 0 || ip) && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {log.actorRoles.length > 0 && (
                <span className="text-muted-foreground min-w-0 truncate text-xs" title={log.actorRoles.join(", ")}>
                  {log.actorRoles.join(", ")}
                </span>
              )}
              {ip && (
                <span
                  className="bg-muted text-muted-foreground text-3xs shrink-0 rounded px-1.5 py-0.5 font-mono font-medium"
                  title="Địa chỉ IP"
                >
                  {ip}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">Đối tượng</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-sm">{AuditTargetTypeLabel[log.targetType]}</span>
            {log.game && <GameBadge gameProduct={log.game} />}
          </div>
          {(log.targetLabel || log.targetId) && (
            <span
              className="text-muted-foreground/70 text-2xs truncate font-mono"
              title={log.targetLabel || log.targetId}
            >
              {log.targetLabel || log.targetId}
            </span>
          )}
          {log.tenantId && <span className="text-muted-foreground truncate text-xs">Tenant: {log.tenantId}</span>}
        </div>
      </div>

      {/* Error box — chỉ hiện khi failure */}
      {!isSuccess && (log.errorCode || log.errorMessage) && (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-md border p-3">
          {log.errorCode && (
            <span className="bg-destructive/15 text-destructive w-fit rounded px-2 py-0.5 font-mono text-xs font-semibold">
              {log.errorCode}
            </span>
          )}
          {log.errorMessage && <p className="wrap-break-words text-destructive text-sm">{log.errorMessage}</p>}
        </div>
      )}

      {/* Diff before/after. Config chỉ ghi `after` → hiển thị 1 cột. Status
          transition có cả before/after → 2 cột so sánh. */}
      {hasChanges && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            Thay đổi
            {diffKeys.size > 0 && (
              <span className="text-3xs rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 tabular-nums dark:text-amber-300">
                {diffKeys.size}
              </span>
            )}
          </h3>
          {log.changes?.before !== undefined ? (
            <div className="grid grid-cols-2 gap-2">
              <DiffPane title="Trước" value={log.changes.before} highlight={diffKeys} />
              <DiffPane title="Sau" value={log.changes.after} highlight={diffKeys} />
            </div>
          ) : (
            <DiffPane title="Giá trị mới" value={log.changes?.after} highlight={diffKeys} />
          )}
        </div>
      )}

      {/* Nội dung — HTTP context kỹ thuật + worker + metadata bổ sung. IP đã
          hiển thị cạnh actor nên KHÔNG lặp ở đây. */}
      {(http?.userAgent || http?.requestId || worker || extra) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Nội dung</h3>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            {http?.userAgent && (
              <Field label="Thiết bị">
                <span className="text-xs break-all">{http.userAgent}</span>
              </Field>
            )}
            {http?.requestId && (
              <Field label="Request ID">
                <span className="font-mono text-xs break-all">{http.requestId}</span>
              </Field>
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
                    <span className="font-mono text-xs break-all">{worker.executionId}</span>
                  </Field>
                )}
              </>
            )}
            {extra && Object.keys(extra).length > 0 && (
              <Field label="Bổ sung">
                <pre className="bg-muted/40 max-h-50 overflow-auto rounded p-2 font-mono text-xs leading-relaxed">
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
      <span className="text-muted-foreground w-[90px] shrink-0 pt-0.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DiffPane({ title, value, highlight }: { title: string; value: unknown; highlight: Set<string> }) {
  const formatted = formatValue(value);
  const isObject = value !== null && typeof value === "object";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-3xs font-medium tracking-wide uppercase">{title}</span>
      {formatted ? (
        isObject ? (
          <div className="bg-muted/40 flex flex-col gap-0.5 rounded-md border p-2 font-mono text-xs">
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
              <div
                key={k}
                className={cn(
                  "wrap-break-words",
                  highlight.has(k) && "rounded bg-amber-500/15 px-1 text-amber-800 dark:text-amber-300",
                )}
              >
                <span className="text-muted-foreground">{k}:</span> {formatValue(v)}
              </div>
            ))}
          </div>
        ) : (
          <pre className="wrap-break-words bg-muted/40 rounded-md border p-2 font-mono text-xs">{formatted}</pre>
        )
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed px-2 py-3 text-center text-xs">—</p>
      )}
    </div>
  );
}
