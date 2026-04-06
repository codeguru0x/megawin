"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Dice3, HelpCircle, ExternalLink, CalendarDays, Hash } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RandomFillButton } from "@/components/draws";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const tripletSchema = z.string().regex(/^\d{3}$/, "Phải là 3 chữ số (000–999)");

const publishResultSchema = z.object({
  special: z.tuple([tripletSchema, tripletSchema]),
  first: z.tuple([tripletSchema, tripletSchema, tripletSchema, tripletSchema]),
  second: z.tuple([
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
  ]),
  third: z.tuple([
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
    tripletSchema,
  ]),
  vietlotDate: z.string(),
  vietlotPeriod: z.string(),
});

type PublishResultFormValues = z.infer<typeof publishResultSchema>;

const TIER_CONFIG = [
  {
    key: "special" as const,
    label: "Giải Đặc Biệt",
    count: 2,
    color: "from-amber-400 to-orange-500",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  {
    key: "first" as const,
    label: "Giải Nhất",
    count: 4,
    color: "from-rose-500 to-pink-600",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  },
  {
    key: "second" as const,
    label: "Giải Nhì",
    count: 6,
    color: "from-blue-500 to-indigo-600",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  {
    key: "third" as const,
    label: "Giải Ba",
    count: 8,
    color: "from-emerald-500 to-teal-600",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
];

const EMPTY_DEFAULTS: PublishResultFormValues = {
  special: ["", ""],
  first: ["", "", "", ""],
  second: ["", "", "", "", "", ""],
  third: ["", "", "", "", "", "", "", ""],
  vietlotDate: todayVN(),
  vietlotPeriod: "",
};

export interface PublishResultCurrentValues {
  special: [string, string];
  first: [string, string, string, string];
  second: [string, string, string, string, string, string];
  third: [string, string, string, string, string, string, string, string];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

function buildDefaults(current?: PublishResultCurrentValues): PublishResultFormValues {
  if (!current) return EMPTY_DEFAULTS;
  return {
    special: current.special.length === 2 ? current.special : EMPTY_DEFAULTS.special,
    first: current.first.length === 4 ? current.first : EMPTY_DEFAULTS.first,
    second: current.second.length === 6 ? current.second : EMPTY_DEFAULTS.second,
    third: current.third.length === 8 ? current.third : EMPTY_DEFAULTS.third,
    vietlotDate: current.vietlottRef?.drawDate ?? todayVN(),
    vietlotPeriod: current.vietlottRef?.drawPeriod ?? "",
  };
}

function generateRandomTriplet(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

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
    watch,
    reset,
    formState: { errors },
  } = useForm<PublishResultFormValues>({
    resolver: zodResolver(publishResultSchema),
    defaultValues: EMPTY_DEFAULTS,
    mode: "onSubmit",
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
    setValue("special", [generateRandomTriplet(), generateRandomTriplet()]);
    setValue("first", [
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
    ]);
    setValue("second", [
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
    ]);
    setValue("third", [
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
      generateRandomTriplet(),
    ]);
  }

  function onSubmit(values: PublishResultFormValues) {
    const body: {
      result: typeof values.special extends [string, string]
        ? {
            special: [string, string];
            first: [string, string, string, string];
            second: [string, string, string, string, string, string];
            third: [string, string, string, string, string, string, string, string];
          }
        : never;
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = {
      result: {
        special: values.special,
        first: values.first,
        second: values.second,
        third: values.third,
      },
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

  const allValues = watch();
  const filledCount = (
    Object.entries(allValues)
      .filter(([k]) => !["vietlotDate", "vietlotPeriod"].includes(k))
      .map(([, v]) => v) as string[][]
  )
    .flat()
    .filter((v) => /^\d{3}$/.test(v)).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dice3 className="size-4.5 text-blue-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ {draw.drawDate}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Nhập 20 bộ ba số (000–999): 2 ĐB + 4 Nhất + 6 Nhì + 8 Ba.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè."}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Mỗi kỳ quay Max 3D có 20 bộ ba số kết quả, phân theo 4 hạng giải. Mỗi bộ là 3 chữ số
                từ 000 đến 999.
              </TooltipContent>
            </Tooltip>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="tabular-nums">
                {filledCount}/20 bộ số
              </Badge>
              <RandomFillButton onFill={fillRandom} />
            </div>

            {TIER_CONFIG.map((tier) => {
              const tierErrors = errors[tier.key];
              return (
                <div key={tier.key} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-1 w-6 rounded-full bg-linear-to-r ${tier.color}`} />
                    <Label className="text-sm font-semibold">{tier.label}</Label>
                    <Badge variant="outline" className={`text-xs border-0 ${tier.badgeClass}`}>
                      {tier.count} bộ
                    </Badge>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: tier.count }, (_, i) => {
                        const fieldError = Array.isArray(tierErrors) ? tierErrors[i] : undefined;
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground text-center">
                              {i + 1}
                            </span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              maxLength={3}
                              {...register(`${tier.key}.${i}` as `special.0`, {
                                onChange: (e) => {
                                  const cleaned = e.target.value.replace(/\D/g, "").slice(0, 3);
                                  e.target.value = cleaned;
                                },
                              })}
                              className={`w-full text-center font-mono text-sm font-bold tabular-nums ${fieldError ? "border-destructive" : ""}`}
                              placeholder="000"
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
              );
            })}

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
                      placeholder="VD: 123456"
                      className="font-mono text-sm"
                      {...register("vietlotPeriod")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={publishResult.isPending}>
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
