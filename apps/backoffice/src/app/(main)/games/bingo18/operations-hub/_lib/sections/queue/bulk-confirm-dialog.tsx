"use client";

/**
 * Ops Hub — Bulk Confirm Dialog (guideline §5.6, plan §8.4, p1-09 §12)
 *
 * `BulkConfirmDialog` xác nhận 3 action bulk (settle/close-sales/open-sales): chỉ cần xác nhận
 * số lượng + danh sách kỳ, không cần form nhập gì thêm. Dialog này TÁI SỬ DỤNG cho cả bulk
 * (Bulk Action Bar) và single-row (Expand Panel) — xem `isSingle` bên dưới.
 *
 * VOID đã bỏ HẲN khỏi Ops Hub (p1-07 §10 mục 9, chốt 08/09) — cả bulk (đã bỏ trước đó, §B5.2)
 * VÀ single-row (`VoidConfirmDialog` từng nằm ở đây, đã xoá — huỷ kỳ đòi hỏi review kỹ, không
 * phù hợp là quick action trên panel vận hành nhanh). Thao tác huỷ CHỈ còn ở trang `operations`
 * chi tiết của từng kỳ.
 *
 * Liệt kê TỪNG `drawId` (font-mono, scroll khi dài) — không chỉ đếm số lượng. Đây là dòng chặn
 * cú click sai hàng chục kỳ cùng lúc.
 *
 * P1-09 §12 — khi `targetRows.length > BULK_MAX_DRAWS`, job chạy qua nhiều lô TUẦN TỰ
 * (`useBulkBatchAction`). Dialog nhận thêm `batchState` để render progress ("Lô 2/4 · 100/200
 * kỳ") trong lúc chạy, và bảng tổng kết thành/thất bại khi xong — KHÔNG liệt kê lại kỳ lỗi ở
 * đây (đã hiện inline tại dòng qua `rowErrors`, tránh lặp thông tin — đúng góp ý "chỉ báo tổng
 * số thành/thất, không cần nhắc từng kỳ thành công").
 */

import { formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, Ban, CheckCircle2, Loader2, PlayCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BatchRunnerState } from "@/hooks/use-batch-runner";

import type { DerivedRow } from "../../hub-types";
import { BulkActionKind } from "./queue-types";

/** 3 action bulk còn lại sau khi bỏ Void (§B5.2) — compiler chặn truyền `Void` vào prop `kind`. */
export type BulkDialogActionKind = Exclude<BulkActionKind, typeof BulkActionKind.Void>;

interface ActionCopy {
  title: string;
  verb: string;
  icon: typeof RotateCcw;
  description: string;
}

const ACTION_COPY: Record<BulkDialogActionKind, ActionCopy> = {
  [BulkActionKind.Settle]: {
    title: "Kết sổ hàng loạt",
    verb: "kết sổ",
    icon: RotateCcw,
    description: "Bắt đầu kết sổ cho các kỳ đã chọn. Tiền thắng sẽ được tính và trả cho người chơi.",
  },
  [BulkActionKind.CloseSales]: {
    title: "Đóng bán hàng loạt",
    verb: "đóng bán",
    icon: Ban,
    description: "Đóng nhận cược cho các kỳ đã chọn. Kỳ sẽ chuyển sang chờ kết quả quay.",
  },
  [BulkActionKind.OpenSales]: {
    title: "Mở bán hàng loạt",
    verb: "mở bán",
    icon: PlayCircle,
    description: "Mở lại nhận cược cho các kỳ đã chọn — chỉ áp dụng khi chưa hết giờ cược.",
  },
};

export interface BulkConfirmDialogProps {
  kind: BulkDialogActionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chỉ những dòng THỰC SỰ sẽ bị tác động (đã lọc theo `partitionByAction`) — KHÔNG phải toàn bộ `validSelection`. */
  targetRows: readonly DerivedRow[];
  isPending: boolean;
  /** Trạng thái job nhiều lô (p1-09 §12) — chỉ có ý nghĩa khi `targetRows.length > BULK_MAX_DRAWS`. */
  batchState: BatchRunnerState;
  onConfirm: () => void;
}

export function BulkConfirmDialog({
  kind,
  open,
  onOpenChange,
  targetRows,
  isPending,
  batchState,
  onConfirm,
}: BulkConfirmDialogProps) {
  const copy = ACTION_COPY[kind];
  const Icon = copy.icon;
  const totalRevenue = targetRows.reduce((sum, r) => sum + r.revenue, 0);
  // Dialog này TÁI SỬ DỤNG cho cả bulk (Bulk Action Bar) và single-row (Expand Panel §B6.2) —
  // tiêu đề/nút phải đổi theo `targetRows.length` để không hiện "hàng loạt" khi chỉ 1 kỳ
  // (staff bấm "Đóng bán" cho đúng 1 kỳ trong panel, thấy chữ "hàng loạt" gây hoang mang).
  const isSingle = targetRows.length === 1;
  const title = isSingle ? copy.title.replace(" hàng loạt", "") : copy.title;

  // Job nhiều lô — CHỈ áp dụng cho bulk (Action Bar), single-row luôn `totalChunks <= 1`.
  const isMultiChunk = batchState.totalChunks > 1;
  const isBatchRunning = isMultiChunk && batchState.status === "running";
  const isBatchDone = isMultiChunk && batchState.status === "done";

  return (
    <Dialog open={open} onOpenChange={isBatchRunning ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isMultiChunk
              ? `${copy.description} Do vượt trần 1 lần gửi, hệ thống sẽ tự chia thành ${batchState.totalChunks} lô liên tiếp.`
              : copy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm">Sẽ {copy.verb}</span>
            <span className="font-semibold tabular-nums">
              {isSingle ? <span className="font-mono">{targetRows[0]?.drawId}</span> : `${targetRows.length} kỳ`}
            </span>
          </div>
          {totalRevenue > 0 ? (
            <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
              <span>Tổng doanh thu liên quan</span>
              <span className="font-medium tabular-nums">{formatNumber(totalRevenue)}</span>
            </div>
          ) : null}

          {/* Danh sách mã kỳ — chỉ cần khi có ≥2 kỳ VÀ job không chạy nhiều lô (job nhiều lô đã
              có progress bar bên dưới thay thế, liệt kê hết 200 mã kỳ ở đây không có giá trị). */}
          {!isSingle && !isMultiChunk ? (
            <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/20 p-2">
              <div className="flex flex-wrap gap-1 font-mono text-xs">
                {targetRows.map((r) => (
                  <span key={r.drawId} className="rounded bg-muted px-1.5 py-0.5">
                    #{r.drawNo}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Progress job nhiều lô (p1-09 §12) — hiện khi ĐANG chạy hoặc ĐÃ xong, thay hẳn khối
              danh sách mã kỳ phía trên. CHỈ báo tổng thành/thất bại — không liệt kê từng kỳ lỗi
              (đã hiện inline tại dòng qua `rowErrors`, tránh lặp thông tin 2 nơi). */}
          {isMultiChunk && batchState.status !== "idle" ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {isBatchDone
                    ? "Đã xử lý xong"
                    : `Đang xử lý lô ${batchState.doneChunks + 1}/${batchState.totalChunks}`}
                </span>
                <span className="font-medium tabular-nums">
                  {batchState.doneChunks}/{batchState.totalChunks} lô
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(batchState.doneChunks / batchState.totalChunks) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3.5" />
                  {batchState.successCount} thành công
                </span>
                {batchState.failureCount > 0 ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="size-3.5" />
                    {batchState.failureCount} thất bại
                  </span>
                ) : null}
              </div>
              {isBatchDone && batchState.failureCount > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Kỳ lỗi vẫn giữ trong lựa chọn hiện tại (xem badge lỗi tại từng dòng) — bấm lại nút {copy.verb} để thử
                  lại chỉ các kỳ đó.
                </p>
              ) : null}
            </div>
          ) : null}

          {targetRows.length === 0 ? (
            <p className="flex items-center gap-1.5 text-destructive text-xs">
              <AlertTriangle className="size-3.5" />
              Không có kỳ nào đủ điều kiện thực hiện.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {isBatchDone ? (
            <Button onClick={() => onOpenChange(false)}>Đóng</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending || isBatchRunning}>
                Quay lại
              </Button>
              <Button onClick={onConfirm} disabled={isPending || isBatchRunning || targetRows.length === 0}>
                {isPending || isBatchRunning ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Icon className="mr-2 size-4" />
                )}
                {isSingle ? `Xác nhận ${copy.verb}` : `Xác nhận ${copy.verb} ${targetRows.length} kỳ`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
