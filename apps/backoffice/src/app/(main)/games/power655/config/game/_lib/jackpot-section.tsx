"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { HelpCircle, Info, Save } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { GameConfig } from "./use-game-config";

const jackpotFormSchema = z
  .object({
    jp1SeedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
    jp2SeedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
    jp1ContributionRatio: z.coerce.number().int().min(1).max(99),
    jp1OverflowThreshold: z.coerce.number().int().nonnegative("Phải >= 0"),
  })
  .refine((v) => v.jp2SeedAmount <= v.jp1SeedAmount, {
    message: "Giá trị khởi điểm JP2 phải ≤ JP1.",
    path: ["jp2SeedAmount"],
  })
  .refine((v) => v.jp1OverflowThreshold > v.jp1SeedAmount, {
    message: "Ngưỡng tràn phải lớn hơn giá trị khởi điểm JP1.",
    path: ["jp1OverflowThreshold"],
  })
  .transform((v) => ({ ...v, jp2ContributionRatio: 100 - v.jp1ContributionRatio }));

type JackpotFormInput = {
  jp1SeedAmount: number;
  jp2SeedAmount: number;
  jp1ContributionRatio: number;
  jp1OverflowThreshold: number;
};

type JackpotFormValues = JackpotFormInput & { jp2ContributionRatio: number };

interface JackpotSectionProps {
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
          <HelpCircle className="size-3.5 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export function JackpotSection({ config, onSave, isPending }: JackpotSectionProps) {
  const form = useForm<JackpotFormInput>({
    resolver: zodResolver(jackpotFormSchema) as any,
    values: {
      jp1SeedAmount: config.jackpot.jackpot1.seedAmount,
      jp2SeedAmount: config.jackpot.jackpot2.seedAmount,
      jp1ContributionRatio: Math.round(config.jackpot.jp1ContributionRatio * 100),
      jp1OverflowThreshold: config.jackpot.jp1OverflowThreshold,
    },
  });

  useAiFormDirty("jackpot", form.formState.isDirty);

  const jp1Ratio = useWatch({ control: form.control, name: "jp1ContributionRatio" }) ?? 90;
  const jp2Ratio = 100 - jp1Ratio;

  function handleSubmit(values: JackpotFormValues) {
    onSave({
      jackpot: {
        jackpot1: { seedAmount: values.jp1SeedAmount },
        jackpot2: { seedAmount: values.jp2SeedAmount },
        jp1ContributionRatio: values.jp1ContributionRatio / 100,
        jp2ContributionRatio: values.jp2ContributionRatio / 100,
        jp1OverflowThreshold: values.jp1OverflowThreshold,
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit as any)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <h3 className="text-sm font-semibold text-foreground">Jackpot kép (Dual Jackpot)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Jackpot 1 (trùng 6/6 số chính) và Jackpot 2 (trùng 5/6 + số bonus). Cả hai tích luỹ song song theo tỷ lệ
                đã cài đặt. Vietlott quy định tối thiểu 30 tỷ (JP1) / 3 tỷ (JP2); hệ thống không ép buộc giá trị này.
              </p>
            </div>

            <div className="border-t px-6 py-5">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jp1SeedAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 mr-1">
                            Jackpot 1
                          </Badge>
                          <LabelWithTooltip
                            label="Giá trị khởi điểm"
                            tip="Số tiền khởi điểm của Jackpot 1 khi bắt đầu chu kỳ mới (sau khi có người trúng hoặc reset). Vietlott quy định tối thiểu 30 tỷ VND; hệ thống không ép buộc giá trị này."
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
                  <FormField
                    control={form.control}
                    name="jp2SeedAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 mr-1">
                            Jackpot 2
                          </Badge>
                          <LabelWithTooltip
                            label="Giá trị khởi điểm"
                            tip="Số tiền khởi điểm của Jackpot 2 khi bắt đầu chu kỳ mới (sau khi có người trúng hoặc reset). Vietlott quy định tối thiểu 3 tỷ VND; hệ thống không ép buộc giá trị này."
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
                </div>

                <Separator />

                {/* Tỷ lệ tích luỹ JP1 / JP2 */}
                <FormField
                  control={form.control}
                  name="jp1ContributionRatio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Tỷ lệ tích luỹ Jackpot 1 / Jackpot 2"
                          tip="Phân bổ phần tích luỹ Jackpot giữa JP1 và JP2. Tổng hai tỷ lệ luôn = 100%. Mặc định 90% JP1 / 10% JP2."
                        />
                      </FormLabel>

                      {/* Bar trực quan — cập nhật theo input bên dưới */}
                      <div className="flex h-7 w-full overflow-hidden rounded-md text-xs font-semibold">
                        <div
                          className="flex items-center justify-center text-white transition-[width] duration-150"
                          style={{
                            width: `${jp1Ratio}%`,
                            background: "linear-gradient(90deg, #ef4444, #f97316)",
                          }}
                        >
                          {jp1Ratio >= 5 && `JP1 · ${jp1Ratio}%`}
                        </div>
                        <div
                          className="flex items-center justify-center bg-blue-500 text-white transition-[width] duration-150"
                          style={{ width: `${jp2Ratio}%` }}
                        >
                          {jp2Ratio >= 5 && `JP2 · ${jp2Ratio}%`}
                        </div>
                      </div>

                      {/* Input số cho cả 2 ô — luôn đồng bộ, tổng = 100 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Jackpot 1 — Tỷ lệ tích luỹ</p>
                          <div className="flex items-baseline gap-1.5">
                            <FormControl>
                              <MoneyInput
                                className="h-9 w-20 text-center font-semibold"
                                value={field.value ?? 90}
                                onValueChange={(v) => {
                                  const clamped = Math.min(99, Math.max(1, v ?? 1));
                                  field.onChange(clamped);
                                }}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                                decimalScale={0}
                                thousandSeparator={false}
                                isAllowed={({ floatValue }) =>
                                  floatValue === undefined || (floatValue >= 1 && floatValue <= 99)
                                }
                              />
                            </FormControl>
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Jackpot 2 — Tỷ lệ tích luỹ</p>
                          <div className="flex items-baseline gap-1.5">
                            <MoneyInput
                              className="h-9 w-20 text-center font-semibold"
                              value={jp2Ratio}
                              onValueChange={(v) => {
                                const jp2 = Math.min(99, Math.max(1, v ?? 1));
                                field.onChange(100 - jp2);
                              }}
                              decimalScale={0}
                              thousandSeparator={false}
                              isAllowed={({ floatValue }) =>
                                floatValue === undefined || (floatValue >= 1 && floatValue <= 99)
                              }
                            />
                            <span className="text-sm text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground tabular-nums">
                        Tổng: <span className="font-semibold text-foreground">{jp1Ratio + jp2Ratio}%</span> · JP1 + JP2
                        luôn = 100%
                      </p>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jp1OverflowThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Jackpot 1 — Ngưỡng tràn (Overflow)"
                          tip="Khi quỹ Jackpot 1 vượt quá ngưỡng này và kỳ đó có Jackpot 2 winner, phần tiền dư ra sẽ tự động chuyển sang quỹ Jackpot 2 kỳ đó. Nếu không ai trúng cả Jackpot 1 lẫn Jackpot 2, Jackpot 1 tiếp tục tăng không bị giới hạn."
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
              </div>
            </div>
          </CardContent>

          <div className="border-t bg-blue-50/80 px-6 py-3 dark:bg-blue-950/20">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
              <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                Power 6/55 có <strong>Dual Jackpot</strong>: Jackpot 1 (trùng 6/6) và Jackpot 2 (trùng 5/6 + bonus).
                Vietlott quy định tối thiểu 30 tỷ (JP1) / 3 tỷ (JP2); hệ thống không ép buộc giá trị này. Tích luỹ mỗi
                kỳ theo tỷ lệ Jackpot 1/Jackpot 2. Jackpot tích lũy không giới hạn đến khi có người trúng —{" "}
                <strong>không chia xuống hạng giải thấp hơn</strong>; nhiều người cùng trúng thì chia đều theo đơn vị dự
                thưởng. Overflow Jackpot 1 chỉ kích hoạt khi Jackpot 1 &gt; ngưỡng tràn, không có Jackpot 1 winner, và
                có Jackpot 2 winner.
              </p>
            </div>
          </div>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu cấu hình Jackpot
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
