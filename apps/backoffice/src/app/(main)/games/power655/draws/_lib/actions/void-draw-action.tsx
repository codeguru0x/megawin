"use client";

import { useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CurrentDrawInfo } from "../use-draws";
import { useVoidDraw } from "../use-draws";

export function VoidDrawAction({
  draw,
  disabled,
}: {
  draw: CurrentDrawInfo;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const voidDraw = useVoidDraw();

  function handleSubmit() {
    if (!reason.trim()) return;
    voidDraw.mutate(
      { drawId: draw.drawId, body: { reason: reason.trim() } },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled || voidDraw.isPending}
        >
          <XCircle className="mr-2 size-4" />
          Huỷ kỳ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Huỷ kỳ quay</DialogTitle>
          <DialogDescription>
            Kỳ <strong>{draw.drawId}</strong> sẽ bị huỷ vĩnh viễn. Tất cả vé đã
            bán sẽ được hoàn lại. Thao tác này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Lý do huỷ kỳ *
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do huỷ kỳ quay..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Quay lại
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || voidDraw.isPending}
          >
            {voidDraw.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 size-4" />
            )}
            Xác nhận huỷ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
