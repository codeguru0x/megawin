"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings2, Save, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

import type { GameConfig } from "./use-game-config";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const playFormSchema = z.object({
  unitPrice: z.coerce.number().int().positive("Phải > 0"),
  maxBoardsPerTicket: z.coerce.number().int().positive("Phải > 0"),
  maxDrawCount: z.coerce.number().int().positive("Phải > 0"),
  salesCloseBeforeMinutes: z.coerce.number().int().positive("Phải > 0"),
  drawsPerDay: z.coerce.number().int().positive("Phải > 0"),
  drawTimes: z
    .array(z.object({ value: z.string().regex(timePattern, "Format HH:mm") }))
    .min(1, "Phải có ít nhất 1 giờ quay"),
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
      drawsPerDay: config.play.drawsPerDay,
      drawTimes: config.play.drawTimes.map((v) => ({ value: v })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "drawTimes",
  });

  function handleSubmit(values: PlayFormValues) {
    onSave({
      play: {
        unitPrice: values.unitPrice,
        maxBoardsPerTicket: values.maxBoardsPerTicket,
        maxDrawCount: values.maxDrawCount,
        salesCloseBeforeMinutes: values.salesCloseBeforeMinutes,
        drawsPerDay: values.drawsPerDay,
        drawTimes: values.drawTimes.map((t) => t.value),
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-violet-500" />
          <CardTitle>Luật chơi</CardTitle>
        </div>
        <CardDescription>
          Cấu hình giá vé, lịch quay và giới hạn chơi
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giá 1 line (VND)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1000} {...field} />
                    </FormControl>
                    <FormDescription>
                      {(field.value || 0).toLocaleString("vi-VN")}đ / line
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxBoardsPerTicket"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max boards / vé</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="maxDrawCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max kỳ liên tiếp</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
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
                    <FormLabel>Đóng bán trước (phút)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <FormField
              control={form.control}
              name="drawsPerDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số kỳ / ngày</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} className="w-24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Giờ quay</FormLabel>
              <div className="flex flex-wrap gap-2">
                {fields.map((f, idx) => (
                  <FormField
                    key={f.id}
                    control={form.control}
                    name={`drawTimes.${idx}.value`}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-1">
                        <FormControl>
                          <Input
                            className="w-24 text-center"
                            placeholder="HH:mm"
                            {...field}
                          />
                        </FormControl>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => remove(idx)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ value: "" })}
                >
                  <Plus className="mr-1 size-3.5" />
                  Thêm
                </Button>
              </div>
            </div>

            <div className="rounded-md bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Timezone cố định: <strong>Asia/Ho_Chi_Minh</strong>
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
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
