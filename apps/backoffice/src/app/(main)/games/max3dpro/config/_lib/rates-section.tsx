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

import type { GameConfig } from "./use-game-config";

const ratesFormSchema = z.object({
  defaultCommissionRate: z.coerce
    .number()
    .min(0, "Toi thieu 0%")
    .max(100, "Toi da 100%"),
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
    },
  });

  function handleSubmit(values: RatesFormValues) {
    onSave({
      rates: {
        defaultCommissionRate: values.defaultCommissionRate / 100,
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <h3 className="text-sm font-semibold text-foreground">
                Ty le tai chinh
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tien cuoc thu ve &rarr; hoa hong dai ly &rarr; tru giai thuong
                co dinh &rarr; loi nhuan cong ty
              </p>
            </div>

            <div className="p-6 border-t">
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
                          Hoa hong dai ly
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Thu truoc tu tien cuoc
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

                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        Phan con lai sau hoa hong va giai thuong = loi nhuan cong ty
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button
              type="submit"
              disabled={isPending || !form.formState.isDirty}
            >
              {isPending ? (
                <Spinner className="mr-2" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Luu ty le tai chinh
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
