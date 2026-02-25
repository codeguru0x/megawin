"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DollarSign, Save } from "lucide-react";

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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { GameConfig } from "./use-game-config";

const PRIZE_FIELDS = [
  { key: "tier1" as const, label: "Giải Nhất", desc: "5 số chính" },
  { key: "tier2" as const, label: "Giải Nhì", desc: "4 chính + ĐB" },
  { key: "tier3" as const, label: "Giải Ba", desc: "4 chính" },
  { key: "tier4" as const, label: "Giải Tư", desc: "3 chính + ĐB" },
  { key: "tier5" as const, label: "Giải Năm", desc: "3 chính" },
  { key: "consolation" as const, label: "Khuyến Khích", desc: "chỉ ĐB" },
] as const;

const prizesFormSchema = z.object({
  tier1: z.number().int().positive("Phải > 0"),
  tier2: z.number().int().positive("Phải > 0"),
  tier3: z.number().int().positive("Phải > 0"),
  tier4: z.number().int().positive("Phải > 0"),
  tier5: z.number().int().positive("Phải > 0"),
  consolation: z.number().int().positive("Phải > 0"),
});

type PrizesFormValues = z.infer<typeof prizesFormSchema>;

interface PrizesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const form = useForm<PrizesFormValues>({
    resolver: zodResolver(prizesFormSchema),
    values: { ...config.defaultPrizes },
  });

  function handleSubmit(values: PrizesFormValues) {
    onSave({ defaultPrizes: values });
  }

  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="size-5 text-emerald-500" />
          <CardTitle>Giải thưởng cố định</CardTitle>
        </div>
        <CardDescription>
          Giá trị giải thưởng mặc định cho từng hạng (VND)
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent>
            <div className="space-y-3">
              {PRIZE_FIELDS.map((p) => (
                <FormField
                  key={p.key}
                  control={form.control}
                  name={p.key}
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <FormLabel className="text-sm">
                        {p.label}{" "}
                        <span className="text-muted-foreground font-normal">
                          ({p.desc})
                        </span>
                      </FormLabel>
                      <div className="flex flex-col items-end gap-0.5">
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            step={1000}
                            className="w-40 text-right tabular-nums"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {fmt(field.value || 0)}đ
                        </span>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu giải thưởng
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
