"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  Loader2,
  ExternalLink,
  CalendarDays,
  Hash,
  Dice5,
  Star,
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
import {
  RandomFillButton,
  generateUniqueRandomNumbers,
  generateRandomNumber,
} from "@/components/draws";
import {
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_COUNT,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

export interface PublishResultCurrentValues {
  winningMain: string[];
  winningSpecial: string;
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

const mainNumberSchema = z.string().superRefine((v, ctx) => {
  if (!v || v.trim() === "") {
    ctx.addIssue({ code: "custom", message: "Bắt buộc" });
    return;
  }
  if (!/^\d{2}$/.test(v)) {
    ctx.addIssue({
      code: "custom",
      message: `${pad2(LOTTO535_MAIN_MIN)}–${pad2(LOTTO535_MAIN_MAX)}`,
    });
    return;
  }
  const n = parseInt(v, 10);
  if (n < LOTTO535_MAIN_MIN || n > LOTTO535_MAIN_MAX) {
    ctx.addIssue({
      code: "custom",
      message: `${pad2(LOTTO535_MAIN_MIN)}–${pad2(LOTTO535_MAIN_MAX)}`,
    });
  }
});

const specialNumberSchema = z.string().superRefine((v, ctx) => {
  if (!v || v.trim() === "") {
    ctx.addIssue({ code: "custom", message: "Bắt buộc" });
    return;
  }
  if (!/^\d{2}$/.test(v)) {
    ctx.addIssue({
      code: "custom",
      message: `${pad2(LOTTO535_SPECIAL_MIN)}–${pad2(LOTTO535_SPECIAL_MAX)}`,
    });
    return;
  }
  const n = parseInt(v, 10);
  if (n < LOTTO535_SPECIAL_MIN || n > LOTTO535_SPECIAL_MAX) {
    ctx.addIssue({
      code: "custom",
      message: `${pad2(LOTTO535_SPECIAL_MIN)}–${pad2(LOTTO535_SPECIAL_MAX)}`,
    });
  }
});

const publishResultSchema = z
  .object({
    winningMain: z.array(mainNumberSchema).length(LOTTO535_MAIN_COUNT),
    winningSpecial: specialNumberSchema,
    vietlotDate: z.string(),
    vietlotPeriod: z.string(),
  })
  .superRefine((data, ctx) => {
    const validMains = data.winningMain
      .map((v) => parseInt(v, 10))
      .filter((n) => !isNaN(n) && n >= LOTTO535_MAIN_MIN && n <= LOTTO535_MAIN_MAX);

    if (validMains.length !== LOTTO535_MAIN_COUNT) return;

    const seen = new Set<number>();
    for (let i = 0; i < validMains.length; i++) {
      const n = validMains[i]!;
      if (seen.has(n)) {
        ctx.addIssue({
          code: "custom",
          message: "Các số chính không được trùng nhau.",
          path: ["winningMain"],
        });
        return;
      }
      seen.add(n);
    }
  });

type PublishResultFormValues = z.infer<typeof publishResultSchema>;

const EMPTY_DEFAULTS: PublishResultFormValues = {
  winningMain: Array(LOTTO535_MAIN_COUNT).fill("") as string[],
  winningSpecial: "",
  vietlotDate: todayVN(),
  vietlotPeriod: "",
};

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

  function buildDefaults(prefill?: PublishResultCurrentValues): PublishResultFormValues {
    if (!prefill) return EMPTY_DEFAULTS;
    return {
      winningMain:
        prefill.winningMain.length === LOTTO535_MAIN_COUNT
          ? prefill.winningMain.map((n) => n.padStart(2, "0"))
          : (Array(LOTTO535_MAIN_COUNT).fill("") as string[]),
      winningSpecial: prefill.winningSpecial ? prefill.winningSpecial.padStart(2, "0") : "",
      vietlotDate: prefill.vietlottRef?.drawDate ?? todayVN(),
      vietlotPeriod: prefill.vietlottRef?.drawPeriod ?? "",
    };
  }

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

  // Pre-fill form với kết quả hiện tại khi dialog mở.
  // Dùng useEffect thay vì handleOpenChange(true) vì `open` được
  // điều khiển từ ngoài — Dialog không trigger onOpenChange khi prop thay đổi.
  useEffect(() => {
    if (isOpen) {
      reset(buildDefaults(currentResult));
    } else {
      reset(EMPTY_DEFAULTS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);
  }

  function fillRandom() {
    const mains = generateUniqueRandomNumbers(
      LOTTO535_MAIN_COUNT,
      LOTTO535_MAIN_MIN,
      LOTTO535_MAIN_MAX,
    );
    const special = generateRandomNumber(LOTTO535_SPECIAL_MIN, LOTTO535_SPECIAL_MAX);
    setValue(
      "winningMain",
      mains.map((n) => pad2(n)),
    );
    setValue("winningSpecial", pad2(special));
  }

  function onSubmit(values: PublishResultFormValues) {
    const body: {
      winningMain: string[];
      winningSpecial: string;
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      winningMain: values.winningMain.map((n) => n.padStart(2, "0")),
      winningSpecial: values.winningSpecial.padStart(2, "0"),
    };

    if (values.vietlotPeriod.trim()) {
      body.vietlottRef = {
        drawPeriod: values.vietlotPeriod.trim(),
        drawDate: values.vietlotDate,
      };
    }

    publishResult.mutate(
      { drawId: draw.drawId, body },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  const mainErrors = errors.winningMain;
  const mainGlobalError =
    !Array.isArray(mainErrors) && mainErrors?.message ? mainErrors.message : null;
  const specialError = errors.winningSpecial?.message;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-emerald-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ{" "}
            {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate}
          </DialogTitle>
          <DialogDescription>
            Nhập {LOTTO535_MAIN_COUNT} số chính ({pad2(LOTTO535_MAIN_MIN)}–{pad2(LOTTO535_MAIN_MAX)}
            ) và 1 số đặc biệt ({pad2(LOTTO535_SPECIAL_MIN)}–{pad2(LOTTO535_SPECIAL_MAX)}).
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6 py-2">
            {/* Kết quả quay số */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/50">
                  <Dice5 className="size-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả quay số</Label>
                <RandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                {/* 5 số chính */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {LOTTO535_MAIN_COUNT} số chính (không trùng, {pad2(LOTTO535_MAIN_MIN)}–
                    {pad2(LOTTO535_MAIN_MAX)})
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: LOTTO535_MAIN_COUNT }, (_, i) => {
                      const fieldError = Array.isArray(mainErrors) ? mainErrors[i] : undefined;
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted-foreground text-center">
                            {i + 1}
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            {...register(`winningMain.${i}`, {
                              onChange: (e) => {
                                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2);
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

                  {mainGlobalError && (
                    <p className="mt-1 text-sm font-medium text-destructive">{mainGlobalError}</p>
                  )}
                </div>

                {/* Số đặc biệt */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Star className="size-3 text-amber-500" />
                    <p className="text-xs text-muted-foreground">
                      Số đặc biệt ({pad2(LOTTO535_SPECIAL_MIN)}–{pad2(LOTTO535_SPECIAL_MAX)})
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 w-fit">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      {...register("winningSpecial", {
                        onChange: (e) => {
                          e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2);
                        },
                      })}
                      className={`w-20 text-center font-mono text-sm font-semibold tabular-nums border-amber-200 dark:border-amber-800 ${specialError ? "border-destructive" : ""}`}
                      placeholder={pad2(LOTTO535_SPECIAL_MIN)}
                    />
                    {specialError && (
                      <p className="text-[10px] text-destructive text-center leading-tight">
                        {specialError}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tham chiếu Vietlott */}
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
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát
                </p>
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
                      placeholder="VD: 00123"
                      className="font-mono text-sm"
                      {...register("vietlotPeriod")}
                    />
                  </div>
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
