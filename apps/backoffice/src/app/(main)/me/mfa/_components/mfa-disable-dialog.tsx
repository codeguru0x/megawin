"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { apiClient, ApiClientError } from "@megawin/next/client";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { disableMfaSchema, type DisableMfaFormValues } from "../_lib/schema";

interface MfaDisableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MfaDisableDialog({
  open,
  onOpenChange,
  onSuccess,
}: MfaDisableDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const qc = useQueryClient();

  const form = useForm<DisableMfaFormValues>({
    resolver: zodResolver(disableMfaSchema),
    defaultValues: { password: "", totpCode: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: DisableMfaFormValues) =>
      apiClient.post("/me/mfa/disable", values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me", "mfa", "status"] });
      toast.success("MFA đã được tắt");
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Tắt MFA thất bại. Vui lòng thử lại."
      );
    },
  });

  function handleClose(value: boolean) {
    if (!value) {
      form.reset();
      setShowPassword(false);
      mutation.reset();
    }
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" />
            Tắt xác thực 2 lớp
          </DialogTitle>
          <DialogDescription>
            Thao tác này sẽ giảm bảo mật tài khoản. Bạn cần xác nhận danh tính
            bằng mật khẩu và mã TOTP hiện tại.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="border-destructive/30">
          <AlertDescription className="text-sm">
            Sau khi tắt MFA, tài khoản chỉ được bảo vệ bằng mật khẩu. Bạn có thể
            bật lại bất cứ lúc nào.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder="Nhập mật khẩu"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totpCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã xác thực (6 số)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      className="text-center font-mono text-lg tracking-[0.5em]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Xác nhận tắt MFA"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
