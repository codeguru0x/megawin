"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Clock, Globe, CalendarDays } from "lucide-react";

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

import type { GameConfig } from "./use-game-config";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_OPTIONS = [
  { value: 0, label: "CN" },
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
] as const;

const playFormSchema = z.object({
  unitPrice: z.coerce.number().int().positive("Phải > 0"),
  maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
  maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
  salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
  drawsPerWeek: z.coerce.number().int().min(1).max(7),
  drawDaysOfWeek: z.array(z.number()).min(1, "Chọn ít nhất 1 ngày"),
  drawTime: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
});

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function PlayRulesSection({
  config,
  onSave,
  isPending,
}: PlayRulesSectionProps) {
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(playFormSchema) as any,
    values: {
      unitPrice: config.play.unitPrice,
      maxBoardsPerTicket: config.play.maxBoardsPerTicket,
      maxDrawCount: config.play.maxDrawCount,
      salesCloseBeforeMinutes: config.play.salesCloseBeforeMinutes,
      drawsPerWeek: config.play.drawsPerWeek,
      drawDaysOfWeek: config.play.drawDaysOfWeek,
      drawTime: config.play.drawTime ?? "18:00",
    },
  });

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerWeek: values.drawsPerWeek,
        drawDaysOfWeek: values.drawDaysOfWeek,
        drawTime: values.drawTime,
      },
    });
  }

  const fmt = (n: number) => n.toLocaleString("en-US");
  const watchedDays = form.watch("drawDaysOfWeek") ?? [];

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Left: Pricing & Limits */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Giá vé & Giới hạn
                  </h3>
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
                  <h3 className="text-sm font-semibold text-foreground">
                    Lịch quay số
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cố định {form.watch("drawsPerWeek")} kỳ quay mỗi tuần
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="drawsPerWeek"
                  render={({ field }) => (
                    <FormItem className="mb-5">
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Số kỳ quay / tuần
                      </FormLabel>
                      <FormControl>
                        <MoneyInput
                          className="h-9 w-20 text-center font-semibold"
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
                  name="drawDaysOfWeek"
                  render={() => (
                    <FormItem className="mb-5">
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 block">
                        Ngày quay trong tuần
                      </FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {DAY_OPTIONS.map((day) => {
                          const checked = watchedDays.includes(day.value);
                          return (
                            <label
                              key={day.value}
                              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer transition-colors ${
                                checked
                                  ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-400"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  const next = c
                                    ? [...watchedDays, day.value].sort()
                                    : watchedDays.filter((d) => d !== day.value);
                                  form.setValue("drawDaysOfWeek", next, {
                                    shouldDirty: true,
                                  });
                                }}
                                className="sr-only"
                              />
                              <CalendarDays className="size-3.5" />
                              {day.label}
                            </label>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Giờ quay
                  </p>
                  <FormField
                    control={form.control}
                    name="drawTime"
                    render={({ field }) => (
                      <FormItem>
                        <div className="relative w-32">
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

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <Globe className="size-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Múi giờ:{" "}
                    <Badge
                      variant="secondary"
                      className="ml-1 font-mono text-[10px]"
                    >
                      Asia/Ho_Chi_Minh
                    </Badge>
                  </p>
                </div>
              </div>
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
              Lưu luật chơi
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
