"use client";

/**
 * Bingo 18 Operations — Draw Management Section
 *
 * Block quản lý lifecycle kỳ quay Bingo 18:
 * - DrawCommandCenter UI
 * - Confirm dialogs (OpenSales, CloseSales, Settle)
 * - Action dialogs (PublishResult, EditSchedule, VoidDraw, CreateDraw)
 * - Mutations qua hooks
 *
 * Bingo 18: không có jackpot — kết quả là 3 xúc xắc (1-6) + sum.
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
import {
  useOpenSales,
  useCloseSales,
  useTriggerSettle,
  useTriggerResettle,
  useDrawDetail,
} from "../../use-operations";

import type { Bingo18DrawResult, VoidInfo } from "../../types";

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

  // Chuyển đổi draw detail → Bingo18DrawResult
  const result: Bingo18DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    const r = d.result as any;
    return {
      diceNumbers: r.numbers ?? r.diceNumbers ?? [],
      sum: r.sum ?? 0,
      publishedAt:
        r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt ?? ""),
    };
  })();

  const currentResult: PublishResultCurrentValues | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    const r = d.result as any;
    const nums = (r.numbers ?? r.diceNumbers) as number[] | undefined;
    if (!nums || nums.length !== 3) return undefined;
    return {
      diceNumbers: [nums[0]!, nums[1]!, nums[2]!] as [number, number, number],
      vietlottRef: (d as any).vietlottRef
        ? {
            drawPeriod: (d as any).vietlottRef.drawPeriod,
            drawDate: String((d as any).vietlottRef.drawDate ?? ""),
          }
        : undefined,
    };
  })();

  const voidInfo: VoidInfo | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.voidInfo) return undefined;
    const v = d.voidInfo as any;
    return {
      reason: v.reason,
      voidedBy: v.voidedBy ?? "system",
      voidedAt: v.voidedAt instanceof Date ? v.voidedAt.toISOString() : String(v.voidedAt ?? ""),
      refundAmount: (d.voidSummary as any)?.totalRefundAmount ?? 0,
      entryCount: (d.voidSummary as any)?.totalVoidedEntries ?? 0,
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
              sẽ được đưa vào quy trình kết sổ. Thao tác sẽ tính toán và phân bổ giải thưởng.
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

      {/* Confirm: Kết sổ lại (Resettle) */}
      <AlertDialog open={resettleConfirm} onOpenChange={setResettleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận kết sổ lại?</AlertDialogTitle>
            <AlertDialogDescription>
              Kỳ{" "}
              <strong>
                {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
              </strong>{" "}
              đã từng kết sổ. Thao tác này sẽ <strong>hoàn lại tất cả payout đã trả</strong> trước
              đó (reversal) và chạy lại pipeline kết sổ với kết quả mới. Quy trình bất khả nghịch —
              hãy đảm bảo kết quả mới đã chính xác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => triggerResettle.mutate({ drawId: effectiveDrawId })}
              disabled={triggerResettle.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Xác nhận kết sổ lại
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type { Bingo18DrawResult, VoidInfo } from "../../types";
