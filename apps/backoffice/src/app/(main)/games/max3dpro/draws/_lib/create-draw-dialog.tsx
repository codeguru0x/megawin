"use client";

import { useState } from "react";
import { Check, Loader2, Plus, CalendarPlus } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useCreateDraw, usePreviewDraws } from "./use-draws";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  });
}

const DAY_LABELS: Record<number, string> = {
  0: "CN",
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
};

function getDayOfWeek(iso: string): string {
  const d = new Date(iso);
  return DAY_LABELS[d.getDay()] ?? "";
}

export function CreateDrawDialog() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(3);

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  function handleCreate() {
    createDraw.mutate(
      { count },
      {
        onSuccess: () => {
          setOpen(false);
          setCount(3);
        },
      }
    );
  }

  const draws = preview.data?.draws ?? [];
  const openCount = draws.filter((d) => d.status === "salesOpen").length;
  const scheduledCount = draws.filter((d) => d.status === "scheduled").length;
  const uniqueDates = [...new Set(draws.map((d) => d.drawDate))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          Tạo kỳ quay
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-red-500" />
            Tạo kỳ quay Max 3D Pro
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ quay liên tiếp. Max 3D Pro quay vào T2/T4/T6 lúc
            18h00, 1 kỳ/ngày.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Số kỳ mở
              </Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 12) setCount(v);
                }}
                className="w-24 tabular-nums"
              />
            </div>
            {draws.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {openCount > 0 && (
                  <Badge variant="default" className="bg-green-600">
                    {openCount} mở bán
                  </Badge>
                )}
                {scheduledCount > 0 && (
                  <Badge variant="secondary">{scheduledCount} chờ lịch</Badge>
                )}
                {uniqueDates.length > 1 && (
                  <Badge variant="outline">{uniqueDates.length} ngày</Badge>
                )}
              </div>
            )}
          </div>

          {preview.isLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Đang tính lịch...
            </div>
          )}

          {draws.length > 0 && (
            <div className="overflow-auto max-h-[40vh] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Ngày</TableHead>
                    <TableHead className="w-12">Thứ</TableHead>
                    <TableHead>Giờ quay</TableHead>
                    <TableHead>Đóng bán</TableHead>
                    <TableHead className="w-24">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draws.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(d.drawTime)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getDayOfWeek(d.drawTime)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatTime(d.drawTime)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatTime(d.closeAt)}
                      </TableCell>
                      <TableCell>
                        {d.status === "salesOpen" ? (
                          <Badge
                            variant="default"
                            className="bg-green-600 text-xs"
                          >
                            Mở bán
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Chờ lịch
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!preview.isLoading && draws.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Không còn slot quay khả dụng.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={draws.length === 0 || createDraw.isPending}
          >
            {createDraw.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Tạo {draws.length} kỳ quay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
