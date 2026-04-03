"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, TrendingUp } from "lucide-react";

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

import type { Bingo18GameConfig } from "./use-game-config";

const ratesFormSchema = z.object({
  defaultCommissionRate: z.coerce
    .number()
    .min(0, "Tối thiểu 0%")
    .max(100, "Tối đa 100%"),
});

type RatesFormValues = z.infer<typeof ratesFormSchema>;

interface RatesSectionProps {
  config: Bingo18GameConfig;
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
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                Tỷ lệ tài chính
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tiền cược thu về &rarr; trừ hoa hồng đại lý &rarr; trừ giải
                thưởng &rarr; lợi nhuận công ty
              </p>
            </div>

            <div className="mx-5 mb-2 space-y-1.5">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className="flex h-full">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.min(commissionRate, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-blue-500" />
                  Hoa hồng: {commissionRate}%
                </span>
                {remainingRate > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full bg-muted-foreground/30" />
                    Giải thưởng + lợi nhuận: {remainingRate}%
                  </span>
                )}
              </div>
            </div>

            <div className="border-t p-5">
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
                        <FormLabel className="text-sm font-semibold">
                          Hoa hồng đại lý
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Thu trước từ tiền cược
                        </p>
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
                              floatValue === undefined ||
                              (floatValue >= 0 && floatValue <= 100)
                            }
                          />
                        </FormControl>
                        <span className="text-lg font-semibold text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-5 py-2.5">
            <Button
              type="submit"
              disabled={isPending || !form.formState.isDirty}
            >
              {isPending ? (
                <Spinner className="mr-2" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Lưu tỷ lệ tài chính
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
