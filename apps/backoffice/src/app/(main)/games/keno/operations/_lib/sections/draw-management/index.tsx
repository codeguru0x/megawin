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
import { DrawStatus } from "@megawin/game-core/entities";

import { useDrawContext } from "../../use-draw-context";
import { DrawCommandCenter } from "./draw-command-center";
import {
  PublishResultAction,
  EditScheduleAction,
  VoidDrawAction,
  type PublishResultCurrentValues,
} from "./draw-actions";
import { useOpenSales, useCloseSales, useTriggerSettle, useDrawDetail } from "../../use-operations";

import type { KenoDrawResult, VoidInfo } from "../../types";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

export function DrawManagementSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const [publishOpen, setPublishOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [openSalesConfirm, setOpenSalesConfirm] = useState(false);
  const [closeSalesConfirm, setCloseSalesConfirm] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState(false);

  const openSales = useOpenSales();
  const closeSales = useCloseSales();
  const triggerSettle = useTriggerSettle();

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
      publishedAt:
        d.result.publishedAt instanceof Date
          ? d.result.publishedAt.toISOString()
          : String(d.result.publishedAt ?? ""),
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
      voidedAt:
        d.voidInfo.voidedAt instanceof Date
          ? d.voidInfo.voidedAt.toISOString()
          : String(d.voidInfo.voidedAt ?? ""),
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
      <EditScheduleAction
        draw={draw}
        disabled={false}
        open={editScheduleOpen}
        onOpenChange={setEditScheduleOpen}
      />
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
      <AlertDialog open={settleConfirm} onOpenChange={setSettleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận kết sổ?</AlertDialogTitle>
            <AlertDialogDescription>
              Kỳ{" "}
              <strong>
                {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
              </strong>{" "}
              sẽ được đưa vào quy trình kết sổ. Thao tác này sẽ tính toán và phân bổ giải thưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => triggerSettle.mutate({ drawId: effectiveDrawId })}
              disabled={triggerSettle.isPending}
            >
              Xác nhận kết sổ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type { KenoDrawResult, VoidInfo } from "../../types";
