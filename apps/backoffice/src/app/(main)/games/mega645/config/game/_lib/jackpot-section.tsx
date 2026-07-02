"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Trophy, Info } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";

import type { GameConfig } from "./use-game-config";

const jackpotFormSchema = z.object({
  seedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
});

type JackpotFormValues = z.infer<typeof jackpotFormSchema>;

interface JackpotSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function JackpotSection({ config, onSave, isPending }: JackpotSectionProps) {
  const form = useForm<JackpotFormValues>({
    resolver: zodResolver(jackpotFormSchema) as any,
    values: {
      seedAmount: config.jackpot.seedAmount,
    },
  });

  function handleSubmit(values: JackpotFormValues) {
    onSave({
      jackpot: {
        seedAmount: values.seedAmount,
      },
    });
  }

  const seedAmount = form.watch("seedAmount") || 0;

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/40">
                  <Trophy className="size-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Cấu hình Jackpot</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mega 6/45 theo luật Vietlott — Jackpot tích luỹ (roll-over), không có cơ chế chia
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t p-6">
              <FormField
                control={form.control}
                name="seedAmount"
                render={({ field }) => (
                  <FormItem className="max-w-md">
                    <FormLabel className="text-xs text-muted-foreground">
                      Giá trị khởi điểm
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MoneyInput
                          className="h-12 pr-14 text-xl font-bold"
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
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Quỹ Jackpot khởi điểm mỗi chu kỳ mới: {formatNumber(seedAmount)}đ
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t bg-blue-50/80 px-6 py-3 dark:bg-blue-950/20">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
                <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                  Giá trị khởi điểm là số tiền tối thiểu của quỹ Jackpot khi bắt đầu một chu kỳ mới
                  (sau khi có người trúng Độc Đắc). Nếu không có người trúng, quỹ sẽ{" "}
                  <strong>tích luỹ (roll-over)</strong> sang kỳ tiếp theo. Theo quy định Vietlott,
                  Jackpot khởi điểm tối thiểu là <strong>12 tỷ VND</strong>.
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
