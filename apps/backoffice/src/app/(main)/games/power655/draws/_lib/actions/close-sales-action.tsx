"use client";

import { Square, Loader2 } from "lucide-react";
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
import type { CurrentDrawInfo } from "../use-draws";
import { useCloseSales } from "../use-draws";

export function CloseSalesAction({
  draw,
  disabled,
}: {
  draw: CurrentDrawInfo;
  disabled: boolean;
}) {
  const closeSales = useCloseSales();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || closeSales.isPending}
        >
          {closeSales.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Square className="mr-2 size-4" />
          )}
          Đóng bán
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận đóng bán?</AlertDialogTitle>
          <AlertDialogDescription>
            Kỳ <strong>{draw.drawId}</strong> sẽ ngừng nhận vé. Hệ thống sẽ
            khoá entries và tính tổng doanh thu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => closeSales.mutate({ drawId: draw.drawId })}
          >
            Đóng bán ngay
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
