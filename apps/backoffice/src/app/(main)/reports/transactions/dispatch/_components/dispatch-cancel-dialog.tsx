"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, XCircle } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { useCancelOrder } from "../_lib/use-queries";

const cancelSchema = z.object({
  confirm: z.literal(true, { message: "Bạn phải xác nhận." }),
});

type CancelValues = z.infer<typeof cancelSchema>;

export interface DispatchCancelDialogProps {
  /** `null` = dialog đóng. */
  tx: string | null;
  /** Optional context hiển thị cho user (vd batchKey + amount). */
  label?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DispatchCancelDialog({
  tx,
  label,
  onClose,
  onSuccess,
}: DispatchCancelDialogProps) {
  const isOpen = !!tx;
  const { mutateAsync, isPending } = useCancelOrder();

  const form = useForm<CancelValues>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { confirm: false as unknown as true },
  });

  useEffect(() => {
    if (isOpen) form.reset({ confirm: false as unknown as true });
  }, [isOpen, form]);

  async function onSubmit() {
    if (!tx) return;
    await mutateAsync(tx);
    onSuccess?.();
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-110">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm">
              <XCircle className="size-5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-base font-semibold">Huỷ dispatch order</DialogTitle>
              <DialogDescription className="text-xs">
                Sau khi huỷ, worker sẽ không dispatch order này sang tenant.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 font-mono text-xs">
          <span className="text-muted-foreground">Tx: </span>
          <span className="break-all">{tx}</span>
          {label && <div className="mt-1 font-sans text-muted-foreground">{label}</div>}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  </FormControl>
                  <div className="flex flex-col gap-1">
                    <FormLabel className="cursor-pointer text-sm font-medium">
                      Tôi xác nhận huỷ order này. Hành động không thể hoàn tác.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter className="mt-1 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isPending}
              >
                Đóng
              </Button>
              <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Đang huỷ…
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5" /> Xác nhận huỷ
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
