"use client";

import type { CSSProperties } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Save, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { KenoGameConfig } from "./use-game-config";

const ratesFormSchema = z.object({
  defaultCommissionRate: z.coerce.number().min(0, "Tối thiểu 0%").max(100, "Tối đa 100%"),
});

type RatesFormValues = z.infer<typeof ratesFormSchema>;

interface RatesSectionProps {
  config: KenoGameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function RatesSection({ config, onSave, isPending }: RatesSectionProps) {
  const form = useForm<RatesFormValues>({
    resolver: zodResolver(ratesFormSchema) as any,
    values: {
      defaultCommissionRate: config.rates.defaultCommissionRate * 100,
    },
  });

  useAiFormDirty("rates", form.formState.isDirty);

  function handleSubmit(values: RatesFormValues) {
    onSave({
      rates: {
        defaultCommissionRate: values.defaultCommissionRate / 100,
      },
    });
  }

  const commissionRate = form.watch("defaultCommissionRate") || 0;
  const remainingRate = Math.max(100 - commissionRate, 0);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <h3 className="text-foreground text-sm font-semibold">Tỷ lệ tài chính</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Keno không có Jackpot và không có tỷ lệ "thu công ty" cấu hình riêng — công ty nhận phần dư sau khi trừ
                hoa hồng đại lý và toàn bộ tiền trả thưởng thực tế
              </p>
            </div>

            <div className="mx-6 mb-2 space-y-1.5">
              <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
                <div className="flex h-full">
                  <div
                    className="h-full w-[var(--bar-w)] bg-blue-500 transition-all duration-300"
                    style={{ "--bar-w": `${Math.min(commissionRate, 100)}%` } as CSSProperties}
                  />
                </div>
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-blue-500" />
                  Hoa hồng: {commissionRate}%
                </span>
                {remainingRate > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full bg-emerald-500" />
                    Còn lại để trả thưởng + lợi nhuận: {remainingRate}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Phần {remainingRate}% này <strong>chưa trừ giải thưởng</strong>. Lợi nhuận thực = {remainingRate}% −
                tổng tiền trả thưởng thực tế của kỳ quay (xem tab Giải thưởng để biết tỷ lệ trả thưởng kỳ vọng).
              </p>
            </div>

            <div className="border-t p-6">
              <FormField
                control={form.control}
                name="defaultCommissionRate"
                render={({ field }) => (
                  <FormItem>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                        <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <FormLabel className="text-sm font-semibold">Hoa hồng đại lý</FormLabel>
                        <p className="text-muted-foreground text-xs">Thu trước từ tiền cược</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-baseline gap-2">
                        <FormControl>
                          <MoneyInput
                            className="h-12 w-24 text-center text-2xl font-bold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            decimalScale={1}
                            thousandSeparator={false}
                            isAllowed={({ floatValue }) =>
                              floatValue === undefined || (floatValue >= 0 && floatValue <= 100)
                            }
                          />
                        </FormControl>
                        <span className="text-muted-foreground text-lg font-semibold">%</span>
                      </div>
                      <p className="text-muted-foreground text-xs tabular-nums">Tối đa 100%</p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu tỷ lệ tài chính
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
