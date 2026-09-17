"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Building2, Save, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { GameConfig } from "./use-game-config";

const ratesFormSchema = z
  .object({
    defaultCommissionRate: z.coerce.number().min(0).max(100),
    companyRate: z.coerce.number().min(0).max(100),
  })
  .refine((data) => data.defaultCommissionRate + data.companyRate <= 100, {
    message: "Tổng hoa hồng và thu công ty không được vượt quá 100%",
    path: ["companyRate"],
  });

type RatesFormValues = z.infer<typeof ratesFormSchema>;

interface RatesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function RatesSection({ config, onSave, isPending }: RatesSectionProps) {
  const form = useForm<RatesFormValues>({
    resolver: zodResolver(ratesFormSchema) as any,
    values: {
      defaultCommissionRate: config.rates.defaultCommissionRate * 100,
      companyRate: config.rates.companyRate * 100,
    },
  });

  useAiFormDirty("rates", form.formState.isDirty);

  function handleSubmit(values: RatesFormValues) {
    onSave({
      rates: {
        defaultCommissionRate: values.defaultCommissionRate / 100,
        companyRate: values.companyRate / 100,
      },
    });
  }

  const commissionRate = form.watch("defaultCommissionRate") || 0;
  const companyRate = form.watch("companyRate") || 0;
  const totalRate = commissionRate + companyRate;
  const remainingRate = Math.max(100 - totalRate, 0);
  const maxCommission = 100 - companyRate;
  const maxCompany = 100 - commissionRate;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            {/* ── Info Section ─────────────────────────── */}
            <div className="p-6 pb-4">
              <h3 className="text-foreground text-sm font-semibold">Tỷ lệ tài chính</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Tiền cược thu về &rarr; hoa hồng đại lý &rarr; trừ giải thưởng cố định &rarr; thu công ty. Phần còn lại
                bổ sung vào quỹ Jackpot.
              </p>
            </div>

            {/* ── Data Section ─────────────────────────── */}
            <div className="border-t px-6 py-5">
              <div className="mb-4 space-y-1.5">
                <div className="bg-muted flex h-3 overflow-hidden rounded-full">
                  <div
                    className="bg-info transition-all duration-300"
                    style={{ width: `${Math.min(commissionRate, 100)}%` }}
                  />
                  <div
                    className="bg-profit transition-all duration-300"
                    style={{
                      width: `${Math.min(companyRate, 100 - Math.min(commissionRate, 100))}%`,
                    }}
                  />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="bg-info inline-block size-2.5 rounded-full" />
                    Hoa hồng đại lý
                    <span className="font-semibold tabular-nums">{commissionRate}%</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="bg-profit inline-block size-2.5 rounded-full" />
                    Thu công ty
                    <span className="font-semibold tabular-nums">{companyRate}%</span>
                  </span>
                  {remainingRate > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="bg-muted-foreground/30 inline-block size-2.5 rounded-full" />
                      Giải thưởng / quỹ
                      <span className="font-semibold tabular-nums">{remainingRate}%</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-0 border-t lg:grid-cols-2">
                <div className="pt-4">
                  <FormField
                    control={form.control}
                    name="defaultCommissionRate"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="bg-info flex size-9 items-center justify-center rounded-lg">
                            <TrendingUp className="text-info size-4" />
                          </div>
                          <div>
                            <FormLabel className="text-sm font-semibold">Hoa hồng đại lý</FormLabel>
                            <p className="text-muted-foreground text-xs">Thu trước từ tiền cược</p>
                          </div>
                        </div>
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
                                floatValue === undefined ||
                                (floatValue >= 0 && floatValue <= Math.max(maxCommission, 0))
                              }
                            />
                          </FormControl>
                          <span className="text-muted-foreground text-lg font-semibold">%</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pl-6">
                  <FormField
                    control={form.control}
                    name="companyRate"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="bg-profit flex size-9 items-center justify-center rounded-lg">
                            <Building2 className="text-profit size-4" />
                          </div>
                          <div>
                            <FormLabel className="text-sm font-semibold">Thu công ty</FormLabel>
                            <p className="text-muted-foreground text-xs">
                              % tổng doanh thu; thực thu bị giới hạn bởi phần còn lại sau hoa hồng và giải cố định
                            </p>
                          </div>
                        </div>
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
                                floatValue === undefined || (floatValue >= 0 && floatValue <= Math.max(maxCompany, 0))
                              }
                            />
                          </FormControl>
                          <span className="text-muted-foreground text-lg font-semibold">%</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
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
