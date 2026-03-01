"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Info, HelpCircle } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { GameConfig } from "./use-game-config";

const jackpotFormSchema = z.object({
  jp1SeedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
  jp2SeedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
  jp1ContributionRatio: z.coerce.number().min(0).max(100),
  jp2ContributionRatio: z.coerce.number().min(0).max(100),
  jp1OverflowThreshold: z.coerce.number().int().nonnegative("Phải >= 0"),
  splitThreshold: z.coerce.number().int().nonnegative("Phải >= 0"),
  tier1: z.coerce.number().int().positive("Phải > 0"),
  tier2: z.coerce.number().int().positive("Phải > 0"),
  tier3: z.coerce.number().int().positive("Phải > 0"),
});

type JackpotFormValues = z.infer<typeof jackpotFormSchema>;

interface JackpotSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");

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

export function JackpotSection({
  config,
  onSave,
  isPending,
}: JackpotSectionProps) {
  const form = useForm<JackpotFormValues>({
    resolver: zodResolver(jackpotFormSchema) as any,
    values: {
      jp1SeedAmount: config.jackpot.jackpot1.seedAmount,
      jp2SeedAmount: config.jackpot.jackpot2.seedAmount,
      jp1ContributionRatio: config.jackpot.jp1ContributionRatio * 100,
      jp2ContributionRatio: config.jackpot.jp2ContributionRatio * 100,
      jp1OverflowThreshold: config.jackpot.jp1OverflowThreshold,
      splitThreshold: config.jackpot.splitThreshold,
      tier1: config.jackpot.splitRatios.tier1,
      tier2: config.jackpot.splitRatios.tier2,
      tier3: config.jackpot.splitRatios.tier3,
    },
  });

  function handleSubmit(values: JackpotFormValues) {
    onSave({
      jackpot: {
        jackpot1: { seedAmount: values.jp1SeedAmount },
        jackpot2: { seedAmount: values.jp2SeedAmount },
        jp1ContributionRatio: values.jp1ContributionRatio / 100,
        jp2ContributionRatio: values.jp2ContributionRatio / 100,
        jp1OverflowThreshold: values.jp1OverflowThreshold,
        splitThreshold: values.splitThreshold,
        splitRatios: {
          tier1: values.tier1,
          tier2: values.tier2,
          tier3: values.tier3,
        },
      },
    });
  }

  const total =
    (form.watch("tier1") || 0) +
    (form.watch("tier2") || 0) +
    (form.watch("tier3") || 0);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Left: Dual Jackpot Seeds */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Cấu hình Jackpot kép (Dual Jackpot)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    JP1 (trùng 6/6 số chính) và JP2 (trùng 5/6 số chính + số bonus)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jp1SeedAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 mr-1">JP1</Badge>
                          <LabelWithTooltip
                            label="Giá trị khởi điểm"
                            tip="Số tiền khởi điểm của Jackpot 1 khi bắt đầu chu kỳ mới (sau khi có người trúng hoặc reset). Mặc định 30 tỷ VND."
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
                        <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 mr-1">JP2</Badge>
                          <LabelWithTooltip
                            label="Giá trị khởi điểm"
                            tip="Số tiền khởi điểm của Jackpot 2 khi bắt đầu chu kỳ mới (sau khi có người trúng hoặc reset). Mặc định 3 tỷ VND."
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="jp1ContributionRatio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="JP1 — Tỷ lệ tích luỹ (%)"
                            tip="Phần trăm doanh thu tích luỹ vào quỹ Jackpot 1 mỗi kỳ quay. Ví dụ: nếu đặt 90%, thì 90% phần tích luỹ Jackpot sẽ đổ vào JP1."
                          />
                        </FormLabel>
                        <div className="flex items-baseline gap-2">
                          <FormControl>
                            <MoneyInput
                              className="h-10 w-20 text-center font-semibold"
                              value={field.value}
                              onValueChange={(v) => field.onChange(v ?? 0)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              decimalScale={1}
                              thousandSeparator={false}
                            />
                          </FormControl>
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="jp2ContributionRatio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="JP2 — Tỷ lệ tích luỹ (%)"
                            tip="Phần trăm doanh thu tích luỹ vào quỹ Jackpot 2 mỗi kỳ quay. Ví dụ: nếu đặt 10%, thì 10% phần tích luỹ Jackpot sẽ đổ vào JP2."
                          />
                        </FormLabel>
                        <div className="flex items-baseline gap-2">
                          <FormControl>
                            <MoneyInput
                              className="h-10 w-20 text-center font-semibold"
                              value={field.value}
                              onValueChange={(v) => field.onChange(v ?? 0)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              decimalScale={1}
                              thousandSeparator={false}
                            />
                          </FormControl>
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="jp1OverflowThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="JP1 — Ngưỡng tràn (Overflow)"
                          tip="Khi quỹ Jackpot 1 vượt quá ngưỡng này, phần tiền dư ra sẽ tự động chuyển sang quỹ Jackpot 2. Mục đích: tránh JP1 tích luỹ quá lớn, giữ cân bằng hai quỹ."
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
                  name="splitThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Ngưỡng kích hoạt chia (Split)"
                          tip="Khi tổng JP1 + JP2 vượt ngưỡng này, hệ thống sẽ kích hoạt cơ chế chia (split) — phân bổ phần vượt vào các giải cố định theo tỷ lệ chia bên phải. Mục đích: hạn chế Jackpot tích luỹ quá lớn."
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
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Kích hoạt chia khi JP1+JP2 &ge; {fmt(field.value || 0)}đ
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Right: Split Ratios */}
              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Tỷ lệ phân bổ khi chia (Split)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Phần vượt ngưỡng sẽ chia cho các giải cố định theo tỷ lệ phần dưới đây
                  </p>
                </div>

                <div className="space-y-2">
                  {(["tier1", "tier2", "tier3"] as const).map((t) => {
                    const labels: Record<string, { label: string; badge: string; color: string }> = {
                      tier1: { label: "Giải Nhất", badge: "1st", color: "bg-amber-500 text-white" },
                      tier2: { label: "Giải Nhì", badge: "2nd", color: "bg-slate-400 text-white" },
                      tier3: { label: "Giải Ba", badge: "3rd", color: "bg-amber-700 text-white" },
                    };
                    const tier = labels[t]!;
                    const val = form.watch(t) || 0;
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
                    return (
                      <FormField
                        key={t}
                        control={form.control}
                        name={t}
                        render={({ field }) => (
                          <FormItem>
                            <div className="group flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50">
                              <Badge className={`${tier.color} w-9 justify-center text-[10px] font-bold`}>
                                {tier.badge}
                              </Badge>
                              <span className="flex-1 text-sm font-medium">{tier.label}</span>
                              <FormControl>
                                <MoneyInput
                                  className="h-8 w-16 text-center font-semibold"
                                  value={field.value}
                                  onValueChange={(v) => field.onChange(v ?? 1)}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                  thousandSeparator={false}
                                />
                              </FormControl>
                              <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                                {pct}%
                              </span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    );
                  })}
                </div>

                <Separator className="my-3" />

                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Tổng phần</span>
                  <span className="font-bold tabular-nums">{total}</span>
                </div>
              </div>
            </div>

            <div className="border-t bg-blue-50/80 px-6 py-3 dark:bg-blue-950/20">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
                <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                  Power 6/55 có <strong>Dual Jackpot</strong>: JP1 (trùng 6/6) tối thiểu 30 tỷ,
                  JP2 (trùng 5/6 + bonus) tối thiểu 3 tỷ. Tích luỹ mỗi kỳ theo tỷ lệ JP1/JP2.
                  Phần overflow JP1 chuyển sang JP2.
                </p>
              </div>
            </div>
          </CardContent>

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
