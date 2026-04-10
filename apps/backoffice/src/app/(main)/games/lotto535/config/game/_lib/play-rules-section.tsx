"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, HelpCircle } from "lucide-react";

import { MoneyInput } from "@megawin/ui/components/money-input";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { TimeInput } from "@/components/ui/time-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { GameConfig } from "./use-game-config";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

const playFormSchema = z
  .object({
    unitPrice: z.coerce.number().int().positive("Phải > 0"),
    minBetCount: z.coerce.number().int().min(1, "Phải ≥ 1"),
    maxBetCount: z.coerce.number().int().min(1, "Phải ≥ 1"),
    maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
    maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
    salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
    drawTime1: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
    drawTime2: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
  })
  .superRefine((data, ctx) => {
    if (data.maxBetCount < data.minBetCount) {
      ctx.addIssue({
        code: "custom",
        message: `Max betCount (${data.maxBetCount}) phải ≥ min betCount (${data.minBetCount})`,
        path: ["maxBetCount"],
      });
    }

    if (!timePattern.test(data.drawTime1) || !timePattern.test(data.drawTime2)) return;

    const t2 = timeToMinutes(data.drawTime2);
    const gap = t2 - timeToMinutes(data.drawTime1);

    if (gap < data.salesCloseBeforeMinutes) {
      ctx.addIssue({
        code: "custom",
        message: `Kỳ 2 phải sau Kỳ 1 ít nhất ${data.salesCloseBeforeMinutes} phút (= thời gian đóng bán trước giờ quay)`,
        path: ["drawTime2"],
      });
    }
  });

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const DRAWS_PER_DAY = 2;

function LabelWithTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export function PlayRulesSection({ config, onSave, isPending }: PlayRulesSectionProps) {
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(playFormSchema) as any,
    values: {
      unitPrice: config.play.unitPrice,
      minBetCount: config.play.minBetCount ?? 1,
      maxBetCount: config.play.maxBetCount ?? 10,
      maxBoardsPerTicket: config.play.maxBoardsPerTicket,
      maxDrawCount: config.play.maxDrawCount,
      salesCloseBeforeMinutes: config.play.salesCloseBeforeMinutes,
      drawTime1: config.play.drawTimes[0] ?? "10:00",
      drawTime2: config.play.drawTimes[1] ?? "21:00",
    },
  });

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        minBetCount: values.minBetCount,
        maxBetCount: values.maxBetCount,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerDay: DRAWS_PER_DAY,
        drawTimes: [values.drawTime1, values.drawTime2],
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Left: Pricing & Limits */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Giá vé & Giới hạn</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cấu hình giá 1 lượt chơi và các giới hạn số lượng khi đặt cược.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Giá mỗi lượt chơi"
                          tip="Giá 1 line × 1 lần tham gia dự thưởng (betCount). Tổng tiền vé = số lines × betCount × giá này."
                        />
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MoneyInput
                            className="pr-14 font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                            VND
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="maxBoardsPerTicket"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Số boards tối đa / vé"
                            tip="Số lượng board (A, B, C…) tối đa trên 1 vé. Mỗi board là 1 tập hợp số chơi độc lập, được settle riêng."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxDrawCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Kỳ liên tiếp tối đa"
                            tip="Mua 1 vé đăng ký tham gia tối đa bao nhiêu kỳ quay liên tiếp (multi-draw). Mỗi kỳ tạo 1 entry riêng."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesCloseBeforeMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Đóng bán trước"
                            tip="Ngừng nhận vé trước giờ quay số bao nhiêu phút. Kỳ 2 phải cách Kỳ 1 ít nhất bằng giá trị này."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="minBetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Số lượt tối thiểu"
                            tip="Số lần tham gia dự thưởng tối thiểu mỗi board. Người chơi không thể chọn ít hơn giá trị này."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 1)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxBetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Số lượt tối đa"
                            tip="Số lần tham gia dự thưởng tối đa mỗi board. Tiền thưởng nhân theo số lượt — trúng với betCount=5 nhận 5× giá trị giải."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 10)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Right: Schedule */}
              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Lịch quay số</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cố định {DRAWS_PER_DAY} kỳ quay mỗi ngày — giờ quay áp dụng cho tất cả ngày
                    trong tuần.
                  </p>
                </div>

                <div className="mb-5">
                  <p className="text-xs text-muted-foreground mb-1.5">Số kỳ quay / ngày</p>
                  <div className="flex h-9 w-20 items-center justify-center rounded-md border bg-muted/50 text-sm font-semibold tabular-nums text-muted-foreground">
                    {DRAWS_PER_DAY}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Không thể thay đổi — Lotto 5/35 cố định 2 kỳ/ngày.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Giờ quay
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="drawTime1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            <LabelWithTooltip
                              label="Kỳ 1 (buổi sáng)"
                              tip="Kỳ quay số buổi sáng. DrawId kết thúc .001."
                            />
                          </FormLabel>
                          <FormControl>
                            <TimeInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="drawTime2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            <LabelWithTooltip
                              label="Kỳ 2 (buổi tối)"
                              tip="Kỳ quay số buổi tối. DrawId kết thúc .002. Kỳ duy nhất kích hoạt cơ chế chia Jackpot khi vượt ngưỡng."
                            />
                          </FormLabel>
                          <FormControl>
                            <TimeInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu luật chơi
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
