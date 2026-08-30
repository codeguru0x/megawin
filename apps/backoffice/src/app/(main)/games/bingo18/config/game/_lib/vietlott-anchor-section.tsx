"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HHMM_PATTERN, YMD_PATTERN } from "@megawin/shared/utils";
import { CalendarDays, ExternalLink, Hash, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TimeInput } from "@/components/ui/time-input";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { Bingo18GameConfig } from "./use-game-config";

const vietlottAnchorFormSchema = z.object({
  anchorDrawDate: z.string().regex(YMD_PATTERN, "Format YYYY-MM-DD"),
  anchorDrawTime: z.string().regex(HHMM_PATTERN, "Format HH:mm (00:00 – 23:59)"),
  anchorPeriod: z.string().regex(/^\d+$/, "Mã kỳ phải là chuỗi số"),
});

type VietlottAnchorFormValues = z.infer<typeof vietlottAnchorFormSchema>;

interface VietlottAnchorSectionProps {
  config: Bingo18GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

/**
 * Section neo suy mã kỳ Vietlott (`drawPeriod`) — dùng để gợi ý/prefill mã kỳ trong dialog
 * công bố kết quả. Tách RIÊNG khỏi `PlayRulesSection` vì đây là dữ liệu vận hành (mốc đối
 * chiếu với Vietlott thật), không phải luật chơi.
 *
 * Neo nhận MỘT kỳ bất kỳ (không bắt buộc kỳ đầu ngày) — chọn kỳ nào đang thấy trên trang
 * Vietlott, càng gần hiện tại càng tốt để giảm rủi ro lịch quay đổi giữa neo và hiện tại.
 */
export function VietlottAnchorSection({ config, onSave, isPending }: VietlottAnchorSectionProps) {
  const form = useForm<VietlottAnchorFormValues>({
    resolver: zodResolver(vietlottAnchorFormSchema) as any,
    values: {
      anchorDrawDate: config.vietlott?.anchorDrawDate ?? "",
      anchorDrawTime: config.vietlott?.anchorDrawTime ?? "",
      anchorPeriod: config.vietlott?.anchorPeriod ?? "",
    },
  });

  useAiFormDirty("vietlott-anchor", form.formState.isDirty);

  function handleSubmit(values: VietlottAnchorFormValues) {
    onSave({ vietlott: values });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Mã kỳ</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nhập thông tin của MỘT kỳ bất kỳ đang hiển thị trên trang Vietlott (càng gần hiện tại càng tốt). Hệ
                  thống dùng neo này để tự gợi ý mã kỳ cho các kỳ khác khi công bố kết quả.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="anchorDrawDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="size-3" /> Ngày quay
                    </FormLabel>
                    <FormControl>
                      <Input type="date" className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="anchorDrawTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Giờ quay</FormLabel>
                    <FormControl>
                      <TimeInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="anchorPeriod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Hash className="size-3" /> Mã kỳ Vietlott
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="VD: 0183496" className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              ⚠️ Giờ quay bạn nhập ở trên phải đúng với lịch quay số đang cấu hình ở mục "Lịch quay số" bên trên. Nếu sau
              này lịch quay số thay đổi (giờ kỳ đầu, giờ kỳ cuối, hoặc khoảng cách giữa các kỳ), phải cập nhật lại thông
              tin ở đây — nếu không, hệ thống sẽ gợi ý sai mã kỳ cho các kỳ sau.
            </p>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu cấu hình
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
