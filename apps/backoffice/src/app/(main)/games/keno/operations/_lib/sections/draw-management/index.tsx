"use client";

/**
 * Keno Operations — Draw Management Section
 *
 * Block quản lý lifecycle kỳ quay Keno:
 * - DrawCommandCenter UI
 * - Confirm dialogs (OpenSales, CloseSales, Settle)
 * - Action dialogs (PublishResult, EditSchedule, VoidDraw, CreateDraw)
 * - Mutations qua hooks
 *
 * Keno: không có jackpot — kết quả là 20 số (01-80) + side bet stats.
 */

import { useState } from "react";

import { DrawStatus } from "@megawin/game-core/entities";
import { formatErrorToast } from "@megawin/next/client";
import { AlertTriangle, RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import type { KenoDrawResult, VoidInfo } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useCloseSales, useDrawDetail, useOpenSales, useTriggerResettle, useTriggerSettle } from "../../use-operations";
import {
  EditScheduleAction,
  PublishResultAction,
  type PublishResultCurrentValues,
  VoidDrawAction,
} from "./draw-actions";
import { DrawCommandCenter } from "./draw-command-center";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

export function DrawManagementSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const [publishOpen, setPublishOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [openSalesConfirm, setOpenSalesConfirm] = useState(false);
  const [closeSalesConfirm, setCloseSalesConfirm] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState(false);
  const [resettleConfirm, setResettleConfirm] = useState(false);

  const openSales = useOpenSales();
  const closeSales = useCloseSales();
  const triggerSettle = useTriggerSettle();
  const triggerResettle = useTriggerResettle();

  const { data: drawDetailData } = useDrawDetail(
    draw && RESULT_SHOW.has(draw.status as any) ? effectiveDrawId : undefined,
  );

  // Chuyển đổi draw detail → KenoDrawResult
  const result: KenoDrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    return {
      winningNumbers: d.result.winningNumbers ?? [],
      bigCount: d.result.bigCount ?? 0,
      smallCount: d.result.smallCount ?? 0,
      evenCount: d.result.evenCount ?? 0,
      oddCount: d.result.oddCount ?? 0,
      publishedAt: d.result.publishedAt,
    };
  })();

  const currentResult: PublishResultCurrentValues | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    return {
      winningNumbers: d.result.winningNumbers ?? [],
      vietlottRef: d.vietlottRef
        ? {
            drawPeriod: d.vietlottRef.drawPeriod,
            drawDate: String(d.vietlottRef.drawDate ?? ""),
          }
        : undefined,
    };
  })();

  const voidInfo: VoidInfo | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.voidInfo) return undefined;
    return {
      reason: d.voidInfo.reason,
      voidedBy: d.voidInfo.voidedBy ?? "system",
      voidedAt: d.voidInfo.voidedAt,
      refundAmount: d.voidSummary?.totalRefundAmount ?? 0,
      entryCount: d.voidSummary?.totalVoidedEntries ?? 0,
    };
  })();

  if (!draw) return null;

  return (
    <>
      <DrawCommandCenter
        draw={draw}
        result={result}
        voidInfo={voidInfo}
        onOpenSales={() => setOpenSalesConfirm(true)}
        onCloseSales={() => setCloseSalesConfirm(true)}
        onPublishResult={() => setPublishOpen(true)}
        onRepublishResult={() => setPublishOpen(true)}
        onTriggerSettle={() => setSettleConfirm(true)}
        onTriggerResettle={() => setResettleConfirm(true)}
        onEditSchedule={() => setEditScheduleOpen(true)}
        onVoidDraw={() => setVoidOpen(true)}
      />

      {/* Action dialogs */}
      <PublishResultAction
        draw={draw}
        disabled={false}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        currentResult={currentResult}
      />
      <EditScheduleAction draw={draw} disabled={false} open={editScheduleOpen} onOpenChange={setEditScheduleOpen} />
      <VoidDrawAction draw={draw} disabled={false} open={voidOpen} onOpenChange={setVoidOpen} />

      {/* Confirm: Mở bán */}
      <AlertDialog open={openSalesConfirm} onOpenChange={setOpenSalesConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận mở bán?</AlertDialogTitle>
            <AlertDialogDescription>
              Kỳ{" "}
              <strong>
                {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawTime}
              </strong>{" "}
              sẽ được mở bán. Người chơi có thể bắt đầu đặt vé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => openSales.mutate({ drawId: effectiveDrawId })}
              disabled={openSales.isPending}
            >
              Xác nhận mở bán
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: Đóng bán */}
      <AlertDialog open={closeSalesConfirm} onOpenChange={setCloseSalesConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận đóng bán?</AlertDialogTitle>
            <AlertDialogDescription>
              Kỳ{" "}
              <strong>
                {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
              </strong>{" "}
              sẽ đóng bán. Người chơi sẽ không thể mua thêm vé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeSales.mutate({ drawId: effectiveDrawId })}
              disabled={closeSales.isPending}
            >
              Xác nhận đóng bán
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: Kết sổ */}
      <SettleConfirmDialog
        open={settleConfirm}
        onOpenChange={setSettleConfirm}
        mutation={triggerSettle}
        drawId={effectiveDrawId}
        title="Xác nhận kết sổ?"
        confirmLabel="Xác nhận kết sổ"
        confirmClassName={undefined}
        description={
          <>
            Kỳ{" "}
            <strong>
              {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
            </strong>{" "}
            sẽ được đưa vào quy trình kết sổ. Thao tác này sẽ tính toán và phân bổ giải thưởng.
          </>
        }
      />

      {/* Confirm: Kết sổ lại (Resettle) */}
      <SettleConfirmDialog
        open={resettleConfirm}
        onOpenChange={setResettleConfirm}
        mutation={triggerResettle}
        drawId={effectiveDrawId}
        title="Xác nhận kết sổ lại?"
        confirmLabel="Xác nhận kết sổ lại"
        confirmClassName="bg-orange-600 hover:bg-orange-700 text-white"
        description={
          <>
            Kỳ{" "}
            <strong>
              {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
            </strong>{" "}
            sẽ được kết sổ LẠI với kết quả vừa cập nhật. Hệ thống sẽ tự động hoàn lại các khoản chi trả của lần kết sổ
            trước, sau đó tính toán và phân bổ giải thưởng theo kết quả mới. Thao tác không thể hoàn tác — hãy chắc chắn
            kết quả mới đã đúng.
          </>
        }
      />
    </>
  );
}

/** Mutation states tối thiểu mà dialog cần đọc — tránh phụ thuộc kiểu cụ thể của react-query. */
interface SettleMutationLike {
  mutate: (vars: { drawId: string }, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: () => void;
}

/**
 * Confirm dialog cho Settle/Resettle với error-inline + retry.
 *
 * Khác AlertDialog mặc định: KHÔNG tự đóng khi bấm xác nhận. Chỉ đóng khi
 * mutation thành công (`onSuccess`). Nếu lỗi → giữ dialog mở, hiện panel lỗi +
 * nút đổi nhãn thành "Thử lại" để staff retry ngay (backend idempotent).
 */
function SettleConfirmDialog({
  open,
  onOpenChange,
  mutation,
  drawId,
  title,
  description,
  confirmLabel,
  confirmClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutation: SettleMutationLike;
  drawId: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmClassName?: string;
}) {
  const { isPending, isError, error } = mutation;
  const errorToast = isError ? formatErrorToast(error, "Thao tác thất bại.") : null;

  // Đóng dialog (Huỷ / sau khi thành công) → reset mutation để xoá lỗi cũ,
  // lần mở sau bắt đầu sạch.
  function handleOpenChange(next: boolean) {
    if (!next) mutation.reset();
    onOpenChange(next);
  }

  function handleConfirm() {
    mutation.mutate(
      { drawId },
      {
        onSuccess: () => handleOpenChange(false),
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {errorToast && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">{errorToast.title}</p>
              {errorToast.description && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">{errorToast.description}</p>
              )}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Huỷ bỏ</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={isPending} className={confirmClassName}>
            {isError ? (
              <>
                <RotateCcw className="size-4" />
                Thử lại
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type { KenoDrawResult, VoidInfo } from "../../types";
