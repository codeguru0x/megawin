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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { TimeInput } from "@/components/ui/time-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { GameConfig } from "./use-game-config";

const DAY_LABELS: Record<number, string> = {
  0: "Chủ nhật",
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
};

const playFormSchema = z
  .object({
    unitPrice: z.coerce.number().int().positive("Phải > 0"),
    minBetCount: z.coerce.number().int().min(1, "Tối thiểu 1"),
    maxBetCount: z.coerce.number().int().min(1, "Tối thiểu 1"),
    maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
    maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
    salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
    drawTime1: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm"),
    drawDaysOfWeek: z.array(z.number()).min(1, "Cần ít nhất 1 ngày quay"),
  })
  .refine((v) => v.maxBetCount >= v.minBetCount, {
    message: "Số lần tối đa phải ≥ số lần tối thiểu",
    path: ["maxBetCount"],
  });

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

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
      drawTime1: config.play.drawTimes[0] ?? "18:00",
      drawDaysOfWeek: config.play.drawDaysOfWeek ?? [2, 4, 6],
    },
  });

  const drawDays = form.watch("drawDaysOfWeek");

  function toggleDay(day: number) {
    const current = form.getValues("drawDaysOfWeek");
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    form.setValue("drawDaysOfWeek", next, { shouldDirty: true });
  }

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        minBetCount: values.minBetCount,
        maxBetCount: values.maxBetCount,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerDay: 1,
        drawTimes: [values.drawTime1],
        drawDaysOfWeek: values.drawDaysOfWeek,
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Cột trái — Giá vé & Giới hạn */}
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
                            tip="Số lượng board (A, B, C…) tối đa trên 1 vé. Mỗi board là 1 tập hợp 6 số chơi độc lập, được settle riêng."
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
                            tip="Ngừng nhận vé trước giờ quay số bao nhiêu phút."
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

              {/* Cột phải — Lịch quay số */}
              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Lịch quay số</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    1 kỳ quay mỗi ngày quay — Power 6/55 quay 3 lần/tuần (T3, T5, T7).
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="mb-5">
                    <p className="text-xs text-muted-foreground mb-1.5">Số kỳ quay / ngày</p>
                    <div className="flex h-9 w-20 items-center justify-center rounded-md border bg-muted/50 text-sm font-semibold tabular-nums text-muted-foreground">
                      1
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="drawTime1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Giờ quay"
                            tip="Giờ quay số duy nhất trong ngày. Áp dụng cho tất cả ngày quay được chọn bên dưới."
                          />
                        </FormLabel>
                        <FormControl>
                          <TimeInput {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Ngày quay trong tuần</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
                            drawDays.includes(day)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                    <FormField
                      control={form.control}
                      name="drawDaysOfWeek"
                      render={() => <FormMessage />}
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
