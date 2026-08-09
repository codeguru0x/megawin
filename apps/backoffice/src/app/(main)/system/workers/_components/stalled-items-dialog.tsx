"use client";

import { calcRelativeTime } from "@megawin/shared/utils";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { STALLED_ALERT_THRESHOLD } from "@megawin/worker-core/use-cases/health";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface StalledItemsDialogProps {
  /** `null` = dialog đóng. */
  row: WorkerHealthRow | null;
  onClose: () => void;
}

/**
 * Chi tiết `stalledItems` của 1 worker — mở từ nút ở cột "Item kẹt" (§2.5j).
 *
 * Dùng `Dialog` (không `Sheet`) vì nội dung ngắn, tối đa `MAX_STALLED_ITEMS` (20) dòng.
 */
export function StalledItemsDialog({ row, onClose }: StalledItemsDialogProps) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Item kẹt — {row.description}</DialogTitle>
              <DialogDescription>
                Các đơn vị công việc đang lỗi lặp lại. Tự biến mất khi item xử lý thành công.
              </DialogDescription>
            </DialogHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-20 text-right">Số lần lỗi</TableHead>
                  <TableHead className="w-28">Kẹt bao lâu</TableHead>
                  <TableHead>Lỗi gần nhất</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.stalledItems.map((item) => (
                  <TableRow key={item.itemKey}>
                    <TableCell className="font-mono text-xs">{item.itemKey}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant={item.failCount >= STALLED_ALERT_THRESHOLD ? "destructive" : "secondary"}>
                        {item.failCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm tabular-nums">
                            {calcRelativeTime(new Date(item.firstFailedAt).toISOString())}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="font-mono tabular-nums">
                          {displayVNDateTime(item.firstFailedAt)}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-52 truncate text-xs text-muted-foreground">
                            {item.lastError}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm break-words">{item.lastError}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
