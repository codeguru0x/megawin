"use client";

/**
 * Lotto 5/35 Operations — Draw Management Section
 *
 * Block tự quản lý toàn bộ logic draw command center bao gồm:
 * - DrawCommandCenter UI
 * - Tất cả confirm dialogs (OpenSales, CloseSales, Settle)
 * - Tất cả action dialogs (PublishResult, EditSchedule, VoidDraw)
 * - Mutations qua hooks
 *
 * Data được lấy qua useDrawContext() — không cần prop drilling.
 */

import { useState } from "react";

import { DrawStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import { LOTTO535_PRIZE_TIER_LABELS } from "@megawin/game-lotto535/labels";

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
import {
  useCloseSales,
  useDrawDetail,
  useOpenSales,
  useReopenForCascade,
  useTriggerSettle,
} from "../../use-operations";
import {
  EditScheduleAction,
  PublishResultAction,
  type PublishResultCurrentValues,
  ResettleAction,
  VoidDrawAction,
} from "./draw-actions";
import { DrawCommandCenter } from "./draw-command-center";

const RESULT_SHOW = new Set([DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled]);

// ─── Component ────────────────────────────────────────────────────────────────

export function DrawManagementSection() {
  const { draw, effectiveDrawId } = useDrawContext();

  const [publishOpen, setPublishOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [openSalesConfirm, setOpenSalesConfirm] = useState(false);
  const [closeSalesConfirm, setCloseSalesConfirm] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState(false);
  const [resettleOpen, setResettleOpen] = useState(false);
  const [reopenConfirm, setReopenConfirm] = useState(false);

  const openSales = useOpenSales();
  const closeSales = useCloseSales();
  const triggerSettle = useTriggerSettle();
  const reopenForCascade = useReopenForCascade();

  const { data: drawDetailData } = useDrawDetail(
    draw && RESULT_SHOW.has(draw.status as any) ? effectiveDrawId : undefined,
  );

  const result: DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    const tierOrder: PrizeTier[] = [
      PrizeTier.Jackpot,
      PrizeTier.Tier1,
      PrizeTier.Tier2,
      PrizeTier.Tier3,
      PrizeTier.Tier4,
      PrizeTier.Tier5,
      PrizeTier.Consolation,
    ];
    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier as PrizeTier, t]));
    const tiers = tierOrder.map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount = winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier,
        label: LOTTO535_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    return {
      winningMain: d.result.winningMain,
      winningSpecial: d.result.winningSpecial,
      settledAt: d.result.publishedAt,
      tiers,
      // Chỉ map khi đã settle — tránh ledger giả toàn 0 sau republish/reopen.
      financial: d.financial
        ? {
            totalRevenue: d.financial.totalRevenue,
            totalFixedPrizes: d.financial.totalFixedPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            companyTake: d.financial.companyTake,
            actualCompanyTake: d.financial.actualCompanyTake,
            jackpotContribution: d.financial.jackpotContribution,
            jackpotBefore: d.jackpot?.openingAmount ?? 0,
            jackpotAfter: d.jackpot?.closingAmount ?? 0,
            hasJackpotWinner: (tierMap.get(PrizeTier.Jackpot)?.winnerCount ?? 0) > 0,
            isSplitCycle: d.jackpot?.isSplitCycle ?? false,
            jackpotPrizeAwarded:
              (tierMap.get(PrizeTier.Jackpot)?.winnerCount ?? 0) > 0 || d.jackpot?.isSplitCycle
                ? (d.jackpot?.openingAmount ?? 0) + d.financial.jackpotContribution
                : 0,
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

  // Pre-fill values cho dialog sửa kết quả (published + settled)
  const currentResult: PublishResultCurrentValues | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;
    return {
      winningMain: d.result.winningMain,
      winningSpecial: d.result.winningSpecial,
      vietlottRef: d.vietlottRef
        ? {
            drawPeriod: d.vietlottRef.drawPeriod,
            drawDate: String(d.vietlottRef.drawDate ?? ""),
          }
        : undefined,
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
        onTriggerResettle={() => setResettleOpen(true)}
        onReopenForCascade={() => setReopenConfirm(true)}
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
      <ResettleAction draw={draw} open={resettleOpen} onOpenChange={setResettleOpen} currentResult={currentResult} />

      {/* Confirm: Mở để kết sổ lại (cascade B2, số không đổi) */}
      <AlertDialog open={reopenConfirm} onOpenChange={setReopenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mở lại kỳ để kết sổ lại theo chuỗi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Kỳ <strong>{draw.drawDate}</strong> có số quay <strong>không thay đổi</strong> nhưng nằm trong chuỗi
                  cascade (TYPE_B2) do kỳ trước được kết sổ lại. Thao tác này đưa kỳ về trạng thái{" "}
                  <strong>Published</strong> để vào lại luồng kết sổ lại — số trúng được giữ nguyên.
                </p>
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  Chỉ thực hiện khi DBA đã xác nhận cập nhật jackpot cycle thủ công.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                reopenForCascade.mutate({
                  drawId: effectiveDrawId,
                  body: { dbaConfirmed: true },
                })
              }
              disabled={reopenForCascade.isPending}
            >
              Xác nhận mở lại
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  );
}

// Re-export types cho các section khác cần dùng
export type { DrawResult, VoidInfo } from "../../types";
