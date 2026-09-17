"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { apiClient, ApiClientError } from "@megawin/next/client";
import { useMutation } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Info, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { changePasswordSchema, PASSWORD_RULES, type ChangePasswordFormValues } from "../_lib/schema";

export function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    mode: "onChange",
  });

  const newPasswordValue = form.watch("newPassword");

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordFormValues) => apiClient.post("/me/change-password", values),
    onSuccess: () => {
      toast.success("Đổi mật khẩu thành công", {
        description: "Mật khẩu đã được cập nhật. Bạn có thể tiếp tục sử dụng hệ thống.",
      });
      form.reset();
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        toast.error("Đổi mật khẩu thất bại", { description: error.message });
      } else {
        toast.error("Đổi mật khẩu thất bại", {
          description: "Đã xảy ra lỗi không xác định. Vui lòng thử lại.",
        });
      }
    },
  });

  function onSubmit(values: ChangePasswordFormValues) {
    mutation.mutate(values);
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-game-max3d flex size-7 items-center justify-center rounded-lg">
            <KeyRound className="text-game-max3d size-3.5" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Đổi mật khẩu</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Cập nhật mật khẩu đăng nhập cho tài khoản của bạn
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto max-w-md space-y-5">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu hiện tại</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showCurrent ? "text" : "password"}
                        placeholder="Nhập mật khẩu hiện tại"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowCurrent(!showCurrent)}
                        tabIndex={-1}
                      >
                        {showCurrent ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
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
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mật khẩu mới</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showNew ? "text" : "password"}
                        placeholder="Nhập mật khẩu mới"
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowNew(!showNew)}
                        tabIndex={-1}
                      >
                        {showNew ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {newPasswordValue.length > 0 && <PasswordStrength password={newPasswordValue} />}

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Xác nhận mật khẩu mới</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showConfirm ? "text" : "password"}
                        placeholder="Nhập lại mật khẩu mới"
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowConfirm(!showConfirm)}
                        tabIndex={-1}
                      >
                        {showConfirm ? (
                          <EyeOff className="text-muted-foreground size-4" />
                        ) : (
                          <Eye className="text-muted-foreground size-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={() => form.reset()} disabled={mutation.isPending}>
                Huỷ
              </Button>
              <Button type="submit" disabled={mutation.isPending || !form.formState.isValid}>
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 size-4" />
                    Cập nhật mật khẩu
                  </>
                )}
              </Button>
            </div>

            {/* Lưu ý bảo mật — nằm trong cùng card */}
            <div className="border-warning/60 bg-warning/50 rounded-lg border p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <Info className="text-warning size-3.5" />
                <span className="text-warning text-xs font-semibold">Lưu ý bảo mật</span>
              </div>
              <ul className="text-muted-foreground space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <span className="bg-warning block size-1 shrink-0 rounded-full" />
                  Không sử dụng lại mật khẩu đã dùng ở dịch vụ khác
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-warning block size-1 shrink-0 rounded-full" />
                  Đổi mật khẩu định kỳ mỗi 90 ngày
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-warning block size-1 shrink-0 rounded-full" />
                  Không chia sẻ mật khẩu với bất kỳ ai
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-warning block size-1 shrink-0 rounded-full" />
                  Sử dụng trình quản lý mật khẩu (Password Manager) để lưu trữ an toàn
                </li>
              </ul>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const passedCount = PASSWORD_RULES.filter((rule) => rule.test(password)).length;

  const strength = passedCount <= 2 ? "weak" : passedCount <= 4 ? "medium" : "strong";

  const strengthConfig = {
    weak: { label: "Yếu", color: "bg-destructive", textColor: "text-destructive" },
    medium: {
      label: "Trung bình",
      color: "bg-warning",
      textColor: "text-warning",
    },
    strong: {
      label: "Mạnh",
      color: "bg-profit",
      textColor: "text-profit",
    },
  } as const;

  const config = strengthConfig[strength];

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Độ mạnh mật khẩu</span>
        <span className={cn("text-xs font-semibold", config.textColor)}>{config.label}</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= passedCount ? config.color : "bg-muted")}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(password);
          return (
            <div
              key={rule.label}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                passed ? "text-profit" : "text-muted-foreground",
              )}
            >
              {passed ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
              {rule.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
