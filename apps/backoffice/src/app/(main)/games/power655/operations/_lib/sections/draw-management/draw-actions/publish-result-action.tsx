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
  DevRandomFillButton,
  generateUniqueRandomNumbers,
} from "@/components/dev-random-fill-button";
import {
  POWER655_MAIN_MIN,
  POWER655_MAIN_MAX,
  POWER655_MAIN_COUNT,
} from "@megawin/game-power655/entities";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

const powerNumberSchema = (label: string) =>
  z.string().superRefine((v, ctx) => {
    if (!v || v.trim() === "") {
      ctx.addIssue({ code: "custom", message: "Bắt buộc" });
      return;
    }
    if (!/^\d{2}$/.test(v)) {
      ctx.addIssue({
        code: "custom",
        message: `${pad2(POWER655_MAIN_MIN)}–${pad2(POWER655_MAIN_MAX)}`,
      });
      return;
    }
    const n = parseInt(v, 10);
    if (n < POWER655_MAIN_MIN || n > POWER655_MAIN_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `${pad2(POWER655_MAIN_MIN)}–${pad2(POWER655_MAIN_MAX)}`,
      });
    }
  });

const publishResultSchema = z
  .object({
    winningMain: z.array(powerNumberSchema("Số chính")).length(POWER655_MAIN_COUNT),
    bonusNumber: powerNumberSchema("Số thưởng"),
    vietlotDate: z.string(),
    vietlotPeriod: z.string(),
  })
  .superRefine((data, ctx) => {
    const validMains = data.winningMain
      .map((v) => parseInt(v, 10))
      .filter((n) => !isNaN(n) && n >= POWER655_MAIN_MIN && n <= POWER655_MAIN_MAX);

    // Kiểm tra trùng trong 6 số chính
    if (validMains.length === POWER655_MAIN_COUNT) {
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

      // Kiểm tra bonus không trùng với 6 số chính
      const bonus = parseInt(data.bonusNumber, 10);
      if (!isNaN(bonus) && seen.has(bonus)) {
        ctx.addIssue({
          code: "custom",
          message: "Số thưởng phải khác 6 số chính.",
          path: ["bonusNumber"],
        });
      }
    }
  });

type PublishResultFormValues = z.infer<typeof publishResultSchema>;

const EMPTY_DEFAULTS: PublishResultFormValues = {
  winningMain: Array(POWER655_MAIN_COUNT).fill("") as string[],
  bonusNumber: "",
  vietlotDate: todayVN(),
  vietlotPeriod: "",
};

export interface PublishResultCurrentValues {
  winningMain: string[];
  bonusNumber: string;
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

function buildDefaults(current?: PublishResultCurrentValues): PublishResultFormValues {
  if (!current) return EMPTY_DEFAULTS;
  return {
    winningMain:
      current.winningMain.length === POWER655_MAIN_COUNT
        ? current.winningMain
        : EMPTY_DEFAULTS.winningMain,
    bonusNumber: current.bonusNumber ?? "",
    vietlotDate: current.vietlottRef?.drawDate ?? todayVN(),
    vietlotPeriod: current.vietlottRef?.drawPeriod ?? "",
  };
}

/**
 * Dialog công bố kết quả kỳ quay Power 6/55.
 *
 * Power 6/55: nhập 6 số chính (01–55) + 1 số thưởng (bonus number, khác 6 số chính).
 * Bonus number dùng để xác định JP2 winner (trùng 5/6 chính + bonus).
 * Vietlott ref: tùy chọn, liên kết với kỳ quay chính thức.
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
    const mains = generateUniqueRandomNumbers(
      POWER655_MAIN_COUNT,
      POWER655_MAIN_MIN,
      POWER655_MAIN_MAX,
    );
    // Bonus khác 6 số chính → chọn ngẫu nhiên từ các số còn lại
    const mainSet = new Set(mains);
    const remaining = Array.from({ length: POWER655_MAIN_MAX }, (_, i) => i + 1).filter(
      (n) => !mainSet.has(n),
    );
    const bonus = remaining[Math.floor(Math.random() * remaining.length)]!;
    setValue(
      "winningMain",
      mains.map((n) => pad2(n)),
    );
    setValue("bonusNumber", pad2(bonus));
  }

  function onSubmit(values: PublishResultFormValues) {
    const body: {
      winningMain: string[];
      bonusNumber: string;
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      winningMain: values.winningMain.map((n) => n.padStart(2, "0")),
      bonusNumber: values.bonusNumber.padStart(2, "0"),
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
  const bonusError = errors.bonusNumber?.message;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-purple-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ {draw.drawDate}
          </DialogTitle>
          <DialogDescription>
            Nhập {POWER655_MAIN_COUNT} số chính ({pad2(POWER655_MAIN_MIN)}–{pad2(POWER655_MAIN_MAX)}
            ) và 1 số thưởng.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè. Chỉ có hiệu lực trước khi kết sổ."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6 py-2">
            {/* Kết quả quay số */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/50">
                  <Dice5 className="size-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <Label className="text-sm font-semibold">Kết quả quay số</Label>
                <DevRandomFillButton onFill={fillRandom} />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                {/* 6 số chính */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {POWER655_MAIN_COUNT} số chính (không trùng, {pad2(POWER655_MAIN_MIN)}–
                    {pad2(POWER655_MAIN_MAX)})
                  </p>
                  <div className="grid grid-cols-6 gap-2">
                    {Array.from({ length: POWER655_MAIN_COUNT }, (_, i) => {
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

                {/* Số thưởng */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Số thưởng (bonus number, khác 6 số chính, {pad2(POWER655_MAIN_MIN)}–
                    {pad2(POWER655_MAIN_MAX)})
                  </p>
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 text-xs text-muted-foreground">+</span>
                    <div className="flex flex-col gap-1">
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        {...register("bonusNumber", {
                          onChange: (e) => {
                            e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2);
                          },
                        })}
                        className={`w-14 text-center font-mono text-sm font-semibold tabular-nums bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700 ${bonusError ? "border-destructive" : ""}`}
                        placeholder="00"
                      />
                      {bonusError && (
                        <p className="text-[10px] text-destructive text-center leading-tight max-w-24">
                          {bonusError}
                        </p>
                      )}
                    </div>
                    <span className="mt-2.5 text-xs text-muted-foreground/70">→ JP2 winner</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tham chiếu Vietlott (optional) */}
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
