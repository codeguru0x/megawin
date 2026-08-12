"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BINGO18_MAX_BOARDS } from "@megawin/game-bingo18/rules";
import { computeDrawsPerDay, HHMM_PATTERN } from "@megawin/shared/utils";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { HelpCircle, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { TimeInput } from "@/components/ui/time-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { Bingo18GameConfig } from "./use-game-config";

const playFormSchema = z
  .object({
    unitPrice: z.coerce.number().int().positive("Phải > 0"),
    minBetCount: z.coerce.number().int().min(1, "Phải ≥ 1"),
    maxBetCount: z.coerce.number().int().positive("Phải > 0"),
    maxBasicBoardsPerTicket: z.coerce
      .number()
      .int()
      .positive("Phải > 0")
      .max(BINGO18_MAX_BOARDS, `Tối đa ${BINGO18_MAX_BOARDS}`),
    maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
    salesCloseBeforeSeconds: z.coerce.number().int().positive("Phải > 0"),
    drawIntervalMinutes: z.coerce.number().int().positive("Phải > 0"),
    firstDrawTime: z.string().regex(HHMM_PATTERN, "Format HH:mm (00:00 – 23:59)"),
    lastDrawTime: z.string().regex(HHMM_PATTERN, "Format HH:mm (00:00 – 23:59)"),
  })
  .refine((data) => data.maxBetCount >= data.minBetCount, {
    message: "Số lượt tối đa phải ≥ số lượt tối thiểu",
    path: ["maxBetCount"],
  });

type PlayFormValues = z.infer<typeof playFormSchema>;

interface PlayRulesSectionProps {
  config: Bingo18GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

function LabelWithTooltip({ label, tip, className }: { label: string; tip: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export function PlayRulesSection({ config, onSave, isPending }: PlayRulesSectionProps) {
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(playFormSchema) as any,
    values: {
      unitPrice: config.play.unitPrice,
      minBetCount: config.play.minBetCount,
      maxBetCount: config.play.maxBetCount,
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
        minBetCount: values.minBetCount,
        maxBetCount: values.maxBetCount,
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

  const drawsPerDay = computeDrawsPerDay(
    form.watch("firstDrawTime"),
    form.watch("lastDrawTime"),
    form.watch("drawIntervalMinutes") || 0,
  );

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Cột trái — Giá vé & Giới hạn */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Giá vé & Giới hạn</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cấu hình giá 1 lượt chơi và các giới hạn số lượng khi đặt cược Bingo 18.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Giá mỗi lượt chơi"
                          tip="Giá cho 1 panel × 1 lượt tham gia dự thưởng. Tổng tiền vé = giá này × số panel × số lượt × số kỳ. Tiền thưởng trả theo bội số giá này."
                        />
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="maxBasicBoardsPerTicket"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Số boards tối đa / vé"
                            tip={`Số panel (A–F) tối đa trên 1 vé — tối đa hiện cấu hình là ${form.watch("maxBasicBoardsPerTicket") || 0} panel. Mỗi panel chơi 1 cách độc lập: Một số, Hai số trùng, Ba số trùng, Cộng tổng, hoặc Lớn/Hoà/Nhỏ. Không được cấu hình vượt ${BINGO18_MAX_BOARDS} (trần cứng toàn hệ thống).`}
                          />
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
                          <LabelWithTooltip
                            label="Kỳ liên tiếp tối đa"
                            tip="Mua 1 vé đăng ký tham gia tối đa bao nhiêu kỳ Bingo 18 liên tiếp. Mỗi kỳ tạo 1 entry riêng."
                          />
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
                    name="salesCloseBeforeSeconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Đóng bán trước"
                            tip={`Ngừng nhận vé trước giờ quay số bao nhiêu giây. Bingo 18 dùng đơn vị giây vì kỳ quay rất ngắn (hiện ${form.watch("drawIntervalMinutes") || 0} phút/kỳ).`}
                          />
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

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="minBetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          <LabelWithTooltip
                            label="Số lượt tối thiểu"
                            tip="Số lần tham gia dự thưởng tối thiểu mỗi board. Người chơi không thể chọn ít hơn giá trị này."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 1)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={true}
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
                          <LabelWithTooltip
                            label="Số lượt tối đa"
                            tip="Số lần tham gia dự thưởng tối đa mỗi board. Tiền thưởng nhân theo số lượt — trúng với 10 lượt nhận 10× giá trị giải."
                          />
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            className="text-center font-semibold"
                            value={field.value}
                            onValueChange={(v) => field.onChange(v ?? 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            thousandSeparator={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Cột phải — Lịch quay số */}
              <div className="border-t p-6 lg:border-l lg:border-t-0">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Lịch quay số</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bingo 18 quay liên tục trong ngày theo khoảng cách cố định
                    {drawsPerDay !== null ? (
                      <>
                        {" — với cấu hình hiện tại: "}
                        <strong>{drawsPerDay} kỳ/ngày</strong>
                      </>
                    ) : null}
                    .
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="drawIntervalMinutes"
                  render={({ field }) => (
                    <FormItem className="mb-5">
                      <FormLabel className="text-xs text-muted-foreground">
                        <LabelWithTooltip
                          label="Khoảng cách kỳ (phút)"
                          tip="Thời gian giữa 2 kỳ quay liên tiếp. Mặc định 6 phút theo lịch Vietlott chính thức."
                        />
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
                            <LabelWithTooltip
                              label="Kỳ đầu tiên"
                              tip="Giờ quay kỳ đầu tiên trong ngày. Hệ thống tự tính các kỳ tiếp theo cách đều nhau."
                            />
                          </FormLabel>
                          <FormControl>
                            <TimeInput {...field} />
                          </FormControl>
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
                            <LabelWithTooltip
                              label="Kỳ cuối cùng"
                              tip="Giờ quay kỳ cuối cùng trong ngày. Không có kỳ nào được tạo sau thời điểm này."
                            />
                          </FormLabel>
                          <FormControl>
                            <TimeInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
