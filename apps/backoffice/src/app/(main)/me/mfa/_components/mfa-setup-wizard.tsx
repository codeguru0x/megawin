"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { apiClient, ApiClientError } from "@megawin/next/client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

import {
  setupMfaSchema,
  verifyMfaSchema,
  type SetupMfaFormValues,
  type VerifyMfaFormValues,
  type SetupMfaResponse,
} from "../_lib/schema";

type WizardStep = "password" | "qrcode" | "verify" | "done";

interface MfaSetupWizardProps {
  onClose: () => void;
}

export function MfaSetupWizard({ onClose }: MfaSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("password");
  const [setupData, setSetupData] = useState<SetupMfaResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const qc = useQueryClient();

  const passwordForm = useForm<SetupMfaFormValues>({
    resolver: zodResolver(setupMfaSchema),
    defaultValues: { password: "" },
  });

  const verifyForm = useForm<VerifyMfaFormValues>({
    resolver: zodResolver(verifyMfaSchema),
    defaultValues: { totpCode: "" },
  });

  const setupMutation = useMutation({
    mutationFn: (values: SetupMfaFormValues) =>
      apiClient.post<SetupMfaResponse>("/me/mfa/setup", values),
    onSuccess: (data) => {
      setSetupData(data);
      setAccessToken(data.accessToken);
      setStep("qrcode");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Xác thực thất bại. Vui lòng thử lại."
      );
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (values: VerifyMfaFormValues) =>
      apiClient.post("/me/mfa/verify", {
        totpCode: values.totpCode,
        accessToken,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me", "mfa", "status"] });
      setStep("done");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Mã xác thực không đúng. Vui lòng thử lại."
      );
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
      <Card className="border-emerald-500/30">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">MFA đã được kích hoạt</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tài khoản của bạn đã được bảo vệ bằng xác thực 2 lớp.
              <br />
              Từ giờ mỗi lần đăng nhập, bạn cần nhập mã từ app Authenticator.
            </p>
          </div>
          <Button onClick={onClose} className="mt-2">
            Hoàn tất
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Thiết lập MFA</CardTitle>
            <CardDescription>
              {step === "password" && "Bước 1/3 — Xác nhận mật khẩu"}
              {step === "qrcode" && "Bước 2/3 — Quét mã QR"}
              {step === "verify" && "Bước 3/3 — Xác thực mã TOTP"}
            </CardDescription>
          </div>
        </div>
        <div className="mt-4 flex gap-1">
          {["password", "qrcode", "verify"].map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= ["password", "qrcode", "verify"].indexOf(step)
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {step === "password" && (
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit((v) =>
                setupMutation.mutate(v)
              )}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Để thiết lập MFA, trước tiên hãy xác nhận mật khẩu tài khoản của
                bạn.
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
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={setupMutation.isPending}
                >
                  Huỷ
                </Button>
                <Button type="submit" disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      Tiếp tục
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {step === "qrcode" && setupData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                Quét mã QR bằng app Authenticator
              </div>
              <div className="rounded-xl border bg-white p-4">
                <QRCodeSVG value={setupData.otpauthUri} size={200} level="M" />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Không quét được? Nhập mã thủ công:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm">
                  {setupData.secretCode}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("password");
                  setSetupData(null);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Quay lại
              </Button>
              <Button onClick={() => setStep("verify")}>
                Đã quét xong
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "verify" && (
          <Form {...verifyForm}>
            <form
              onSubmit={verifyForm.handleSubmit((v) =>
                verifyMutation.mutate(v)
              )}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Nhập mã 6 số hiển thị trên app Authenticator để hoàn tất thiết
                lập.
              </p>
              <FormField
                control={verifyForm.control}
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
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("qrcode")}
                  disabled={verifyMutation.isPending}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Quay lại
                </Button>
                <Button type="submit" disabled={verifyMutation.isPending}>
                  {verifyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
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
