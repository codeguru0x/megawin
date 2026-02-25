"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trophy, Save } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

import type { GameConfig } from "./use-game-config";

const jackpotFormSchema = z.object({
  seedAmount: z.coerce.number().int().nonnegative("Phải >= 0"),
  splitThreshold: z.coerce.number().int().nonnegative("Phải >= 0"),
  tier1: z.coerce.number().int().positive("Phải > 0"),
  tier2: z.coerce.number().int().positive("Phải > 0"),
  tier3: z.coerce.number().int().positive("Phải > 0"),
  tier4: z.coerce.number().int().positive("Phải > 0"),
  tier5: z.coerce.number().int().positive("Phải > 0"),
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
      splitThreshold: config.jackpot.splitThreshold,
      tier1: config.jackpot.splitRatios.tier1,
      tier2: config.jackpot.splitRatios.tier2,
      tier3: config.jackpot.splitRatios.tier3,
      tier4: config.jackpot.splitRatios.tier4,
      tier5: config.jackpot.splitRatios.tier5,
    },
  });

  function handleSubmit(values: JackpotFormValues) {
    onSave({
      jackpot: {
        seedAmount: values.seedAmount,
        splitThreshold: values.splitThreshold,
        splitRatios: {
          tier1: values.tier1,
          tier2: values.tier2,
          tier3: values.tier3,
          tier4: values.tier4,
          tier5: values.tier5,
        },
      },
    });
  }

  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-amber-500" />
          <CardTitle>Cấu hình Jackpot</CardTitle>
        </div>
        <CardDescription>
          Quản lý seed, ngưỡng chia và tỷ lệ chia Jackpot
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="seedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seed Amount (VND)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1000} {...field} />
                    </FormControl>
                    <FormDescription>
                      Khởi điểm Jackpot mới: {fmt(field.value || 0)}đ
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="splitThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngưỡng chia (VND)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1000} {...field} />
                    </FormControl>
                    <FormDescription>
                      Kích hoạt chia khi &ge; {fmt(field.value || 0)}đ
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium">Tỷ lệ chia Jackpot (split ratios)</p>
              <div className="rounded-lg border bg-amber-50/50 p-3 dark:bg-amber-950/10">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-amber-500 text-white">Giải Nhất</Badge>
                  <span className="text-xs text-muted-foreground">
                    Nhận thêm phần dư làm tròn
                  </span>
                </div>
                <FormField
                  control={form.control}
                  name="tier1"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Phần chia =</span>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            className="h-8 w-20 text-center font-semibold"
                            {...field}
                          />
                        </FormControl>
                        <span className="text-sm">/ tổng</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {(["tier2", "tier3", "tier4", "tier5"] as const).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t === "tier2" ? "Giải Nhì" : t === "tier3" ? "Giải Ba" : t === "tier4" ? "Giải Tư" : "Giải Năm"}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["tier2", "tier3", "tier4", "tier5"] as const).map((t) => (
                    <FormField
                      key={t}
                      control={form.control}
                      name={t}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">
                            {t === "tier2" ? "Nhì" : t === "tier3" ? "Ba" : t === "tier4" ? "Tư" : "Năm"}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-center font-semibold"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-3 flex items-center gap-2">
                <Badge variant="outline">Khuyến Khích</Badge>
                <span className="text-xs text-muted-foreground">
                  Không tham gia chia Jackpot
                </span>
              </div>

              <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950/20">
                <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                  <strong>Lưu ý:</strong> Đơn vị làm tròn cố định 5.000đ. Phần dư
                  do làm tròn cộng vào hạng cao nhất có người trúng.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu Jackpot
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
