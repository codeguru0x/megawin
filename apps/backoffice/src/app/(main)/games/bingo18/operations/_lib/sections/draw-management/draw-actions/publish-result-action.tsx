"use client";

import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DevRandomFillButton, generateRandomNumber } from "@/components/dev-random-fill-button";
import { todayVN } from "@megawin/shared/utils";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const DICE_COUNT = 3;
const DICE_MIN = 1;
const DICE_MAX = 6;
const DICE_VALUES = [1, 2, 3, 4, 5, 6] as const;

const diceSchema = z
  .number({ message: "Vui lòng chọn số." })
  .int()
  .min(DICE_MIN, `Phải chọn số từ ${DICE_MIN} đến ${DICE_MAX}.`)
  .max(DICE_MAX, `Phải chọn số từ ${DICE_MIN} đến ${DICE_MAX}.`);

const publishResultSchema = z.object({
  dice0: diceSchema,
  dice1: diceSchema,
  dice2: diceSchema,
  vietlotDate: z.string(),
  vietlotPeriod: z.string(),
});

type PublishResultValues = z.infer<typeof publishResultSchema>;

const EMPTY_DICE_DEFAULTS = {
  dice0: undefined as unknown as number,
  dice1: undefined as unknown as number,
  dice2: undefined as unknown as number,
  vietlotDate: todayVN(),
  vietlotPeriod: "",
};

export interface PublishResultCurrentValues {
  diceNumbers: [number, number, number];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

function buildDefaults(current?: PublishResultCurrentValues): PublishResultValues {
  if (!current || current.diceNumbers.length !== 3) return EMPTY_DICE_DEFAULTS;
  return {
    dice0: current.diceNumbers[0],
    dice1: current.diceNumbers[1],
    dice2: current.diceNumbers[2],
    vietlotDate: current.vietlottRef?.drawDate ?? todayVN(),
    vietlotPeriod: current.vietlottRef?.drawPeriod ?? "",
  };
}

/**
 * Dialog công bố kết quả kỳ quay Bingo 18.
 *
 * Bingo 18: nhập 3 số xúc xắc (1-6), không có Jackpot ref.
 * Sum tự tính và hiển thị preview.
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

  const form = useForm<PublishResultValues>({
    resolver: zodResolver(publishResultSchema),
    defaultValues: EMPTY_DICE_DEFAULTS,
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(buildDefaults(currentResult));
    } else {
      form.reset(EMPTY_DICE_DEFAULTS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentResult]);

  const [d0, d1, d2] = useWatch({ control: form.control, name: ["dice0", "dice1", "dice2"] });
  const sum = (Number(d0) || 0) + (Number(d1) || 0) + (Number(d2) || 0);

  function onSubmit(values: PublishResultValues) {
    const body: {
      numbers: number[];
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { numbers: [values.dice0, values.dice1, values.dice2] };

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
          setIsOpen(false);
          form.reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        setIsOpen(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4.5 text-amber-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ{" "}
            {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
          </DialogTitle>
          <DialogDescription>Nhập 3 số xúc xắc (1–6). Tổng: 3–18.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <Dice5 className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <FormLabel className="text-sm font-semibold">Kết quả xúc xắc</FormLabel>
                <DevRandomFillButton
                  onFill={() => {
                    const nums = Array.from({ length: DICE_COUNT }, () =>
                      generateRandomNumber(DICE_MIN, DICE_MAX),
                    );
                    form.setValue("dice0", nums[0]!, { shouldValidate: true });
                    form.setValue("dice1", nums[1]!, { shouldValidate: true });
                    form.setValue("dice2", nums[2]!, { shouldValidate: true });
                  }}
                />
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid grid-cols-3 gap-3">
                  {(["dice0", "dice1", "dice2"] as const).map((fieldName, i) => (
                    <FormField
                      key={fieldName}
                      control={form.control}
                      name={fieldName}
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <span className="block text-xs font-medium text-muted-foreground text-center">
                            {i + 1}
                          </span>
                          <Select
                            value={field.value != null ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(Number(v))}
                          >
                            <FormControl>
                              <SelectTrigger className="h-14 w-full text-center text-2xl font-bold tabular-nums">
                                <SelectValue placeholder="?" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DICE_VALUES.map((n) => (
                                <SelectItem
                                  key={n}
                                  value={String(n)}
                                  className="text-lg font-semibold"
                                >
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                {/* Tổng — gắn liền với 3 ô chọn, hiển thị ngay bên dưới */}
                <div className="mt-3 flex items-center justify-between rounded-md border bg-background px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">Tổng</span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-2xl font-bold tabular-nums transition-colors ${
                        sum > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/40"
                      }`}
                    >
                      {sum > 0 ? sum : "—"}
                    </span>
                    {sum > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({sum <= 9 ? "Nhỏ" : sum <= 13 ? "Hoà" : "Lớn"} ·{" "}
                        {sum % 2 === 0 ? "Chẵn" : "Lẻ"})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                  <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <FormLabel className="text-sm font-semibold">Tham chiếu Vietlott</FormLabel>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Tùy chọn
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="vietlotDate"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="size-3" /> Ngày Vietlott
                        </FormLabel>
                        <FormControl>
                          <Input type="date" className="font-mono text-sm" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vietlotPeriod"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Hash className="size-3" /> Mã kỳ Vietlott
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="VD: 123456"
                            className="font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
