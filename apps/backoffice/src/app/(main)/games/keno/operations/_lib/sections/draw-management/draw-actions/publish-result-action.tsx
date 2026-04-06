"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  Loader2,
  Dice5,
  ExternalLink,
  CalendarDays,
  Hash,
  ClipboardCheck,
} from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { RandomFillButton, generateUniqueRandomNumbers } from "@/components/draws";
import { todayVN } from "@megawin/shared/utils";
import { KENO_NUMBER_MIN, KENO_NUMBER_MAX, KENO_DRAW_COUNT } from "@megawin/game-keno/entities";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Validate từng ô: phải là số nguyên trong [01, 80]
const kenoNumberSchema = z.string().superRefine((v, ctx) => {
  if (!v || v.trim() === "") {
    ctx.addIssue({ code: "custom", message: "Bắt buộc" });
    return;
  }
  if (!/^\d{2}$/.test(v)) {
    ctx.addIssue({
      code: "custom",
      message: `${pad2(KENO_NUMBER_MIN)}–${pad2(KENO_NUMBER_MAX)}`,
    });
    return;
  }
  const n = parseInt(v, 10);
  if (n < KENO_NUMBER_MIN || n > KENO_NUMBER_MAX) {
    ctx.addIssue({ code: "custom", message: `${pad2(KENO_NUMBER_MIN)}–${pad2(KENO_NUMBER_MAX)}` });
  }
});

const publishResultSchema = z
  .object({
    winningNumbers: z.array(kenoNumberSchema).length(KENO_DRAW_COUNT),
    vietlotDate: z.string(),
    vietlotPeriod: z.string(),
  })
  .superRefine((data, ctx) => {
    // Chỉ kiểm tra trùng khi tất cả ô đã pass per-field validation
    const validNums = data.winningNumbers
      .map((v) => parseInt(v, 10))
      .filter((n) => !isNaN(n) && n >= KENO_NUMBER_MIN && n <= KENO_NUMBER_MAX);

    if (validNums.length !== KENO_DRAW_COUNT) return;

    const seen = new Set<number>();
    for (let i = 0; i < validNums.length; i++) {
      const n = validNums[i]!;
      if (seen.has(n)) {
        ctx.addIssue({
          code: "custom",
          message: "Các số không được trùng nhau.",
          path: ["winningNumbers"],
        });
        return;
      }
      seen.add(n);
    }
  });

type PublishResultFormValues = z.infer<typeof publishResultSchema>;

const EMPTY_DEFAULTS: PublishResultFormValues = {
  winningNumbers: Array(KENO_DRAW_COUNT).fill("") as string[],
  vietlotDate: todayVN(),
  vietlotPeriod: "",
};

export interface PublishResultCurrentValues {
  winningNumbers: string[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

function buildDefaults(current?: PublishResultCurrentValues): PublishResultFormValues {
  if (!current) return EMPTY_DEFAULTS;
  return {
    winningNumbers:
      current.winningNumbers.length === KENO_DRAW_COUNT
        ? current.winningNumbers
        : EMPTY_DEFAULTS.winningNumbers,
    vietlotDate: current.vietlottRef?.drawDate ?? todayVN(),
    vietlotPeriod: current.vietlottRef?.drawPeriod ?? "",
  };
}

/**
 * Dialog công bố kết quả kỳ quay Keno.
 *
 * Keno: nhập 20 số trúng (01-80), không có số đặc biệt, không có Vietlott ref.
 * Số được nhập theo thứ tự quay (thứ tự quan trọng cho UI hiển thị).
 */
export function PublishResultAction({
  draw,
  disabled,
  open,
  onOpenChange,
  currentResult,
}: {
  draw: DrawSelectorItem;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentResult?: PublishResultCurrentValues;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;
  const publishResult = usePublishResult();

  const isRepublish = draw.status === "published" || draw.status === "settled";

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PublishResultFormValues>({
    resolver: zodResolver(publishResultSchema),
    defaultValues: EMPTY_DEFAULTS,
    mode: "onChange",
  });

  useEffect(() => {
    if (isOpen) {
      reset(buildDefaults(currentResult));
    } else {
      reset(EMPTY_DEFAULTS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentResult]);

  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);
  }

  function fillRandom() {
    const drawn = generateUniqueRandomNumbers(KENO_DRAW_COUNT, KENO_NUMBER_MIN, KENO_NUMBER_MAX);
    const padded = drawn.map((n) => String(n).padStart(2, "0"));
    setValue("winningNumbers", padded);
  }

  function onSubmit(values: PublishResultFormValues) {
    const body: {
      winningNumbers: string[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      winningNumbers: values.winningNumbers.map((n) => n.padStart(2, "0")),
    };

    if (values.vietlotPeriod.trim()) {
      body.vietlottRef = {
        drawPeriod: values.vietlotPeriod.trim(),
        drawDate: values.vietlotDate,
      };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      },
    );
  }

  const numberErrors = errors.winningNumbers;
  const globalError =
    !Array.isArray(numberErrors) && numberErrors?.message ? numberErrors.message : null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-orange-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ{" "}
            {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>
            Nhập {KENO_DRAW_COUNT} số trúng ({pad2(KENO_NUMBER_MIN)}–{pad2(KENO_NUMBER_MAX)}). Thứ
            tự nhập là thứ tự quay chính thức.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-900/50">
                  <Dice5 className="size-3.5 text-orange-600 dark:text-orange-400" />
                </div>
                <Label className="text-sm font-semibold">20 số trúng (theo thứ tự quay)</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: KENO_DRAW_COUNT }, (_, i) => {
                    const fieldError = Array.isArray(numberErrors) ? numberErrors[i] : undefined;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground text-center">
                          {i + 1}
                        </span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          {...register(`winningNumbers.${i}`, {
                            onChange: (e) => {
                              const cleaned = e.target.value.replace(/\D/g, "").slice(0, 2);
                              e.target.value = cleaned;
                            },
                          })}
                          className={`w-full text-center font-mono text-sm font-semibold tabular-nums ${fieldError ? "border-destructive" : ""}`}
                          placeholder={pad2(i + 1)}
                        />
                        {fieldError?.message && (
                          <p className="text-[10px] text-destructive text-center leading-tight">
                            {fieldError.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {globalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-sm font-medium text-destructive">{globalError}</p>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                  <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <Label className="text-sm font-semibold">Tham chiếu Vietlott</Label>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Tùy chọn
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="size-3" /> Ngày Vietlott
                  </Label>
                  <Input type="date" className="font-mono text-sm" {...register("vietlotDate")} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Hash className="size-3" /> Mã kỳ Vietlott
                  </Label>
                  <Input
                    type="text"
                    placeholder="VD: 123456"
                    className="font-mono text-sm"
                    {...register("vietlotPeriod")}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={publishResult.isPending || disabled}>
              {publishResult.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
