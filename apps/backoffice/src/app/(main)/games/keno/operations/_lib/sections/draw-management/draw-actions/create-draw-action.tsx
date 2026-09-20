"use client";

/**
 * Keno – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Keno cho MỘT ngày chỉ định.
 *
 * Mô hình dữ liệu (khác bản cũ — đọc trước khi sửa):
 * - Server (`/keno/draws/preview?drawDate=…`) trả về TOÀN BỘ slot còn tạo được của ngày đó.
 *   Tập này KHÔNG phụ thuộc số kỳ staff muốn tạo ⇒ đổi số kỳ chỉ cắt mảng ở client, không
 *   refetch (query key theo `drawDate`).
 * - `rows` **derive** từ `preview.data` + `limitInput`, KHÔNG phải state riêng. Nhờ vậy không
 *   còn `useEffect` đồng bộ rows↔preview (nguồn bug "ô trống", "gợi ý không áp" ở bản cũ).
 *   State duy nhất staff sửa được là `drawDate`, `limitInput` và `closedIndexes` (mở/chờ lịch).
 * - `drawNo` do server cấp từ atomic counter lúc tạo ⇒ cột MÃ KỲ read-only, chỉ hiển thị
 *   `YYYY-MM-DD.NNN` **dự kiến**. Client KHÔNG gửi `drawNo` lên API.
 * - Giờ quay cũng read-only: mọi slot đều lấy từ lưới giờ trong game config, sửa tay sẽ bị
 *   server từ chối (guard "lệch lưới").
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { generateKenoDrawId } from "@megawin/game-keno/helpers";
import { KENO_CREATE_DRAW_BATCH_MAX } from "@megawin/game-keno/schemas";
import { addDays, displayVNTime, todayVN, todayVNAsLocalDate, toVNIsoString } from "@megawin/shared/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon, CalendarPlus, Check, Loader2, Lock, TriangleAlert, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { useCreateDraw, usePreviewDraws } from "../../../use-operations";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Một dòng trong bảng tạo kỳ — **derive** từ slot preview, KHÔNG phải state.
 *
 * Mọi field đều read-only với staff trừ `isOpen`. Đây là điểm khác then chốt so với bản cũ
 * (staff sửa được ngày/số kỳ/giờ quay): số kỳ do counter server cấp, giờ quay do lưới config
 * quyết định — cho sửa chỉ tạo ra kỳ mà server sẽ từ chối.
 */
interface DrawRow {
  /** Mã kỳ **dự kiến** `"YYYY-MM-DD.NNN"`. Server cấp lại `NNN` khi tạo thật. */
  previewDrawId: string;
  /** Ngày quay `"YYYY-MM-DD"` — mọi dòng trong lô đều cùng giá trị này. */
  drawDate: string;
  /** Giờ quay hiển thị `"HH:mm"` (giờ VN). */
  drawTime: string;
  /** Mở bán ngay khi tạo (`true`) hay để trạng thái chờ lịch (`false`). */
  isOpen: boolean;
}

// ─── DatePicker ───────────────────────────────────────────────────────────────

/** Ô chọn ngày cho CẢ lô — không còn per-row như bản cũ (lô chỉ thuộc 1 ngày). */
function DatePickerField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "border-input bg-background flex h-9 w-40 items-center gap-1.5 rounded-md border px-2.5 text-sm tabular-nums transition-colors",
            "hover:bg-muted/50 focus:ring-ring focus:ring-2 focus:ring-offset-1 focus:outline-none",
          )}
        >
          <CalendarIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="flex-1 text-left font-mono">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={new Date(`${value}T00:00:00`)}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          captionLayout="dropdown"
          locale={vi}
          startMonth={new Date(2025, 0)}
          endMonth={new Date(2030, 11)}
          // Chặn ngày quá khứ: ngày đã qua theo nghiệp vụ đã có kết quả, tạo kỳ mới là vô nghĩa
          // (server cũng chặn — đây chỉ là lớp UX để staff không phải thử-rồi-lỗi).
          disabled={{ before: todayVNAsLocalDate() }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateDrawActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDrawAction({ open, onOpenChange }: CreateDrawActionProps) {
  /** Ngày cần tạo kỳ. Mặc định hôm nay (giờ VN) — tự nhảy sang ngày mai nếu hôm nay đã hết kỳ
   * (xem effect `autoAdjustedRef` bên dưới). */
  const [drawDate, setDrawDate] = useState(() => todayVN());
  /**
   * Số kỳ staff muốn tạo, giữ dạng **string** để phân biệt "chưa gõ gì" với số 0.
   * Rỗng = tạo TẤT CẢ slot còn lại (mặc định, đúng thói quen vận hành: tạo trọn ngày).
   */
  const [limitInput, setLimitInput] = useState("");
  /**
   * Index (theo mảng slot khả dụng) của những kỳ staff chuyển sang "chờ lịch".
   *
   * Lưu tập NGHỊCH ĐẢO (ai bị đóng) thay vì trạng thái từng dòng, vì mặc định là mở bán hết —
   * cách này không cần khởi tạo lại khi số dòng đổi theo `limitInput`.
   */
  const [closedIndexes, setClosedIndexes] = useState<ReadonlySet<number>>(() => new Set());

  /** `"YYYY-MM-DD"` của ngày mai — dùng làm target khi hôm nay hết kỳ (auto-jump + gợi ý). */
  const tomorrow = format(addDays(todayVNAsLocalDate(), 1), "yyyy-MM-dd");

  const preview = usePreviewDraws(open ? drawDate : "");
  const createDraw = useCreateDraw();

  const availableDraws = useMemo(() => preview.data?.draws ?? [], [preview.data?.draws]);

  /**
   * Tự nhảy sang NGÀY MAI khi mở dialog mà hôm nay đã hết kỳ (qua giờ quay kỳ cuối, hoặc đã
   * tạo đủ) — staff mở dialog gần cuối ngày không cần tự tay đổi ngày mỗi lần.
   *
   * `autoAdjustedRef` đảm bảo chỉ nhảy ĐÚNG 1 LẦN mỗi phiên mở dialog: nếu sau đó staff tự bấm
   * quay lại hôm nay (vẫn hết kỳ), effect không được nhảy lại — phải tôn trọng lựa chọn thủ công.
   */
  const autoAdjustedRef = useRef(false);

  useEffect(() => {
    if (open) {
      autoAdjustedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || autoAdjustedRef.current || drawDate !== todayVN() || !preview.isSuccess) {
      return;
    }
    if (availableDraws.length > 0) {
      return;
    }
    autoAdjustedRef.current = true;
    setDrawDate(tomorrow);
    setClosedIndexes(new Set());
  }, [open, drawDate, preview.isSuccess, availableDraws.length, tomorrow]);

  /** Số kỳ sẽ tạo: rỗng ⇒ tất cả; có nhập ⇒ clamp về [1, số slot còn lại]. */
  const effectiveCount = useMemo(() => {
    if (availableDraws.length === 0) {
      return 0;
    }
    if (limitInput.trim() === "") {
      return availableDraws.length;
    }
    const parsed = Number.parseInt(limitInput, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return 0;
    }
    return Math.min(parsed, availableDraws.length);
  }, [limitInput, availableDraws.length]);

  const rows = useMemo<DrawRow[]>(
    () =>
      availableDraws.slice(0, effectiveCount).map((slot, i) => ({
        previewDrawId: generateKenoDrawId(slot.drawDate, slot.drawNo),
        drawDate: slot.drawDate,
        drawTime: displayVNTime(slot.drawTime),
        isOpen: !closedIndexes.has(i),
      })),
    [availableDraws, effectiveCount, closedIndexes],
  );

  const openCount = rows.filter((r) => r.isOpen).length;
  const scheduledCount = rows.length - openCount;
  const allOpen = rows.length > 0 && openCount === rows.length;
  const canSubmit = rows.length > 0 && !createDraw.isPending;

  function handleOpenChange(v: boolean) {
    if (!v) {
      setDrawDate(todayVN());
      setLimitInput("");
      setClosedIndexes(new Set());
    }
    onOpenChange(v);
  }

  /** Đổi ngày ⇒ reset trạng thái mở/đóng: index của bản cũ không còn ý nghĩa với slot mới. */
  function handleDateChange(date: string) {
    setDrawDate(date);
    setClosedIndexes(new Set());
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
        // KHÔNG gửi `drawNo` — server cấp từ atomic counter. `drawTime` gửi dạng ISO có offset
        // `+07:00` để server không phải đoán timezone của client.
        draws: rows.map((row) => ({
          drawDate: row.drawDate,
          drawTime: toVNIsoString(row.drawDate, row.drawTime),
          openNow: row.isOpen,
        })),
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  /**
   * Ngày này không còn slot nào tạo được — hoặc đã qua giờ quay kỳ cuối (nếu là hôm nay),
   * hoặc đã tạo đủ kỳ. KHÔNG phân biệt 2 nguyên nhân: cách xử lý của staff giống nhau
   * (chọn ngày khác), nên tách thông điệp chỉ thêm chữ mà không thêm hành động.
   */
  const isDayFull = preview.isSuccess && availableDraws.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4.5 text-orange-500" />
            Tạo kỳ quay Keno
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ quay liên tiếp cho một ngày chỉ định theo số kỳ lựa chọn, lịch quay và mã kỳ do hệ thống tự
            tính.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: ngày + số kỳ + badges — 3 cột cùng chiều cao (label ẩn ở cột badge để
              `items-end` canh đáy khớp input, rồi `items-center` bên trong canh giữa badge). */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Ngày tạo kỳ</Label>
              <DatePickerField value={drawDate} onChange={handleDateChange} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Số kỳ tạo</Label>
              <Input
                type="number"
                min={1}
                max={KENO_CREATE_DRAW_BATCH_MAX}
                value={limitInput}
                // Lưu nguyên chuỗi, KHÔNG parse/clamp tại đây: clamp khi gõ sẽ nhảy số ngay dưới
                // con trỏ (gõ "12" thành "1" rồi bị kẹp về max). Clamp làm ở `effectiveCount`.
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder={availableDraws.length > 0 ? `Tất cả (${availableDraws.length})` : "—"}
                disabled={availableDraws.length === 0}
                className="w-32 tabular-nums"
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
                  <Badge className="bg-profit text-profit-foreground hover:bg-profit">{openCount} mở bán</Badge>
                )}
                {scheduledCount > 0 && <Badge variant="secondary">{scheduledCount} chờ lịch</Badge>}
                {preview.data && (
                  <Badge variant="outline">
                    Còn {availableDraws.length}/{preview.data.maxPerDay} kỳ
                  </Badge>
                )}
                {preview.isError && (
                  <Badge variant="outline" className="border-amber-300 text-amber-600">
                    Lỗi tải gợi ý — thử chọn lại ngày
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Ngày đã hết slot: không render bảng, chỉ hướng staff sang ngày khác */}
          {isDayFull ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3.5 dark:border-amber-500/40 dark:bg-amber-950/20">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Ngày {drawDate} không còn kỳ nào có thể tạo.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {drawDate === todayVN()
                    ? "Hôm nay đã qua giờ quay kỳ cuối hoặc đã tạo đủ kỳ."
                    : `Đã tạo đủ ${preview.data.maxPerDay} kỳ cho ngày này.`}{" "}
                  Vui lòng chọn ngày tiếp theo.
                </p>
                {drawDate !== tomorrow && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7 text-xs"
                    onClick={() => handleDateChange(tomorrow)}
                  >
                    Chuyển sang {tomorrow}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {/* Header: ngày quay ghi 1 lần ở đây, không lặp trên từng dòng */}
              <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2">
                <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">
                  Ngày quay: <span className="text-foreground font-mono normal-case">{drawDate}</span>
                  {rows.length > 0 && ` · ${rows.length} kỳ`}
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={rows.length === 0}
                  className="text-muted-foreground hover:text-foreground text-2xs flex items-center gap-1 font-medium transition-colors disabled:opacity-40"
                >
                  {allOpen ? <Unlock className="text-profit size-3" /> : <Lock className="size-3" />}
                  <span className={cn(allOpen && "text-profit")}>{allOpen ? "Đóng tất cả" : "Mở tất cả"}</span>
                </button>
              </div>

              {/* Cột: # | MÃ KỲ (drawId) | GIỜ QUAY | toggle. Ngày quay đã nằm trong mã kỳ. */}
              <div className="bg-muted/20 grid [grid-template-columns:1.5rem_1fr_6.5rem_9rem] items-center gap-x-3 border-b px-4 py-2">
                <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">#</span>
                <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">Mã kỳ</span>
                <span className="text-muted-foreground text-2xs font-medium tracking-wider uppercase">Giờ quay</span>
                <span className="text-muted-foreground text-2xs text-right font-medium tracking-wider uppercase">
                  Trạng thái
                </span>
              </div>

              {/* Chiều cao CỐ ĐỊNH, KHÔNG `max-h-*`: lúc chờ preview `rows` rỗng nên vùng này chỉ
                  cao bằng 1 dòng placeholder, data về là bung hết ⇒ dialog nhảy 379px → 863px (đo
                  16/09/2026, sampling rAF: cú nhảy ở t=626ms). Khoá cứng ⇒ dialog mở ra đã đúng
                  kích thước cuối, danh sách cuộn bên trong.

                  `min(33rem,45vh)` thay vì `33rem` cứng: 33rem + header + footer = 863px, đã vượt
                  viewport laptop 13" (~760px khả dụng) nên bản cũ vừa nhảy vừa tràn. */}
              <div className="divide-border/50 h-[min(33rem,45vh)] divide-y overflow-y-auto">
                {rows.length === 0 && (
                  <p className="text-muted-foreground flex h-full items-center justify-center gap-2 px-4 text-center text-xs">
                    {preview.data ? (
                      `Nhập số kỳ hợp lệ (1–${availableDraws.length}) hoặc để trống để tạo tất cả.`
                    ) : (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Đang lấy danh sách kỳ còn tạo được…
                      </>
                    )}
                  </p>
                )}
                {rows.map((row, i) => (
                  <div
                    key={row.previewDrawId}
                    className={cn(
                      "grid [grid-template-columns:1.5rem_1fr_6.5rem_9rem] items-center gap-x-3 px-4 py-2.5 transition-colors",
                      row.isOpen ? "bg-profit/10" : "hover:bg-muted/20",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        row.isOpen ? "text-profit" : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>

                    {/* Mã kỳ: read-only. `NNN` là số DỰ KIẾN — server cấp lại từ counter khi tạo. */}
                    <span
                      title="Mã kỳ do hệ thống sinh khi tạo — không thể chỉnh sửa"
                      className="border-input bg-muted/30 text-muted-foreground flex h-8 items-center rounded-md border border-dashed px-2.5 font-mono text-xs tabular-nums"
                    >
                      {row.previewDrawId}
                    </span>

                    {/* Giờ quay: read-only, lấy từ lưới giờ trong game config. */}
                    <span
                      title="Giờ quay theo chu kỳ cấu hình của game — không thể chỉnh sửa"
                      className="border-input bg-muted/30 text-foreground flex h-8 items-center rounded-md border border-dashed px-2.5 font-mono text-xs tabular-nums"
                    >
                      {row.drawTime}
                    </span>

                    {/* Click vào label toggle switch — Switch có pointer-events-none để label nhận click thay. */}
                    <label
                      htmlFor={`keno-slot-toggle-${i}`}
                      className="flex cursor-pointer items-center justify-end gap-1.5 select-none"
                    >
                      {row.isOpen ? (
                        <Unlock className="text-profit size-3 shrink-0" />
                      ) : (
                        <Lock className="text-muted-foreground/40 size-3 shrink-0" />
                      )}
                      <Switch
                        id={`keno-slot-toggle-${i}`}
                        checked={row.isOpen}
                        onCheckedChange={() => toggleSlot(i)}
                        className="pointer-events-none origin-right scale-75"
                      />
                      <span
                        className={cn(
                          "text-2xs min-w-12 text-left font-medium",
                          row.isOpen ? "text-profit" : "text-muted-foreground",
                        )}
                      >
                        {row.isOpen ? "Mở bán" : "Chờ lịch"}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ bỏ
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className={cn(openCount > 0 && "bg-profit text-profit-foreground hover:bg-profit/90")}
          >
            {createDraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Tạo {rows.length} kỳ{openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
