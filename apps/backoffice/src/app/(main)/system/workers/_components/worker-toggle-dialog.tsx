"use client";

import { useEffect, useState } from "react";

import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { Power, PowerOff } from "lucide-react";

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

import type { useSetWorkerEnabled } from "../_lib/use-queries";

export interface WorkerToggleDialogProps {
  /** `null` = dialog đóng. */
  row: WorkerHealthRow | null;
  onClose: () => void;
  /**
   * Mutation instance chia sẻ với `WorkersTable` — table cần `isPending` để
   * disable Switch trong lúc chờ, dialog cần để disable action button.
   */
  mutation: ReturnType<typeof useSetWorkerEnabled>;
}

/**
 * Confirm bật/tắt kill-switch — 1 dialog dùng chung cho mọi dòng
 * (`pendingToggle` giữ ở orchestrator, theo tiền lệ `dispatch-content.tsx`).
 *
 * Switch chỉ mở dialog này, KHÔNG mutate ngay — misclick tắt worker production
 * không được phép có hiệu lực (§2.5g).
 *
 * Giữ `lastRow` cục bộ để nội dung không "biến mất" trong lúc dialog đang chạy
 * animation đóng (props `row` về `null` ngay khi `onClose` gọi).
 */
export function WorkerToggleDialog({ row, onClose, mutation }: WorkerToggleDialogProps) {
  const [lastRow, setLastRow] = useState<WorkerHealthRow | null>(row);
  const { mutate, isPending } = mutation;

  useEffect(() => {
    if (row) setLastRow(row);
  }, [row]);

  const isOpen = !!row;
  const shown = row ?? lastRow;
  const nextEnabled = shown ? !shown.isEnabled : false;
  const actionLabel = nextEnabled ? "Bật worker" : "Tắt worker";

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <AlertDialogContent>
        {shown && (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-10 items-center justify-center rounded-full text-white shadow-sm ${
                    nextEnabled
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
                      : "bg-gradient-to-br from-red-500 to-rose-600"
                  }`}
                >
                  {nextEnabled ? <Power className="size-5" /> : <PowerOff className="size-5" />}
                </div>
                <AlertDialogTitle className="text-base font-semibold">
                  {actionLabel} &quot;{shown.description}&quot;?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="pt-1">
                {nextEnabled
                  ? `Worker sẽ tiếp tục chạy từ cursor hiện tại (${shown.cursor ?? "chưa có"}).`
                  : "Worker sẽ ngừng cập nhật cho đến khi bật lại. Dữ liệu không mất — worker chạy tiếp từ cursor hiện tại khi bật lại."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Huỷ</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  mutate(
                    { lockKey: shown.lockKey, isEnabled: nextEnabled },
                    { onSuccess: () => onClose() },
                  );
                }}
                disabled={isPending}
              >
                {isPending ? "Đang xử lý..." : actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
