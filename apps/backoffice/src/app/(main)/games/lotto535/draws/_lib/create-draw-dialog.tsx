"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCreateDraw } from "./use-draws";
import { useGameConfig } from "../../config/_lib/use-game-config";

function getTodayISO(): string {
  const now = new Date();
  const vn = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
  const y = vn.getFullYear();
  const m = String(vn.getMonth() + 1).padStart(2, "0");
  const d = String(vn.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getVNHourMinute(): { hour: number; minute: number } {
  const now = new Date();
  const vn = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
  return { hour: vn.getHours(), minute: vn.getMinutes() };
}

/**
 * Tìm drawNo (1-based) gần nhất với thời gian hiện tại.
 * Nếu đang trước tất cả kỳ → chọn kỳ 1.
 * Nếu đang sau kỳ cuối → chọn kỳ cuối.
 * Nếu đang giữa → chọn kỳ tiếp theo.
 */
function getDefaultDrawNo(drawTimes: string[]): string {
  if (drawTimes.length === 0) return "1";
  const { hour, minute } = getVNHourMinute();
  const nowMinutes = hour * 60 + minute;

  for (let i = 0; i < drawTimes.length; i++) {
    const [h, m] = drawTimes[i]!.split(":").map(Number);
    const drawMinutes = h! * 60 + m!;
    if (nowMinutes < drawMinutes) return String(i + 1);
  }

  return String(drawTimes.length);
}

export function CreateDrawDialog() {
  const [open, setOpen] = useState(false);
  const [drawDate, setDrawDate] = useState(getTodayISO());
  const [drawNo, setDrawNo] = useState<string | null>(null);
  const createDraw = useCreateDraw();
  const { data: config, isLoading: configLoading } = useGameConfig();

  const drawTimes = config?.play.drawTimes ?? [];
  const selectedDrawNo = drawNo ?? getDefaultDrawNo(drawTimes);

  function handleCreate() {
    if (!drawDate) return;
    createDraw.mutate(
      { drawDate, drawNo: Number(selectedDrawNo) },
      {
        onSuccess: () => {
          setOpen(false);
          setDrawNo(null);
          setDrawDate(getTodayISO());
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          Tạo kỳ quay
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tạo kỳ quay mới</DialogTitle>
          <DialogDescription>
            Kỳ trước phải hoàn tất hoặc đã huỷ mới tạo được kỳ mới.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ngày quay
            </Label>
            <Input
              type="date"
              value={drawDate}
              min={getTodayISO()}
              onChange={(e) => setDrawDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Kỳ trong ngày
            </Label>
            {configLoading ? (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang tải cấu hình...
              </div>
            ) : (
              <Select value={selectedDrawNo} onValueChange={setDrawNo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {drawTimes.map((time, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      Kỳ {idx + 1} — {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!drawDate || configLoading || createDraw.isPending}
          >
            {createDraw.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Tạo kỳ quay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
