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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useKenoCreateDraw, useKenoPreviewDraws } from "./use-draws";

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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KenoCreateDrawDialog() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(10);
  const today = getTodayISO();

  const preview = useKenoPreviewDraws(open ? today : "", open ? count : 0);
  const createDraw = useKenoCreateDraw();

  function handleCreate() {
    createDraw.mutate(
      { drawDate: today, count },
      {
        onSuccess: () => {
          setOpen(false);
          setCount(10);
        },
      }
    );
  }

  const draws = preview.data?.draws ?? [];
  const openCount = draws.filter((d) => d.status === "salesOpen").length;
  const scheduledCount = draws.filter((d) => d.status === "scheduled").length;

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
          <DialogTitle>Tạo kỳ quay Keno – {today}</DialogTitle>
          <DialogDescription>
            Thời gian quay và đóng bán tính tự động theo cấu hình game.
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
                max={30}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 30) setCount(v);
                }}
                className="w-24 tabular-nums"
              />
            </div>
            {draws.length > 0 && (
              <div className="flex gap-2 pb-1">
                {openCount > 0 && (
                  <Badge variant="default" className="bg-green-600">
                    {openCount} mở bán
                  </Badge>
                )}
                {scheduledCount > 0 && (
                  <Badge variant="secondary">{scheduledCount} chờ lịch</Badge>
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
                    <TableHead className="w-16">Kỳ</TableHead>
                    <TableHead>Giờ quay</TableHead>
                    <TableHead>Đóng bán</TableHead>
                    <TableHead className="w-24">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draws.map((d) => (
                    <TableRow key={d.drawNo}>
                      <TableCell className="tabular-nums font-medium">
                        {d.drawNo}
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
              Không còn slot quay khả dụng trong ngày.
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
