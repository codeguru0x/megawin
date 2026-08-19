"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatNumber } from "@megawin/shared/utils";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Info, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";
import { cn } from "@/lib/utils";

import type { KenoGameConfig } from "./use-game-config";

const capsFormSchema = z.object({
  pick10MaxPerDraw: z.coerce.number().int().positive("Phải > 0"),
  pick10MaxSetsForFixed: z.coerce.number().int().positive("Phải > 0"),
  pick9MaxPerDraw: z.coerce.number().int().positive("Phải > 0"),
  pick9MaxSetsForFixed: z.coerce.number().int().positive("Phải > 0"),
  pick8MaxPerDraw: z.coerce.number().int().positive("Phải > 0"),
  pick8MaxSetsForFixed: z.coerce.number().int().positive("Phải > 0"),
});

type CapsFormValues = z.infer<typeof capsFormSchema>;

interface PayoutCapsSectionProps {
  config: KenoGameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const fmt = formatNumber;

const CAP_ROWS = [
  {
    pick: 10,
    badge: "bg-red-500",
    maxPerDrawField: "pick10MaxPerDraw" as const,
    maxSetsField: "pick10MaxSetsForFixed" as const,
  },
  {
    pick: 9,
    badge: "bg-orange-500",
    maxPerDrawField: "pick9MaxPerDraw" as const,
    maxSetsField: "pick9MaxSetsForFixed" as const,
  },
  {
    pick: 8,
    badge: "bg-amber-600",
    maxPerDrawField: "pick8MaxPerDraw" as const,
    maxSetsField: "pick8MaxSetsForFixed" as const,
  },
] as const;

export function PayoutCapsSection({ config, onSave, isPending }: PayoutCapsSectionProps) {
  const form = useForm<CapsFormValues>({
    resolver: zodResolver(capsFormSchema) as any,
    values: { ...config.payoutCaps },
  });

  useAiFormDirty("payout-caps", form.formState.isDirty);

  function handleSubmit(values: CapsFormValues) {
    onSave({ payoutCaps: values });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <h3 className="text-sm font-semibold text-foreground">Giới hạn trả thưởng mỗi kỳ</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Giới hạn tổng giải thưởng cho bậc cao (8, 9, 10) khi có nhiều bộ trúng
              </p>
            </div>

            <div className="border-t bg-amber-50/80 px-6 py-2.5 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  Nếu số bộ trúng vượt ngưỡng, tổng giải tối đa / kỳ sẽ được chia đều cho số bộ trúng thay vì trả giải
                  cố định.
                </p>
              </div>
            </div>

            <div className="border-t space-y-4 p-6">
              {CAP_ROWS.map((cap) => {
                const maxPerDraw = form.watch(cap.maxPerDrawField);
                const maxSets = form.watch(cap.maxSetsField);
                const fixedPrize = config.basicPrizes[`pick${cap.pick}`]?.[cap.pick] ?? 0;

                return (
                  <div key={cap.pick} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-white", cap.badge)}>Bậc {cap.pick}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Trùng {cap.pick}/{cap.pick} số · Giải cố định: <strong>{fmt(fixedPrize)} VND</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={cap.maxPerDrawField}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Tổng giải tối đa / kỳ (VND)</FormLabel>
                            <FormControl>
                              <MoneyInput
                                className="font-semibold"
                                value={field.value}
                                onValueChange={(v) => field.onChange(v ?? 0)}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={cap.maxSetsField}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Ngưỡng số bộ trả cố định</FormLabel>
                            <FormControl>
                              <MoneyInput
                                className="font-semibold"
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

                    <p className="text-xs text-muted-foreground">
                      ≤{maxSets} bộ: {fmt(fixedPrize)} VND/bộ &middot; &gt;
                      {maxSets} bộ: {fmt(maxPerDraw)} VND ÷ số bộ trúng
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu giới hạn trả thưởng
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
