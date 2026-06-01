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
import {
  PublishResultAction,
  UpdateVietlottRefAction,
  EditScheduleAction,
  VoidDrawAction,
  type PublishResultCurrentValues,
  type VietlottRefValues,
} from "./draw-actions";
import {
  useOpenSales,
  useCloseSales,
  useTriggerSettle,
  useTriggerResettle,
  useDrawDetail,
} from "../../use-operations";

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
  const [vietlottRefOpen, setVietlottRefOpen] = useState(false);
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
    draw && RESULT_SHOW.has(draw.status) ? effectiveDrawId : undefined,
  );

  const result: DrawResult | undefined = (() => {
    const d = drawDetailData?.draw;
    if (!d?.result) return undefined;

    // settleSummary của Max 3D tách thành basicTiers và plusTiers (không có tiers chung)
    const basicTierMap = new Map((d.settleSummary?.basicTiers ?? []).map((t) => [t.tier, t]));
    const plusTierMap = new Map((d.settleSummary?.plusTiers ?? []).map((t) => [t.tier, t]));

    // Basic và Plus chia sẻ tên tier (special/first/second/third) nên phải gom riêng biệt
    // để tránh duplicate key và đọc sai data (plus special bị map sang basicTierMap).
    const basicTiers = Object.keys(MAX3D_BASIC_PRIZE_TIER_LABELS).map((tier) => {
      const t = basicTierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        mode: "basic" as const,
        tier: tier as BasicPrizeTier,
        label: MAX3D_BASIC_PRIZE_TIER_LABELS[tier as BasicPrizeTier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });
    const plusTiers = Object.keys(MAX3D_PLUS_PRIZE_TIER_LABELS).map((tier) => {
      const t = plusTierMap.get(tier);
      const winnerCount = t?.winnerCount ?? 0;
      const prizeAmount =
        winnerCount > 0 && t?.prizeAmount ? Math.round(t.prizeAmount / winnerCount) : 0;
      return {
        mode: "plus" as const,
        tier: tier as PlusPrizeTier,
        label: MAX3D_PLUS_PRIZE_TIER_LABELS[tier as PlusPrizeTier] ?? String(tier),
        winnerCount,
        prizeAmount,
        totalPrize: t?.prizeAmount ?? 0,
      };
    });
    const tiers = [...basicTiers, ...plusTiers];

    const r = d.result;
    return {
      special: r.special as [string, string],
      first: r.first as [string, string, string, string],
      second: r.second as [string, string, string, string, string, string],
      third: r.third as [string, string, string, string, string, string, string, string],
      // settledAt = thời điểm kết sổ thật (hiển thị ở bước "Kết sổ" của stepper).
      // Lấy từ d.settledAt, KHÔNG phải result.publishedAt (đó là thời điểm công bố KQ).
      settledAt: d.settledAt instanceof Date ? d.settledAt.toISOString() : undefined,
      tiers,
      financial: {
        totalRevenue: d.financial?.totalRevenue ?? 0,
        totalFixedPrizes: d.financial?.totalFixedPrizes ?? 0,
        totalAgentCommission: d.financial?.totalAgentCommission ?? 0,
        companyTake: d.financial?.companyTake ?? 0,
      },
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
      voidedAt:
        d.voidInfo.voidedAt instanceof Date
          ? d.voidInfo.voidedAt.toISOString()
          : String(d.voidInfo.voidedAt ?? ""),
      refundAmount: d.voidSummary?.totalRefundAmount ?? 0,
      entryCount: d.voidSummary?.totalVoidedEntries ?? 0,
    };
  })();

  const currentVietlottRef: VietlottRefValues | undefined = (() => {
    const d = drawDetailData?.draw;
    const v = d?.vietlottRef;
    if (!v?.drawPeriod) return undefined;
    return {
      drawPeriod: v.drawPeriod,
      drawDate: String(v.drawDate ?? ""),
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
        onUpdateVietlottRef={() => setVietlottRefOpen(true)}
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
      <UpdateVietlottRefAction
        draw={draw}
        open={vietlottRefOpen}
        onOpenChange={setVietlottRefOpen}
        currentValues={currentVietlottRef}
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

      {/* Confirm: Kết sổ lại (Resettle) */}
      <AlertDialog open={resettleConfirm} onOpenChange={setResettleConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận kết sổ lại?</AlertDialogTitle>
            <AlertDialogDescription>
              Kỳ <strong>{draw.drawId}</strong> sẽ được kết sổ LẠI với kết quả vừa cập nhật. Hệ
              thống sẽ tự động hoàn lại các khoản chi trả của lần kết sổ trước, sau đó tính toán và
              phân bổ giải thưởng theo kết quả mới. Thao tác không thể hoàn tác — hãy chắc chắn kết
              quả mới đã đúng.
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
