"use client";

/**
 * Lotto 5/35 – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Lotto 5/35 liên tiếp.
 * - `rows` derive trực tiếp từ preview (server tính ngày/giờ/mã kỳ theo game config) — KHÔNG
 *   phải state riêng, staff KHÔNG sửa được ngày/giờ. Sai lịch thì phải sửa ở game config, sửa
 *   tay từng kỳ dễ tạo lệch lưới và sẽ bị server từ chối khi tạo thật.
 * - Staff chỉ chọn SỐ KỲ muốn tạo (`count`) và bật/tắt "Mở bán" từng kỳ (`isOpen`).
 */
import { useMemo, useState } from "react";

import type { DrawNo } from "@megawin/game-lotto535/entities";
import { generateDrawId } from "@megawin/game-lotto535/helpers";
import { LOTTO535_CREATE_DRAW_BATCH_MAX } from "@megawin/game-lotto535/schemas";
import { displayVNTime, parseYMDToLocalDate, WEEKDAY_LABELS_ABBR } from "@megawin/shared/utils";
import { CalendarPlus, Check, Loader2, Lock, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Một dòng trong bảng tạo kỳ — derive từ slot preview, KHÔNG phải state.
 * Mọi field read-only với staff trừ `isOpen`: ngày/giờ do game config quyết định.
 */
interface DrawRow {
  /** Mã kỳ dự kiến "YYYY-MM-DD.NNN". */
  previewDrawId: string;
  /** Ngày quay "YYYY-MM-DD". */
  drawDate: string;
  /** Thứ trong tuần viết tắt (T2..CN), suy từ drawDate. */
  weekday: string;
  /** Giờ quay hiển thị "HH:mm" (giờ VN). */
  drawTime: string;
  /** Giờ quay ISO gốc từ preview — gửi thẳng lên server khi tạo, không round-trip qua form. */
  rawDrawTime: string;
  /** Mở bán ngay khi tạo. */
  isOpen: boolean;
}

/** Số kỳ mặc định mỗi lần mở dialog — Lotto 5/35 quay 2 kỳ/ngày, 3 ngày ≈ 6 kỳ. */
const DEFAULT_COUNT = 6;

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  const [count, setCount] = useState(DEFAULT_COUNT);
  /**
   * Index (theo mảng slot preview) của những kỳ staff chuyển sang "chờ lịch".
   * Lưu tập NGHỊCH ĐẢO vì mặc định mở bán hết — không cần khởi tạo lại khi count đổi.
   */
  const [closedIndexes, setClosedIndexes] = useState<ReadonlySet<number>>(() => new Set());

  const preview = usePreviewDraws(open ? count : 0);
  const createDraw = useCreateDraw();

  const availableDraws = preview.data?.draws ?? [];

  const rows = useMemo<DrawRow[]>(
    () =>
      availableDraws.map((slot, i) => {
        const dt = parseYMDToLocalDate(slot.drawDate);
        return {
          previewDrawId: generateDrawId(slot.drawDate, slot.drawNo as DrawNo),
          drawDate: slot.drawDate,
          weekday: dt ? (WEEKDAY_LABELS_ABBR[dt.getDay()] ?? "—") : "—",
          drawTime: displayVNTime(slot.drawTime),
          rawDrawTime: slot.drawTime,
          isOpen: !closedIndexes.has(i),
        };
      }),
    [availableDraws, closedIndexes],
  );

  const openCount = rows.filter((r) => r.isOpen).length;
  const scheduledCount = rows.length - openCount;
  const allOpen = rows.length > 0 && openCount === rows.length;
  const canSubmit = rows.length > 0 && !createDraw.isPending;
  // Preview tìm slot trong 30 ngày tới nên hầu như luôn đủ `count` — badge này chỉ hiện
  // khi thật sự thiếu (VD cấu hình lịch quá thưa), không phải trạng thái bình thường.
  const hasFewerPreviewSlots = !!preview.data && rows.length < count;

  function handleOpenChange(v: boolean) {
    if (!v) {
      setCount(DEFAULT_COUNT);
      setClosedIndexes(new Set());
    }
    onOpenChange(v);
  }

  function toggleSlot(i: number) {
    setClosedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }

  function toggleAll() {
    setClosedIndexes(allOpen ? new Set(rows.map((_, i) => i)) : new Set());
  }

  function handleCreate() {
    if (!canSubmit) {
      return;
    }

    createDraw.mutate(
      {
        // KHÔNG round-trip qua form: `rawDrawTime` lấy trực tiếp từ preview (server tính từ
        // game config), gửi thẳng lên — tránh sai lệch khi parse/format lại giờ ở client.
        draws: rows.map((row) => ({
          drawDate: row.drawDate,
          drawTime: row.rawDrawTime,
          openNow: row.isOpen,
        })),
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-emerald-500" />
            Tạo kỳ quay Lotto 5/35
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ quay liên tiếp theo số kỳ lựa chọn, lịch quay và mã kỳ do hệ thống tự tính.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Số kỳ + summary badges — invisible label ở cột badge để `items-end` canh
              đáy khớp input, rồi `items-center` + `h-9` bên trong canh giữa badge theo đúng
              chiều cao input. */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Số kỳ tạo</Label>
              <Input
                type="number"
                min={1}
                max={LOTTO535_CREATE_DRAW_BATCH_MAX}
                value={count}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= LOTTO535_CREATE_DRAW_BATCH_MAX) {
                    setCount(v);
                  }
                }}
                className="w-24 tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground invisible text-xs font-medium tracking-wider uppercase">
                Trạng thái
              </Label>
              <div className="flex h-9 flex-wrap items-center gap-1.5">
                {preview.isLoading && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Loader2 className="size-3 animate-spin" />
                    Đang lấy gợi ý...
                  </span>
                )}
                {openCount > 0 && (
                  <Badge className="bg-emerald-600 text-xs text-white hover:bg-emerald-600">{openCount} mở bán</Badge>
                )}
                {scheduledCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {scheduledCount} chờ lịch
                  </Badge>
                )}
                {hasFewerPreviewSlots && (
                  <Badge variant="outline" className="border-amber-300 text-xs text-amber-600">
                    Chỉ tạo được {rows.length}/{count} kỳ
                  </Badge>
                )}
                {preview.isError && (
                  <Badge variant="outline" className="border-amber-300 text-xs text-amber-600">
                    Lỗi tải gợi ý — thử lại
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Bảng preview — read-only, chỉ toggle mở bán/chờ lịch */}
          <div className="overflow-hidden rounded-xl border">
            {/* Table header */}
            <div className="bg-muted/40 grid [grid-template-columns:1.5rem_3rem_1fr_6.5rem_9rem] items-center gap-x-3 border-b px-4 py-2">
              <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">#</span>
              <span className="text-muted-foreground text-2xs text-center font-medium tracking-wider uppercase">
                Thứ
              </span>
              <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">Mã kỳ</span>
              <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">Giờ quay</span>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={rows.length === 0}
                  className="text-muted-foreground hover:text-foreground text-2xs flex items-center gap-1 font-medium transition-colors disabled:opacity-40"
                  title={allOpen ? "Tắt tất cả" : "Mở bán tất cả"}
                >
                  {allOpen ? <Unlock className="size-3 text-emerald-600" /> : <Lock className="size-3" />}
                  <span className={cn(allOpen && "text-emerald-600 dark:text-emerald-400")}>
                    {allOpen ? "Đóng" : "Mở"}
                  </span>
                </button>
              </div>
            </div>

            {/* Rows */}
            {/* Chiều cao CỐ ĐỊNH, KHÔNG `max-h-*` — xem giải thích ở bản Power 6/55: chờ preview thì
                `rows` rỗng, data về là bung ra ⇒ dialog nhảy cỡ. `min(20rem,40vh)` chống tràn. */}
            <div className="divide-border/50 h-[min(20rem,40vh)] divide-y overflow-y-auto">
              {rows.length === 0 && (
                <p className="text-muted-foreground flex h-full items-center justify-center gap-2 px-4 text-center text-xs">
                  {preview.isLoading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Đang lấy gợi ý lịch quay…
                    </>
                  ) : (
                    "Không có gợi ý — kiểm tra lại cấu hình game."
                  )}
                </p>
              )}
              {rows.map((row, i) => (
                <div
                  key={row.previewDrawId}
                  className={cn(
                    "grid [grid-template-columns:1.5rem_3rem_1fr_6.5rem_9rem] items-center gap-x-3 px-4 py-2.5 transition-colors",
                    row.isOpen ? "bg-emerald-50/50 dark:bg-emerald-950/15" : "hover:bg-muted/20",
                  )}
                >
                  {/* Số thứ tự */}
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      row.isOpen ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Thứ */}
                  <span
                    className={cn(
                      "text-center text-xs font-semibold tabular-nums",
                      row.isOpen ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                    )}
                  >
                    {row.weekday}
                  </span>

                  {/* Mã kỳ: read-only. Sinh từ drawDate + drawNo theo game config — sai thì
                      sửa ở game config, không sửa tay từng kỳ ở đây. */}
                  <span
                    title="Mã kỳ tính từ game config — không thể chỉnh sửa"
                    className="border-input bg-muted/30 text-muted-foreground flex h-8 items-center rounded-md border border-dashed px-2.5 font-mono text-xs tabular-nums"
                  >
                    {row.previewDrawId}
                  </span>

                  {/* Giờ quay: read-only, lấy từ lưới giờ trong game config. */}
                  <span
                    title="Giờ quay theo cấu hình game — không thể chỉnh sửa"
                    className="border-input bg-muted/30 text-foreground flex h-8 items-center rounded-md border border-dashed px-2.5 font-mono text-xs tabular-nums"
                  >
                    {row.drawTime}
                  </span>

                  {/* Per-row open switch */}
                  {/* Click vào label toggle switch — Switch có pointer-events-none để label nhận click thay. */}
                  <label
                    htmlFor={`lotto535-slot-toggle-${i}`}
                    className="flex cursor-pointer items-center justify-end gap-1.5 select-none"
                  >
                    {row.isOpen ? (
                      <Unlock className="size-3 shrink-0 text-emerald-500" />
                    ) : (
                      <Lock className="text-muted-foreground/40 size-3 shrink-0" />
                    )}
                    <Switch
                      id={`lotto535-slot-toggle-${i}`}
                      checked={row.isOpen}
                      onCheckedChange={() => toggleSlot(i)}
                      className="pointer-events-none origin-right scale-75"
                    />
                    <span
                      className={cn(
                        "text-2xs min-w-12 text-left font-medium",
                        row.isOpen ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                      )}
                    >
                      {row.isOpen ? "Mở bán" : "Chờ lịch"}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className={cn(openCount > 0 && "bg-emerald-600 text-white hover:bg-emerald-700")}
          >
            {createDraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Tạo {rows.length} kỳ{openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
