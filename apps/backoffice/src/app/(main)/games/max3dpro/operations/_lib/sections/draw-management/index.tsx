"use client";

/**
 * Max 3D Pro Operations — Draw Management Section
 *
 * Block tự quản lý toàn bộ logic draw command center bao gồm:
 * - DrawCommandCenter UI
 * - Tất cả confirm dialogs (OpenSales, CloseSales, Settle)
 * - Tất cả action dialogs (PublishResult, EditSchedule, VoidDraw)
 * - Mutations qua hooks
 *
 * Data được lấy qua useDrawContext() — không cần prop drilling.
 *
 * Max 3D Pro: không có Jackpot, 8 PrizeTier (bao gồm specialSub),
 * kết quả gồm 20 bộ ba số.
 */

import { useState } from "react";

import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_PRIZE_TIER_LABELS } from "@megawin/game-max3dpro/labels";

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

import type { DrawResult, VoidInfo } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useCloseSales, useDrawDetail, useOpenSales, useTriggerResettle, useTriggerSettle } from "../../use-operations";
import {
  EditScheduleAction,
  PublishResultAction,
  type PublishResultCurrentValues,
  VoidDrawAction,
} from "./draw-actions";
import { DrawCommandCenter } from "./draw-command-center";

// ─── Tier label map — 8 tiers Max 3D Pro ────────────────────────────────────

const RESULT_SHOW = new Set<string>([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

// ─── Component ────────────────────────────────────────────────────────────────

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

  const { data: drawDetailData } = useDrawDetail(draw && RESULT_SHOW.has(draw.status) ? effectiveDrawId : undefined);

  const result: DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier, t]));
    const tiers = Object.values(PrizeTier).map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount = winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier,
        label: MAX3DPRO_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    const r = d.result;
    return {
      special: r.special as [string, string],
      first: r.first as [string, string, string, string],
      second: r.second as [string, string, string, string, string, string],
      third: r.third as [string, string, string, string, string, string, string, string],
      // settledAt = thời điểm kết sổ thật (hiển thị ở bước "Kết sổ" của stepper).
      // Lấy từ d.settledAt, KHÔNG phải result.publishedAt (đó là thời điểm công bố KQ).
      settledAt: d.settledAt,
      tiers,
      // Chỉ map khi đã settle — tránh ledger giả toàn 0 sau republish ($unset financial).
      financial: d.financial
        ? {
            totalRevenue: d.financial.totalRevenue,
            totalFixedPrizes: d.financial.totalFixedPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            profit: d.financial.totalRevenue - d.financial.totalFixedPrizes - d.financial.totalAgentCommission,
          }
        : undefined,
    };
  })();

  const currentResult: PublishResultCurrentValues | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    const r = d.result;
    return {
      special: r.special as [string, string],
      first: r.first as [string, string, string, string],
      second: r.second as [string, string, string, string, string, string],
      third: r.third as [string, string, string, string, string, string, string, string],
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
              Kỳ <strong>{draw.drawId}</strong> sẽ được mở bán. Người chơi có thể bắt đầu đặt vé.
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
              Kỳ <strong>{draw.drawId}</strong> sẽ đóng bán. Người chơi sẽ không thể mua thêm vé.
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
              Kỳ <strong>{draw.drawId}</strong> sẽ được đưa vào quy trình kết sổ. Thao tác này sẽ tính toán và phân bổ
              giải thưởng cho tất cả các vé.
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
              Kỳ <strong>{draw.drawId}</strong> sẽ được kết sổ LẠI với kết quả vừa cập nhật. Hệ thống sẽ tự động hoàn
              lại các khoản chi trả của lần kết sổ trước, sau đó tính toán và phân bổ giải thưởng theo kết quả mới. Thao
              tác không thể hoàn tác — hãy chắc chắn kết quả mới đã đúng.
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

// Re-export types cho các section khác cần dùng
export type { DrawResult, VoidInfo } from "../../types";
