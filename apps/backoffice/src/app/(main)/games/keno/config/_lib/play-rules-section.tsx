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

import type { KenoGameConfig } from "./use-game-config";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playFormSchema = z.object({
  unitPrice: z.coerce.number().int().positive("Phải > 0"),
  maxBasicBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
  maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
  salesCloseBeforeSeconds: z.coerce.number().int().positive("Phải > 0"),
  drawIntervalMinutes: z.coerce.number().int().positive("Phải > 0"),
  firstDrawTime: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
  lastDrawTime: z.string().regex(timePattern, "Format HH:mm (00:00 – 23:59)"),
});

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: KenoGameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function PlayRulesSection({
  config,
  onSave,
  isPending,
}: PlayRulesSectionProps) {
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(playFormSchema) as any,
    values: {
      unitPrice: config.play.unitPrice,
      maxBasicBoardsPerTicket: config.play.maxBasicBoardsPerTicket,
      maxDrawCount: config.play.maxDrawCount,
      salesCloseBeforeSeconds: config.play.salesCloseBeforeSeconds,
      drawIntervalMinutes: config.play.drawIntervalMinutes,
      firstDrawTime: config.play.firstDrawTime,
      lastDrawTime: config.play.lastDrawTime,
    },
  });

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        maxBasicBoardsPerTicket: values.maxBasicBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeSeconds: values.salesCloseBeforeSeconds,
        drawIntervalMinutes: values.drawIntervalMinutes,
        firstDrawTime: values.firstDrawTime,
        lastDrawTime: values.lastDrawTime,
        timezone: config.play.timezone,
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="space-y-5 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Mệnh giá & Giới hạn
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cấu hình mệnh giá và các giới hạn chơi
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Mệnh giá
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
                        = {fmt(field.value || 0)}đ / lượt
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="maxBasicBoardsPerTicket"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Max panels / vé
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
                </div>

                <FormField
                  control={form.control}
                  name="salesCloseBeforeSeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        Đóng bán trước kỳ quay (giây)
                      </FormLabel>
                      <FormControl>
                        <MoneyInput
                          className="w-24 text-center font-semibold"
                          value={field.value}
                          onValueChange={(v) => field.onChange(v ?? 0)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          thousandSeparator={false}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        = {((field.value || 0) / 60).toFixed(1)} phút
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t p-5 lg:border-l lg:border-t-0">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Lịch quay số
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Keno quay liên tục trong ngày theo khoảng cách cố định
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="drawIntervalMinutes"
                  render={({ field }) => (
                    <FormItem className="mb-5">
                      <FormLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Khoảng cách kỳ (phút)
                      </FormLabel>
                      <FormControl>
                        <MoneyInput
                          className="w-24 text-center font-semibold"
                          value={field.value}
                          onValueChange={(v) => field.onChange(v ?? 0)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          thousandSeparator={false}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Quay mỗi {field.value || 10} phút
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Khung giờ hoạt động
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstDrawTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Kỳ đầu tiên
                          </FormLabel>
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
                      name="lastDrawTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Kỳ cuối cùng
                          </FormLabel>
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
                    <Badge
                      variant="secondary"
                      className="ml-1 font-mono text-[10px]"
                    >
                      {config.play.timezone}
                    </Badge>
                  </p>
                </div>
              </div>
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
              Lưu luật chơi
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
