"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, Copy, Dices, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
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

import { generatePassword } from "./generate-password";

const setPasswordSchema = z.object({
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự."),
});

type SetPasswordValues = z.infer<typeof setPasswordSchema>;

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
}

/** Tính độ mạnh password 0–4 dựa trên length + complexity. */
function getPasswordStrength(pwd: string): number {
  if (pwd.length === 0) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
}

const STRENGTH_CONFIG = [
  { label: "Rất yếu", color: "bg-red-500" },
  { label: "Yếu", color: "bg-orange-500" },
  { label: "Trung bình", color: "bg-yellow-500" },
  { label: "Mạnh", color: "bg-emerald-500" },
  { label: "Rất mạnh", color: "bg-emerald-600" },
] as const;

export function SetPasswordDialog({ open, onOpenChange, username }: SetPasswordDialogProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successPassword, setSuccessPassword] = useState("");

  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "" },
  });

  const passwordValue = form.watch("password");
  const strength = getPasswordStrength(passwordValue);

  const mutation = useMutation({
    mutationFn: (values: SetPasswordValues) =>
      apiClient.post("/accounts/set-password", { username, password: values.password }),
    onSuccess: () => {
      setSuccessPassword(form.getValues("password"));
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error("Đặt mật khẩu thất bại.");
      }
    },
  });

  function handleGenerate() {
    form.setValue("password", generatePassword(12), { shouldValidate: true });
    setShowPassword(true);
  }

  function handleClose(value: boolean) {
    if (!value) {
      form.reset();
      setShowPassword(false);
      setSuccessPassword("");
      setCopied(false);
      mutation.reset();
    }
    onOpenChange(value);
  }

  async function handleCopy() {
    const message = `Tài khoản: ${username}\nMật khẩu mới: ${successPassword}\n\nVui lòng đăng nhập và đổi mật khẩu ngay.`;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast.success("Đã sao chép thông tin.");
    setTimeout(() => setCopied(false), 2000);
  }

  if (successPassword) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-sm">
                <CheckCircle2 className="size-4.5 text-white" />
              </div>
              <div>
                <DialogTitle>Đặt mật khẩu thành công</DialogTitle>
                <DialogDescription className="text-xs">
                  Người dùng phải đổi mật khẩu khi đăng nhập lần tới.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-muted-foreground">Tài khoản</span>
              <span className="font-mono text-sm font-semibold">{username}</span>
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-muted-foreground">Mật khẩu mới</span>
              <span className="font-mono text-sm font-semibold tracking-wider">
                {successPassword}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
              Đóng
            </Button>
            <Button size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-1.5 size-3.5" />
                  Đã sao chép
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 size-3.5" />
                  Sao chép thông tin
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-indigo-600 shadow-sm">
              <KeyRound className="size-4.5 text-white" />
            </div>
            <div>
              <DialogTitle>Đặt mật khẩu mới</DialogTitle>
              <DialogDescription className="text-xs">
                Đặt mật khẩu tạm thời cho{" "}
                <span className="font-semibold text-foreground">{username}</span>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Mật khẩu mới</FormLabel>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Tối thiểu 8 ký tự"
                          autoComplete="new-password"
                          className="pr-10 pl-8.5 text-sm font-mono"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Eye className="size-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerate}
                      title="Tạo mật khẩu ngẫu nhiên"
                      className="shrink-0"
                    >
                      <Dices className="size-3.5" />
                    </Button>
                  </div>
                  {/* Password strength bar */}
                  {passwordValue.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-all duration-300",
                              i < strength
                                ? (STRENGTH_CONFIG[strength]?.color ?? "bg-muted")
                                : "bg-muted",
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Độ mạnh: {STRENGTH_CONFIG[strength]?.label}
                      </p>
                    </div>
                  )}
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 pt-1 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleClose(false)}
                disabled={mutation.isPending}
              >
                Huỷ
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? "Đang xử lý..." : "Xác nhận"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
