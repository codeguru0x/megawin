"use client";

/**
 * Max 3D Operations — Draw Management Section
 *
 * Block tự quản lý toàn bộ logic draw command center bao gồm:
 * - DrawCommandCenter UI
 * - Tất cả confirm dialogs (OpenSales, CloseSales, Settle)
 * - Tất cả action dialogs (PublishResult, EditSchedule, VoidDraw)
 * - Mutations qua hooks
 *
 * Data được lấy qua useDrawContext() — không cần prop drilling.
 *
 * Max 3D: không có Jackpot, kết quả gồm 20 bộ ba số.
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
import { BasicPrizeTier, PlusPrizeTier } from "@megawin/game-max3d/entities";
import {
  MAX3D_BASIC_PRIZE_TIER_LABELS,
  MAX3D_PLUS_PRIZE_TIER_LABELS,
} from "@megawin/game-max3d/labels";

import { useDrawContext } from "../../use-draw-context";
import { DrawCommandCenter } from "./draw-command-center";
import { PublishResultAction, EditScheduleAction, VoidDrawAction } from "./draw-actions";
import { useOpenSales, useCloseSales, useTriggerSettle, useDrawDetail } from "../../use-operations";

import type { DrawResult, VoidInfo } from "../../types";

const RESULT_SHOW = new Set<string>([
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

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
    draw && RESULT_SHOW.has(draw.status) ? effectiveDrawId : undefined,
  );

  const result: DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    // Merge basic + plus tier labels
    const tierLabels = { ...MAX3D_BASIC_PRIZE_TIER_LABELS, ...MAX3D_PLUS_PRIZE_TIER_LABELS };

    // settleSummary của Max 3D tách thành basicTiers và plusTiers (không có tiers chung)
    const basicTierMap = new Map((d.settleSummary?.basicTiers ?? []).map((t) => [t.tier, t]));
    const plusTierMap = new Map((d.settleSummary?.plusTiers ?? []).map((t) => [t.tier, t]));
    const allTierKeys = [
      ...Object.keys(MAX3D_BASIC_PRIZE_TIER_LABELS),
      ...Object.keys(MAX3D_PLUS_PRIZE_TIER_LABELS),
    ];
    const basicTierKeys = Object.keys(MAX3D_BASIC_PRIZE_TIER_LABELS);
    const tiers = allTierKeys.map((tier) => {
      // basicTiers cho các tier thuộc Max 3D Cơ Bản, plusTiers cho Max 3D+
      const t = basicTierKeys.includes(tier) ? basicTierMap.get(tier) : plusTierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        tier: tier as BasicPrizeTier,
        label: tierLabels[tier as keyof typeof tierLabels] ?? String(tier),
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
      settledAt:
        r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt ?? ""),
      tiers,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        companyTake: d.financial?.companyTake ?? 0,
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
              Kỳ <strong>{draw.drawId}</strong> sẽ được đưa vào quy trình kết sổ. Thao tác này sẽ
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
