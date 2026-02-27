"use client";

import { Play, Loader2 } from "lucide-react";
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
import { DrawStatus } from "@megawin/game-core/entities";
import type { KenoCurrentDrawInfo } from "../use-draws";
import { useKenoOpenSales } from "../use-draws";

export function OpenSalesAction({
  draw,
  disabled,
}: {
  draw: KenoCurrentDrawInfo;
  disabled: boolean;
}) {
  const openSales = useKenoOpenSales();
  const isReopen = draw.status === DrawStatus.SalesClosed;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={disabled || openSales.isPending}>
          {openSales.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          {isReopen ? "Mở lại bán" : "Mở bán"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isReopen ? "Mở lại bán vé?" : "Mở bán vé?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Kỳ <strong>{draw.drawId}</strong> sẽ bắt đầu nhận đặt cược từ
            tất cả đại lý.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => openSales.mutate({ drawId: draw.drawId })}
          >
            Xác nhận mở bán
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
