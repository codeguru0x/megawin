"use client";

import type { AuditLogEntity } from "@megawin/audit/entities";
import { AuditActionLabel, AuditActorTypeLabel, AuditCategoryLabel, AuditStatus } from "@megawin/audit/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, XCircle } from "lucide-react";

import { GameBadge } from "@/components/game-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface AuditLogsTableProps {
  /** Data 1 trang audit log (đã unwrap). */
  rows: AuditLogEntity[];
  /** Fetch trang đầu (chưa có data) — hiện skeleton loader toàn bảng. */
  isLoading: boolean;
  /** Đang fetch (kể cả chuyển trang) — dim nội dung + disable nút. */
  isFetching: boolean;
  /** Số trang 0-based (độ sâu cursor stack) — hiển thị "Trang N". */
  pageIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenDetail: (id: string) => void;
}

export function AuditLogsTable({
  rows,
  isLoading,
  isFetching,
  pageIndex,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onOpenDetail,
}: AuditLogsTableProps) {
  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải lịch sử…</span>
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
      <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px] pl-5">Thời gian</TableHead>
              <TableHead className="w-55">Người thực hiện</TableHead>
              <TableHead className="w-70">Hành động</TableHead>
              <TableHead>Đối tượng</TableHead>
              <TableHead className="w-30 pr-5 text-center">Kết quả</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSuccess = row.status === AuditStatus.Success;
              const actionLabel = AuditActionLabel[row.action] ?? row.action;
              const targetText = row.targetLabel || row.targetId;

              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onOpenDetail(row.id)}
                >
                  <TableCell className="pl-5 font-mono text-sm tabular-nums">{displayVNDateTime(row.ts)}</TableCell>

                  {/* Actor — tên + badge loại + roles gọn trên 1 dòng (roles nối "·") */}
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{row.actorName}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {AuditActorTypeLabel[row.actorType]}
                      </span>
                      {row.actorRoles.length > 0 && (
                        <span className="truncate text-xs text-muted-foreground" title={row.actorRoles.join(", ")}>
                          · {row.actorRoles.join(", ")}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Hành động — label + badge category */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{actionLabel}</span>
                      <span className="w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {AuditCategoryLabel[row.category]}
                      </span>
                    </div>
                  </TableCell>

                  {/* Đối tượng — label tự mô tả + game badge màu. Loại đối tượng suy ra từ label
                      (thường lặp: "Cấu hình game Keno"); chi tiết "đổi gì" xem drawer. */}
                  <TableCell className="text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {targetText && <span className="truncate">{targetText}</span>}
                      {row.game && <GameBadge gameProduct={row.game} />}
                    </div>
                  </TableCell>

                  {/* Kết quả — icon + errorCode nếu fail */}
                  <TableCell className="pr-5 text-center">
                    {isSuccess ? (
                      <CheckCircle2 className="inline-block size-4 text-profit" aria-label="Thành công" />
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive",
                        )}
                        title={row.errorMessage}
                      >
                        <XCircle className="size-3.5" />
                        <span className="font-mono">{row.errorCode ?? "Lỗi"}</span>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between border-t px-5 py-3">
          <span className="text-xs text-muted-foreground tabular-nums">Trang {pageIndex + 1}</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!hasPrev || isFetching}
              onClick={onPrev}
            >
              <ChevronLeft className="size-3.5" />
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!hasNext || isFetching}
              onClick={onNext}
            >
              Sau
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
