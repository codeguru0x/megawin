"use client";

/**
 * Mega 6/45 Operations — Draw Management Section
 *
 * Block tự quản lý toàn bộ logic draw command center bao gồm:
 * - DrawCommandCenter UI
 * - Tất cả confirm dialogs (OpenSales, CloseSales, Settle)
 * - Tất cả action dialogs (PublishResult, EditSchedule, VoidDraw)
 * - Mutations qua hooks
 *
 * Data được lấy qua useDrawContext() — không cần prop drilling.
 * Mega 6/45: 4 prize tiers (jackpot, tier1, tier2, tier3), không có specialNumbers.
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
import { PrizeTier } from "@megawin/game-mega645/entities";
import { MEGA645_PRIZE_TIER_LABELS } from "@megawin/game-mega645/labels";

import { useDrawContext } from "../../use-draw-context";
import { DrawCommandCenter } from "./draw-command-center";
import { PublishResultAction, EditScheduleAction, VoidDrawAction } from "./draw-actions";
import { useOpenSales, useCloseSales, useTriggerSettle, useDrawDetail } from "../../use-operations";

import type { DrawResult, VoidInfo } from "../../types";

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

  const openSales = useOpenSales();
  const closeSales = useCloseSales();
  const triggerSettle = useTriggerSettle();

  const { data: drawDetailData } = useDrawDetail(
    draw && RESULT_SHOW.has(draw.status as any) ? effectiveDrawId : undefined,
  );

  // Chuyển đổi draw detail → DrawResult cho CommandCenter
  const result: DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    // Mega 6/45: 4 tiers, không có consolation, không có specialNumbers
    const tierOrder: PrizeTier[] = [
      PrizeTier.Jackpot,
      PrizeTier.Tier1,
      PrizeTier.Tier2,
      PrizeTier.Tier3,
    ];
    const tierMap = new Map((d.settleSummary?.tiers ?? []).map((t) => [t.tier as PrizeTier, t]));
    const tiers = tierOrder.map((tier) => {
      const t = tierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier,
        label: MEGA645_PRIZE_TIER_LABELS[tier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });

    return {
      // Mega 6/45: 6 số chính (01-45), cast cứng vì luôn đúng từ DB
      winningNumbers: d.result.winningNumbers as [string, string, string, string, string, string],
      settledAt:
        d.result.publishedAt instanceof Date
          ? d.result.publishedAt.toISOString()
          : String(d.result.publishedAt ?? ""),
      tiers,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        companyTake: d.financial?.companyTake ?? 0,
        jackpotContribution: d.financial?.jackpotContribution ?? 0,
        jackpotBefore: d.jackpot?.openingAmount ?? 0,
        jackpotAfter: d.jackpot?.closingAmount ?? 0,
      },
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
              Kỳ <strong>{draw.drawDate}</strong> sẽ được mở bán. Người chơi có thể bắt đầu đặt vé.
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
              Kỳ <strong>{draw.drawDate}</strong> sẽ đóng bán. Người chơi sẽ không thể mua thêm vé.
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
              Kỳ <strong>{draw.drawDate}</strong> sẽ được đưa vào quy trình kết sổ. Thao tác này sẽ
              tính toán và phân bổ giải thưởng cho tất cả các vé.
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
