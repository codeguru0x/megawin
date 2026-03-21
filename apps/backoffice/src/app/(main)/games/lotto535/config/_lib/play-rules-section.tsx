"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Clock, Globe } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

import type { GameConfig } from "./use-game-config";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

const playFormSchema = z
  .object({
    unitPrice: z.coerce.number().int().positive("Phải > 0"),
    minBetCount: z.coerce.number().int().min(1, "Phải ≥ 1"),
    maxBetCount: z.coerce.number().int().min(1, "Phải ≥ 1"),
    maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
    maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
    salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
    drawTime1: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
    drawTime2: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
  })
  .superRefine((data, ctx) => {
    if (data.maxBetCount < data.minBetCount) {
      ctx.addIssue({
        code: "custom",
        message: `Max betCount (${data.maxBetCount}) phải ≥ min betCount (${data.minBetCount})`,
        path: ["maxBetCount"],
      });
    }

    if (!timePattern.test(data.drawTime1) || !timePattern.test(data.drawTime2)) return;

    const t2 = timeToMinutes(data.drawTime2);
    const gap = t2 - timeToMinutes(data.drawTime1);

    if (gap < data.salesCloseBeforeMinutes) {
      ctx.addIssue({
        code: "custom",
        message: `Kỳ 2 phải sau Kỳ 1 ít nhất ${data.salesCloseBeforeMinutes} phút (= thời gian đóng bán trước giờ quay)`,
        path: ["drawTime2"],
      });
    }
  });

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const DRAWS_PER_DAY = 2;

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
      drawTime1: config.play.drawTimes[0] ?? "10:00",
      drawTime2: config.play.drawTimes[1] ?? "21:00",
    },
  });

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        minBetCount: values.minBetCount,
        maxBetCount: values.maxBetCount,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerDay: DRAWS_PER_DAY,
        drawTimes: [values.drawTime1, values.drawTime2],
      },
    });
  }

  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Left: Pricing & Limits */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Giá vé & Giới hạn</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cấu hình giá và các giới hạn chơi
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Giá mỗi dòng
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
                        = {fmt(field.value || 0)}đ / line
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="minBetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Min betCount
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 1)}
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
                    name="maxBetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Max betCount
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 10)}
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

                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="maxBoardsPerTicket"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Max boards/vé
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
                          Max kỳ liên tiếp
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
                          Đóng trước (phút)
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
              </div>

              {/* Right: Schedule */}
              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Lịch quay số</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cố định {DRAWS_PER_DAY} kỳ quay mỗi ngày
                  </p>
                </div>

                <div className="mb-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                    Số kỳ quay / ngày
                  </p>
                  <div className="flex h-9 w-20 items-center justify-center rounded-md border bg-muted/50 text-sm font-semibold tabular-nums text-muted-foreground">
                    {DRAWS_PER_DAY}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Giờ quay
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="drawTime1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Kỳ 1</FormLabel>
                          <div className="relative">
                            <Clock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <FormControl>
                              <Input
                                className="pl-8 text-center font-mono text-sm font-semibold"
                                placeholder="HH:mm"
                                {...field}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="drawTime2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Kỳ 2</FormLabel>
                          <div className="relative">
                            <Clock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <FormControl>
                              <Input
                                className="pl-8 text-center font-mono text-sm font-semibold"
                                placeholder="HH:mm"
                                {...field}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <Globe className="size-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Múi giờ:{" "}
                    <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
                      Asia/Ho_Chi_Minh
                    </Badge>
                  </p>
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
