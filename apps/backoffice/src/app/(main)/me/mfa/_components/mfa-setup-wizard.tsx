"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiClientError, apiClient } from "@megawin/next/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { meKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import {
  type SetupMfaFormValues,
  type SetupMfaResponse,
  setupMfaSchema,
  type VerifyMfaFormValues,
  verifyMfaSchema,
} from "../_lib/schema";

type WizardStep = "password" | "qrcode" | "verify" | "done";

interface MfaSetupWizardProps {
  onClose: () => void;
}

const STEPS = [
  { key: "password" as const, label: "Xác nhận", icon: KeyRound },
  { key: "qrcode" as const, label: "Quét mã QR", icon: QrCode },
  { key: "verify" as const, label: "Kích hoạt", icon: ShieldCheck },
];

/** Chia secret code thành nhóm 4 ký tự để dễ đọc. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function MfaSetupWizard({ onClose }: MfaSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("password");
  const [setupData, setSetupData] = useState<SetupMfaResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const qc = useQueryClient();

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  const passwordForm = useForm<SetupMfaFormValues>({
    resolver: zodResolver(setupMfaSchema),
    defaultValues: { password: "" },
  });

  const verifyForm = useForm<VerifyMfaFormValues>({
    resolver: zodResolver(verifyMfaSchema),
    defaultValues: { totpCode: "" },
  });

  const setupMutation = useMutation({
    mutationFn: (values: SetupMfaFormValues) => apiClient.post<SetupMfaResponse>("/me/mfa/setup", values),
    onSuccess: (data) => {
      setSetupData(data);
      setAccessToken(data.accessToken);
      setStep("qrcode");
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Xác thực thất bại. Vui lòng thử lại.");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (values: VerifyMfaFormValues) =>
      apiClient.post("/me/mfa/verify", {
        totpCode: values.totpCode,
        accessToken,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meKeys.mfaStatus });
      setStep("done");
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "Mã xác thực không đúng. Vui lòng thử lại.");
    },
  });

  async function handleCopySecret() {
    if (!setupData) return;
    await navigator.clipboard.writeText(setupData.secretCode);
    setCopied(true);
    toast.success("Đã sao chép mã bí mật");
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "done") {
    return (
      <Card className="gap-0 border-emerald-200/60 py-0 shadow-sm dark:border-emerald-800/40">
        <CardContent className="flex flex-col items-center gap-5 px-5 py-12">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50 dark:bg-emerald-900/50 dark:ring-emerald-900/20">
            <ShieldCheck className="size-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">MFA đã được kích hoạt</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Tài khoản của bạn đã được bảo vệ bằng xác thực 2 lớp. Từ giờ mỗi lần đăng nhập, bạn cần nhập mã từ app
              Authenticator.
            </p>
          </div>
          <Button onClick={onClose} className="mt-1">
            Hoàn tất
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Thiết lập MFA</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Bảo vệ tài khoản bằng xác thực 2 lớp</CardDescription>
          </div>
        </div>

        {/* Stepper — circles + connectors */}
        <nav aria-label="Tiến trình thiết lập" className="mt-5">
          <ol className="mx-auto flex max-w-lg items-center">
            {STEPS.map((s, i) => {
              const isCompleted = i < currentStepIndex;
              const isCurrent = i === currentStepIndex;
              const Icon = s.icon;

              return (
                <li key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 transition-all",
                        isCompleted && "border-primary bg-primary text-primary-foreground",
                        isCurrent && "border-primary bg-primary/10 text-primary ring-4 ring-primary/10",
                        !isCompleted && !isCurrent && "border-muted-foreground/25 text-muted-foreground/50",
                      )}
                    >
                      {isCompleted ? <Check className="size-4" /> : <Icon className="size-3.5" />}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        isCurrent ? "text-primary" : "text-muted-foreground",
                        isCompleted && "text-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div className="mx-2 mb-5 h-0.5 flex-1">
                      <div
                        className={cn(
                          "h-full rounded-full transition-colors",
                          i < currentStepIndex ? "bg-primary" : "bg-muted",
                        )}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </CardHeader>

      <CardContent className="px-5 pb-6 pt-0">
        {/* ─── Bước 1: Xác nhận mật khẩu ─── */}
        {step === "password" && (
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit((v) => setupMutation.mutate(v))}
              className="mx-auto max-w-lg space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Để thiết lập MFA, trước tiên hãy xác nhận mật khẩu tài khoản của bạn.
              </p>
              <FormField
                control={passwordForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mật khẩu hiện tại</FormLabel>
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
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={onClose} disabled={setupMutation.isPending}>
                  Huỷ
                </Button>
                <Button type="submit" disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      Tiếp tục
                      <ArrowRight className="ml-2 size-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ─── Bước 2: Quét mã QR ─── */}
        {step === "qrcode" && setupData && (
          <div className="mx-auto max-w-lg space-y-5">
            {/* Hướng dẫn theo bước */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <ol className="flex flex-col gap-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    1
                  </span>
                  <span className="text-muted-foreground">
                    Mở app <strong className="text-foreground">Google Authenticator</strong>,{" "}
                    <strong className="text-foreground">Authy</strong> hoặc app TOTP bất kỳ
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    2
                  </span>
                  <span className="text-muted-foreground">
                    Chọn <strong className="text-foreground">Thêm tài khoản</strong> rồi quét mã QR bên dưới
                  </span>
                </li>
              </ol>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Smartphone className="size-3.5" />
                Quét mã QR bằng app Authenticator
              </div>
              <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-white p-5">
                <QRCodeSVG value={setupData.otpauthUri} size={180} level="M" />
              </div>
            </div>

            {/* Secret code fallback — chia nhóm 4 ký tự */}
            <div className="rounded-lg border p-4">
              <p className="mb-2.5 text-xs font-medium text-muted-foreground">Không quét được? Nhập mã thủ công:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all rounded-md bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed tracking-wider">
                  {formatSecret(setupData.secretCode)}
                </code>
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={handleCopySecret}>
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("password");
                  setSetupData(null);
                }}
              >
                <ArrowLeft className="mr-2 size-4" />
                Quay lại
              </Button>
              <Button onClick={() => setStep("verify")}>
                Đã quét xong
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Bước 3: Xác thực mã TOTP ─── */}
        {step === "verify" && (
          <Form {...verifyForm}>
            <form
              onSubmit={verifyForm.handleSubmit((v) => verifyMutation.mutate(v))}
              className="mx-auto max-w-lg space-y-6"
            >
              {/* Gợi ý trực quan */}
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 px-4 py-5">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <Smartphone className="size-5 text-primary" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Mở app Authenticator và nhập mã <strong className="text-foreground">6 số</strong> đang hiển thị
                </p>
              </div>

              <FormField
                control={verifyForm.control}
                name="totpCode"
                render={({ field }) => (
                  <FormItem className="flex flex-col items-center gap-2">
                    <FormLabel className="sr-only">Mã xác thực</FormLabel>
                    <FormControl>
                      <InputOTP maxLength={6} value={field.value} onChange={field.onChange} autoFocus>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("qrcode")}
                  disabled={verifyMutation.isPending}
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Quay lại
                </Button>
                <Button type="submit" disabled={verifyMutation.isPending}>
                  {verifyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 size-4" />
                      Kích hoạt MFA
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
