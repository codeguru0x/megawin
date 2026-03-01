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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import type { GameConfig } from "./use-game-config";

const DAY_LABELS: Record<number, string> = {
  0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7",
};

const playFormSchema = z.object({
  unitPrice: z.coerce.number().int().positive("Phải > 0"),
  maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
  maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
  salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
  drawTime1: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm"),
  drawDaysOfWeek: z.array(z.number()).min(1, "Cần ít nhất 1 ngày quay"),
});

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function PlayRulesSection({ config, onSave, isPending }: PlayRulesSectionProps) {
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(playFormSchema) as any,
    values: {
      unitPrice: config.play.unitPrice,
      maxBoardsPerTicket: config.play.maxBoardsPerTicket,
      maxDrawCount: config.play.maxDrawCount,
      salesCloseBeforeMinutes: config.play.salesCloseBeforeMinutes,
      drawTime1: config.play.drawTimes[0] ?? "18:00",
      drawDaysOfWeek: config.play.drawDaysOfWeek ?? [2, 4, 6],
    },
  });

  const drawDays = form.watch("drawDaysOfWeek");

  function toggleDay(day: number) {
    const current = form.getValues("drawDaysOfWeek");
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    form.setValue("drawDaysOfWeek", next, { shouldDirty: true });
  }

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerDay: 1,
        drawTimes: [values.drawTime1],
        drawDaysOfWeek: values.drawDaysOfWeek,
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
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Giá vé & Giới hạn</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Cấu hình giá và các giới hạn chơi</p>
                </div>

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Giá mỗi bộ số</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MoneyInput className="pr-14 font-semibold" value={field.value} onValueChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} name={field.name} ref={field.ref} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">VND</span>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground tabular-nums">= {fmt(field.value || 0)}đ / bộ số</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="maxBoardsPerTicket" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Max boards/vé</FormLabel>
                      <FormControl>
                        <MoneyInput className="text-center font-semibold" value={field.value} onValueChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} name={field.name} ref={field.ref} thousandSeparator={false} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxDrawCount" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Max kỳ liên tiếp</FormLabel>
                      <FormControl>
                        <MoneyInput className="text-center font-semibold" value={field.value} onValueChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} name={field.name} ref={field.ref} thousandSeparator={false} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="salesCloseBeforeMinutes" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Đóng trước (phút)</FormLabel>
                      <FormControl>
                        <MoneyInput className="text-center font-semibold" value={field.value} onValueChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} name={field.name} ref={field.ref} thousandSeparator={false} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Lịch quay số</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">1 kỳ quay mỗi ngày quay</p>
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="drawTime1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Giờ quay</FormLabel>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input className="pl-8 text-center font-mono text-sm font-semibold" placeholder="HH:mm" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Ngày quay trong tuần</Label>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`flex h-9 w-12 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                            drawDays.includes(day)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                    <FormField control={form.control} name="drawDaysOfWeek" render={() => <FormMessage />} />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <Globe className="size-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Múi giờ: <Badge variant="secondary" className="ml-1 font-mono text-[10px]">Asia/Ho_Chi_Minh</Badge>
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
