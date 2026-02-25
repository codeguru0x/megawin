"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Percent, Save } from "lucide-react";

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
import { Spinner } from "@/components/ui/spinner";

import type { GameConfig } from "./use-game-config";

const ratesFormSchema = z.object({
  defaultCommissionRate: z.coerce
    .number()
    .min(0, "Tối thiểu 0%")
    .max(100, "Tối đa 100%"),
  companyRate: z.coerce
    .number()
    .min(0, "Tối thiểu 0%")
    .max(100, "Tối đa 100%"),
});

type RatesFormValues = z.infer<typeof ratesFormSchema>;

interface RatesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

export function RatesSection({ config, onSave, isPending }: RatesSectionProps) {
  const form = useForm<RatesFormValues>({
    resolver: zodResolver(ratesFormSchema) as any,
    values: {
      defaultCommissionRate: config.rates.defaultCommissionRate * 100,
      companyRate: config.rates.companyRate * 100,
    },
  });

  function handleSubmit(values: RatesFormValues) {
    onSave({
      rates: {
        defaultCommissionRate: values.defaultCommissionRate / 100,
        companyRate: values.companyRate / 100,
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Percent className="size-5 text-blue-500" />
          <CardTitle>Tỷ lệ tài chính</CardTitle>
        </div>
        <CardDescription>Hoa hồng đại lý và tỷ lệ thu công ty</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="defaultCommissionRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hoa hồng mặc định (%)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step={0.1} {...field} />
                  </FormControl>
                  <FormDescription>
                    Áp dụng cho tenant chưa có override riêng
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tỷ lệ công ty (%)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step={0.1} {...field} />
                  </FormControl>
                  <FormDescription>Phần doanh thu công ty giữ lại</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu tỷ lệ
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
