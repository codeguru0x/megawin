"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Info, HelpCircle } from "lucide-react";
import { formatNumber } from "@megawin/shared/utils";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { GameConfig } from "./use-game-config";

const jackpotFormSchema = z.object({
  seedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
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

const TIER_LABELS: Record<string, { label: string; badge: string; color: string }> = {
  tier1: {
    label: "Giải Nhất",
    badge: "1st",
    color: "bg-orange-500 text-white",
  },
  tier2: { label: "Giải Nhì", badge: "2nd", color: "bg-slate-400 text-white" },
  tier3: { label: "Giải Ba", badge: "3rd", color: "bg-amber-700 text-white" },
};

export function JackpotSection({ config, onSave, isPending }: JackpotSectionProps) {
  const form = useForm<JackpotFormValues>({
    resolver: zodResolver(jackpotFormSchema) as any,
    values: {
      seedAmount: config.jackpot.seedAmount,
      splitThreshold: config.jackpot.splitThreshold,
      tier1: config.jackpot.splitRatios.tier1,
      tier2: config.jackpot.splitRatios.tier2,
      tier3: config.jackpot.splitRatios.tier3,
    },
  });

  function handleSubmit(values: JackpotFormValues) {
    onSave({
      jackpot: {
        seedAmount: values.seedAmount,
        splitThreshold: values.splitThreshold,
        splitRatios: {
          tier1: values.tier1,
          tier2: values.tier2,
          tier3: values.tier3,
        },
      },
    });
  }

  const fmt = formatNumber;

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

  const total =
    (form.watch("tier1") || 0) + (form.watch("tier2") || 0) + (form.watch("tier3") || 0);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Left: Seed & Threshold */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Cấu hình Jackpot</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Giá trị khởi điểm khi bắt đầu chu kỳ mới và ngưỡng kích hoạt chia
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="seedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <LabelWithTooltip
                          label="Giá trị khởi điểm (Seed)"
                          tip="Số tiền khởi điểm của Jackpot khi bắt đầu chu kỳ mới (sau khi có người trúng Jackpot hoặc reset). Đây là giá trị tối thiểu người chơi có thể trúng Jackpot."
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
                        = {fmt(field.value || 0)}đ khi bắt đầu Jackpot mới
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="splitThreshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <LabelWithTooltip
                          label="Ngưỡng kích hoạt chia (Split)"
                          tip="Khi quỹ Jackpot vượt ngưỡng này, hệ thống sẽ kích hoạt cơ chế chia (split) — phân bổ phần vượt vào các giải cố định theo tỷ lệ chia bên phải. Mục đích: hạn chế Jackpot tích luỹ quá lớn."
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
                        Kích hoạt chia khi Jackpot &ge; {fmt(field.value || 0)}đ
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Right: Split Ratios — 3 tiers */}
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
                    const tier = TIER_LABELS[t]!;
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
                              <Badge
                                className={`${tier.color} w-9 justify-center text-[10px] font-bold`}
                              >
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
                  Đơn vị làm tròn cố định <strong>5,000đ</strong>. Phần dư do làm tròn sẽ cộng vào
                  hạng cao nhất có người trúng. Giải Nhất luôn nhận phần dư nếu có.
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
