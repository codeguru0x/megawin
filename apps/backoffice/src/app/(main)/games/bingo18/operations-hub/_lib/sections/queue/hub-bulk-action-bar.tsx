"use client";

/**
 * Ops Hub — Bulk Action Bar (guideline §5.6, plan §8, p1-09 §12)
 *
 * `sticky bottom-0`, chỉ hiện khi `validSelection.size > 0` — 4 nút tương ứng 4 bulk action,
 * mỗi nút TỰ TÍNH số dòng THỰC SỰ sẽ bị tác động (không phải tổng số đã chọn — plan §8.1) và
 * disable khi 0 dòng đủ điều kiện, kèm tooltip nói rõ vì sao.
 *
 * KHÔNG còn trần chọn (p1-09 §12, đảo quyết định plan §8.3 cũ): trước đây vượt `BULK_MAX_DRAWS`
 * disable TOÀN BỘ nút — chặn staff xử lý > 50 kỳ dù nhu cầu thật (vd đóng bán 150 kỳ cuối
 * ngày). Nay CHO chọn không trần; khi `drawIds.length > BULK_MAX_DRAWS`, nút tự chuyển sang
 * chạy qua `useBulkBatchAction` (chia lô `BULK_MAX_DRAWS`/lô, gửi TUẦN TỰ — xem
 * `use-bulk-mutations.ts`) thay vì 1 request duy nhất. KHÔNG đổi gì ở API/schema — trần
 * request vẫn `BULK_MAX_DRAWS`, chỉ đổi cách CLIENT gọi.
 */

import { useMemo, useState } from "react";

// Import từ subpath riêng `bulk-draw-action/limits` (KHÔNG phải barrel `use-cases/draws`) — barrel đó
// re-export use case dùng `DrawRepository` (mongodb driver), sẽ làm Next.js bundle mongodb
// vào Client Component này và vỡ build ("Can't resolve 'child_process'").
import { BULK_MAX_DRAWS } from "@megawin/game-core-application/use-cases/bulk-draw-action/limits";
import { formatNumber } from "@megawin/shared/utils";
import { Ban, PlayCircle, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { DerivedRow } from "../../hub-types";
import { useHubContext } from "../../use-hub-context";
import { BulkConfirmDialog, type BulkDialogActionKind } from "./bulk-confirm-dialog";
import { actionUnavailableReason, partitionByAction } from "./partition-by-action";
import { BulkActionKind } from "./queue-types";
import { useBulkAction, useBulkBatchAction } from "./use-bulk-mutations";

interface ActionButtonDef {
  kind: BulkDialogActionKind;
  label: string;
  icon: typeof RotateCcw;
  drawIds: string[];
}

export function HubBulkActionBar() {
  const { state, actions, meta } = useHubContext();
  const { validSelection, rows5A } = state;
  const nowMs = meta.getNowMs();

  const [openDialog, setOpenDialog] = useState<BulkDialogActionKind | null>(null);

  const settleMutation = useBulkAction(BulkActionKind.Settle);
  const closeSalesMutation = useBulkAction(BulkActionKind.CloseSales);
  const openSalesMutation = useBulkAction(BulkActionKind.OpenSales);

  const settleBatch = useBulkBatchAction(BulkActionKind.Settle);
  const closeSalesBatch = useBulkBatchAction(BulkActionKind.CloseSales);
  const openSalesBatch = useBulkBatchAction(BulkActionKind.OpenSales);

  // Fix bug perf (09/09) — `useMemo` cho `selectedRows`: TRƯỚC ĐÓ tính lại (rows5A.filter, O(n))
  // ở MỌI RENDER của component này, kể cả khi chỉ đổi state KHÔNG liên quan (mở/đóng dialog,
  // `isPending` của mutation, `batchState` cập nhật progress mỗi lô trong lúc chạy batch —
  // p1-09 §12). Với selection lớn (chọn hết 1 tab hàng trăm kỳ), batch job có thể re-render
  // component này NHIỀU LẦN (mỗi lô xong 1 lần) — mỗi lần đều lặp lại `rows5A.filter` nếu không
  // memo. Chỉ tính lại khi `rows5A`/`validSelection` THẬT SỰ đổi. PHẢI đặt TRƯỚC early-return
  // `validSelection.size === 0` bên dưới — Hook không được gọi có điều kiện (Rules of Hooks).
  const selectedRows = useMemo(() => rows5A.filter((r) => validSelection.has(r.drawId)), [rows5A, validSelection]);
  const totalRevenue = useMemo(() => selectedRows.reduce((sum, r) => sum + r.revenue, 0), [selectedRows]);

  if (validSelection.size === 0) {
    return null;
  }

  const partition = partitionByAction(selectedRows, nowMs);

  // KHÔNG có nút "Huỷ" ở đây (plan §B5.2 — bạn yêu cầu bỏ khỏi thao tác nhanh). VOID chỉ còn
  // ở expand panel (`hub-expand-panel.tsx`), single-row, dialog xác nhận 2 lớp (gõ drawId +
  // checkbox) — hành động không thể hoàn tác không được đặt cạnh 3 nút bulk thường dùng.
  const buttons: ActionButtonDef[] = [
    { kind: BulkActionKind.Settle, label: "Kết sổ", icon: RotateCcw, drawIds: partition.settlable },
    { kind: BulkActionKind.CloseSales, label: "Đóng bán", icon: Ban, drawIds: partition.closable },
    { kind: BulkActionKind.OpenSales, label: "Mở bán", icon: PlayCircle, drawIds: partition.openable },
  ];

  function mutationForKind(kind: BulkDialogActionKind) {
    switch (kind) {
      case BulkActionKind.Settle:
        return settleMutation;
      case BulkActionKind.CloseSales:
        return closeSalesMutation;
      case BulkActionKind.OpenSales:
        return openSalesMutation;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  function batchForKind(kind: BulkDialogActionKind) {
    switch (kind) {
      case BulkActionKind.Settle:
        return settleBatch;
      case BulkActionKind.CloseSales:
        return closeSalesBatch;
      case BulkActionKind.OpenSales:
        return openSalesBatch;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }

  function targetRowsForKind(kind: BulkDialogActionKind): DerivedRow[] {
    const def = buttons.find((b) => b.kind === kind);
    if (!def) {
      return [];
    }
    const idSet = new Set(def.drawIds);
    // Lọc từ `selectedRows` (đã là subset O(m) của `rows5A`) — KHÔNG lọc lại từ `rows5A` (O(n)
    // toàn tab). `def.drawIds` luôn ⊆ `selectedRows` (ra từ `partitionByAction(selectedRows,…)`
    // ở trên), nên đổi nguồn lọc không đổi kết quả, chỉ giảm chi phí khi tab có nhiều kỳ hơn
    // selection (fix bug perf 09/09).
    return selectedRows.filter((r) => idSet.has(r.drawId));
  }

  function handleOpenDialog(kind: BulkDialogActionKind) {
    // Reset progress cũ của lô TRƯỚC (nếu có) — tránh dialog mở lên hiện nhầm số "đã xong"
    // của lần chạy trước khi job mới chưa kịp gọi `run()`.
    batchForKind(kind).resetBatch();
    setOpenDialog(kind);
  }

  function handleConfirm(kind: BulkDialogActionKind) {
    const drawIds = buttons.find((b) => b.kind === kind)?.drawIds ?? [];
    if (drawIds.length === 0) {
      return;
    }
    if (drawIds.length > BULK_MAX_DRAWS) {
      // Job nhiều lô — KHÔNG đóng dialog ở đây, để `BulkConfirmDialog` tự hiện progress rồi
      // staff bấm "Đóng" khi xong (job vẫn chạy tiếp dù dialog bị đóng sớm, state sống ở
      // `useBulkBatchAction`, không phụ thuộc dialog mount).
      void batchForKind(kind).run(drawIds, {});
      return;
    }
    const mutation = mutationForKind(kind);
    mutation.mutate(
      { drawIds },
      {
        onSuccess: () => setOpenDialog(null),
      },
    );
  }

  return (
    <>
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-7" onClick={actions.clearSelection} aria-label="Bỏ chọn">
            <X className="size-4" />
          </Button>
          <div className="text-sm">
            <span className="font-semibold tabular-nums">{validSelection.size} kỳ</span>{" "}
            <span className="text-muted-foreground">đã chọn</span>
            {totalRevenue > 0 ? (
              <span className="ml-1.5 text-muted-foreground tabular-nums">· {formatNumber(totalRevenue)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {buttons.map((btn) => {
            const disabled = btn.drawIds.length === 0;
            const sampleRow = selectedRows[0];
            const tooltipReason =
              btn.drawIds.length === 0 && sampleRow ? actionUnavailableReason(sampleRow, btn.kind, nowMs) : null;
            const chunkCount = Math.ceil(btn.drawIds.length / BULK_MAX_DRAWS);
            const button = (
              <Button
                key={btn.kind}
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => handleOpenDialog(btn.kind)}
              >
                <btn.icon className="mr-1.5 size-3.5" />
                {btn.label}
                {btn.drawIds.length > 0 ? ` (${btn.drawIds.length}${chunkCount > 1 ? ` · ${chunkCount} lô` : ""})` : ""}
              </Button>
            );
            if (!disabled || !tooltipReason) {
              return button;
            }
            return (
              <Tooltip key={btn.kind}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent>{tooltipReason}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {buttons.map((btn) => (
        <BulkConfirmDialog
          key={btn.kind}
          kind={btn.kind}
          open={openDialog === btn.kind}
          onOpenChange={(o) => setOpenDialog(o ? btn.kind : null)}
          targetRows={targetRowsForKind(btn.kind)}
          isPending={mutationForKind(btn.kind).isPending}
          batchState={batchForKind(btn.kind).batchState}
          onConfirm={() => handleConfirm(btn.kind)}
        />
      ))}
    </>
  );
}
