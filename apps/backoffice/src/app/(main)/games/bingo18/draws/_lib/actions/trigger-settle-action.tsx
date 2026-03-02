"use client";

import { ShieldCheck, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Bingo18CurrentDrawInfo } from "../use-draws";
import { useBingo18TriggerSettle } from "../use-draws";

export function TriggerSettleAction({
  draw,
  disabled,
}: {
  draw: Bingo18CurrentDrawInfo;
  disabled: boolean;
}) {
  const triggerSettle = useBingo18TriggerSettle();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || triggerSettle.isPending}
        >
          {triggerSettle.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 size-4" />
          )}
          Kết sổ (Settle)
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận kết sổ?</AlertDialogTitle>
          <AlertDialogDescription>
            Kỳ <strong>{draw.drawId}</strong> sẽ chuyển sang settling. Worker tự
            động tính thưởng cho tất cả entries. Không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => triggerSettle.mutate({ drawId: draw.drawId })}
          >
            Xác nhận kết sổ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
