"use client";

/**
 * Bingo 18 – Create Draw Action Dialog
 *
 * Tạo nhiều kỳ quay Bingo 18 cho MỘT ngày chỉ định.
 *
 * Mô hình dữ liệu (khác bản cũ — đọc trước khi sửa):
 * - Server (`/bingo18/draws/preview?drawDate=…`) trả về TOÀN BỘ slot còn tạo được của ngày đó.
 *   Tập này KHÔNG phụ thuộc số kỳ staff muốn tạo ⇒ đổi số kỳ chỉ cắt mảng ở client, không
 *   refetch (query key theo `drawDate`).
 * - `rows` **derive** từ `preview.data` + `limitInput`, KHÔNG phải state riêng. Nhờ vậy không
 *   còn `useEffect` đồng bộ rows↔preview (nguồn bug "ô trống", "gợi ý không áp" ở bản cũ).
 *   State duy nhất staff sửa được là `drawDate`, `limitInput` và `closedIndexes` (mở/chờ lịch).
 * - `drawNo` do server cấp từ atomic counter lúc tạo ⇒ cột MÃ KỲ read-only, chỉ hiển thị
 *   `YYYY-MM-DD.NNN` **dự kiến**. Client KHÔNG gửi `drawNo` lên API.
 * - Giờ quay cũng read-only: mọi slot đều lấy từ lưới giờ trong game config, sửa tay sẽ bị
 *   server từ chối (guard "lệch lưới").
 *
 * Giữ đối xứng 1:1 với bản Keno — sửa một bên thì cân nhắc sửa bên còn lại.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { generateBingo18DrawId } from "@megawin/game-bingo18/helpers";
import { BINGO18_CREATE_DRAW_BATCH_MAX } from "@megawin/game-bingo18/schemas";
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
 * (staff sửa được ngày/giờ quay): số kỳ do counter server cấp, giờ quay do lưới config quyết
 * định — cho sửa chỉ tạo ra kỳ mà server sẽ từ chối.
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
            "flex h-9 w-40 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm tabular-nums transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
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

  const availableDraws = preview.data?.draws ?? [];

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
        previewDrawId: generateBingo18DrawId(slot.drawDate, slot.drawNo),
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
            <CalendarPlus className="size-4.5 text-amber-500" />
            Tạo kỳ quay Bingo 18
          </DialogTitle>
          <DialogDescription>
            Tạo nhiều kỳ quay liên tiếp cho một ngày chỉ định theo số kỳ lựa chọn, lịch quay và mã kỳ do hệ thống tự
            tính.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: ngày + số kỳ + badges — 3 cột cùng chiều cao (label ẩn ở cột badge để
              `items-end` canh đáy khớp input, rồi `items-center` bên trong canh giữa badge). */}
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ngày tạo kỳ</Label>
              <DatePickerField value={drawDate} onChange={handleDateChange} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Số kỳ tạo</Label>
              <Input
                type="number"
                min={1}
                max={BINGO18_CREATE_DRAW_BATCH_MAX}
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
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider invisible">
                Trạng thái
              </Label>
              <div className="flex h-9 flex-wrap items-center gap-1.5">
                {preview.isLoading && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Đang lấy gợi ý...
                  </span>
                )}
                {openCount > 0 && (
                  <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-xs">{openCount} mở bán</Badge>
                )}
                {scheduledCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {scheduledCount} chờ lịch
                  </Badge>
                )}
                {preview.data && (
                  <Badge variant="outline" className="text-xs">
                    Còn {availableDraws.length}/{preview.data.maxPerDay} kỳ
                  </Badge>
                )}
                {preview.isError && (
                  <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                    Lỗi tải gợi ý — thử chọn lại ngày
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Ngày đã hết slot: không render bảng, chỉ hướng staff sang ngày khác */}
          {isDayFull ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3.5 dark:border-amber-500/40 dark:bg-amber-950/20">
              <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Ngày {drawDate} không còn kỳ nào có thể tạo.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {drawDate === todayVN()
                    ? "Hôm nay đã qua giờ quay kỳ cuối hoặc đã tạo đủ kỳ."
                    : `Đã tạo đủ ${preview.data?.maxPerDay ?? 0} kỳ cho ngày này.`}{" "}
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
            <div className="rounded-xl border overflow-hidden">
              {/* Header: ngày quay ghi 1 lần ở đây, không lặp trên từng dòng */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Ngày quay: <span className="font-mono normal-case text-foreground">{drawDate}</span>
                  {rows.length > 0 && ` · ${rows.length} kỳ`}
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={rows.length === 0}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {allOpen ? <Unlock className="size-3 text-amber-600" /> : <Lock className="size-3" />}
                  <span className={cn(allOpen && "text-amber-600 dark:text-amber-400")}>
                    {allOpen ? "Đóng tất cả" : "Mở tất cả"}
                  </span>
                </button>
              </div>

              {/* Cột: # | MÃ KỲ (drawId) | GIỜ QUAY | toggle. Ngày quay đã nằm trong mã kỳ. */}
              <div
                className="grid items-center gap-x-3 px-4 py-2 bg-muted/20 border-b"
                style={{ gridTemplateColumns: "1.5rem 1fr 6.5rem 9rem" }}
              >
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">#</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mã kỳ</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Giờ quay</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                  Trạng thái
                </span>
              </div>

              <div className="divide-y divide-border/50 max-h-132 overflow-y-auto">
                {rows.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nhập số kỳ hợp lệ (1–{availableDraws.length}) hoặc để trống để tạo tất cả.
                  </p>
                )}
                {rows.map((row, i) => (
                  <div
                    key={row.previewDrawId}
                    className={cn(
                      "grid items-center gap-x-3 px-4 py-2.5 transition-colors",
                      row.isOpen ? "bg-amber-50/50 dark:bg-amber-950/15" : "hover:bg-muted/20",
                    )}
                    style={{ gridTemplateColumns: "1.5rem 1fr 6.5rem 9rem" }}
                  >
                    <span
                      className={cn(
                        "tabular-nums text-xs font-semibold",
                        row.isOpen ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>

                    {/* Mã kỳ: read-only. `NNN` là số DỰ KIẾN — server cấp lại từ counter khi tạo. */}
                    <span
                      title="Mã kỳ do hệ thống sinh khi tạo — không thể chỉnh sửa"
                      className="flex h-8 items-center rounded-md border border-dashed border-input bg-muted/30 px-2.5 font-mono text-xs tabular-nums text-muted-foreground"
                    >
                      {row.previewDrawId}
                    </span>

                    {/* Giờ quay: read-only, lấy từ lưới giờ trong game config. */}
                    <span
                      title="Giờ quay theo chu kỳ cấu hình của game — không thể chỉnh sửa"
                      className="flex h-8 items-center rounded-md border border-dashed border-input bg-muted/30 px-2.5 font-mono text-xs tabular-nums text-foreground"
                    >
                      {row.drawTime}
                    </span>

                    {/* Click vào label toggle switch — Switch có pointer-events-none để label nhận click thay. */}
                    <label
                      htmlFor={`bingo18-slot-toggle-${i}`}
                      className="flex items-center justify-end gap-1.5 cursor-pointer select-none"
                    >
                      {row.isOpen ? (
                        <Unlock className="size-3 text-amber-500 shrink-0" />
                      ) : (
                        <Lock className="size-3 text-muted-foreground/40 shrink-0" />
                      )}
                      <Switch
                        id={`bingo18-slot-toggle-${i}`}
                        checked={row.isOpen}
                        onCheckedChange={() => toggleSlot(i)}
                        className="scale-75 origin-right pointer-events-none"
                      />
                      <span
                        className={cn(
                          "text-[11px] font-medium min-w-12 text-left",
                          row.isOpen ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
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
            className={cn(openCount > 0 && "bg-amber-600 hover:bg-amber-700 text-white")}
          >
            {createDraw.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Tạo {rows.length} kỳ{openCount > 0 ? ` · ${openCount} mở bán` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
