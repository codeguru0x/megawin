"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Info, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { type ChangePasswordFormValues, changePasswordSchema, PASSWORD_RULES } from "../_lib/schema";

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
      <CardHeader className="px-5 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50">
            <KeyRound className="size-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Đổi mật khẩu</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Cập nhật mật khẩu đăng nhập cho tài khoản của bạn
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
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
                          <EyeOff className="size-4 text-muted-foreground" />
                        ) : (
                          <Eye className="size-4 text-muted-foreground" />
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
                          <EyeOff className="size-4 text-muted-foreground" />
                        ) : (
                          <Eye className="size-4 text-muted-foreground" />
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
                          <EyeOff className="size-4 text-muted-foreground" />
                        ) : (
                          <Eye className="size-4 text-muted-foreground" />
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
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
              <div className="mb-2.5 flex items-center gap-2">
                <Info className="size-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Lưu ý bảo mật</span>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="block size-1 shrink-0 rounded-full bg-amber-500" />
                  Không sử dụng lại mật khẩu đã dùng ở dịch vụ khác
                </li>
                <li className="flex items-center gap-2">
                  <span className="block size-1 shrink-0 rounded-full bg-amber-500" />
                  Đổi mật khẩu định kỳ mỗi 90 ngày
                </li>
                <li className="flex items-center gap-2">
                  <span className="block size-1 shrink-0 rounded-full bg-amber-500" />
                  Không chia sẻ mật khẩu với bất kỳ ai
                </li>
                <li className="flex items-center gap-2">
                  <span className="block size-1 shrink-0 rounded-full bg-amber-500" />
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
      color: "bg-amber-500",
      textColor: "text-amber-600 dark:text-amber-400",
    },
    strong: {
      label: "Mạnh",
      color: "bg-emerald-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
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
                passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
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
