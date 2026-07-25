"use client";

import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  please_restart_the_process: "Phiên xác thực đã hết hạn hoặc bị gián đoạn. Vui lòng thử đăng nhập lại.",
  UNKNOWN: "Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.",
  invalid_request: "Yêu cầu không hợp lệ. Vui lòng thử lại.",
  access_denied: "Truy cập bị từ chối. Bạn không có quyền truy cập tài nguyên này.",
  server_error: "Lỗi hệ thống. Vui lòng thử lại sau hoặc liên hệ quản trị viên.",
  temporarily_unavailable: "Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.",
};

const FALLBACK_MESSAGE = "Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.";

function getErrorMessage(code: string | null): string {
  if (!code) return ERROR_MESSAGES.UNKNOWN ?? FALLBACK_MESSAGE;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN ?? FALLBACK_MESSAGE;
}

function formatErrorCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const displayMessage = errorDescription || getErrorMessage(errorCode);
  const displayCode = errorCode || "UNKNOWN";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Lỗi xác thực</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5">
            <span className="font-mono text-muted-foreground text-xs">{formatErrorCode(displayCode)}</span>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed">{displayMessage}</p>
        </CardContent>

        <CardFooter className="flex justify-center gap-3">
          <Link href="/login" prefetch={false}>
            <Button variant="default" size="sm">
              <ArrowLeft />
              Đăng nhập lại
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw />
            Thử lại
          </Button>
        </CardFooter>
      </Card>

      <p className="mt-6 text-muted-foreground text-xs">
        Nếu lỗi tiếp tục xảy ra, vui lòng liên hệ quản trị viên hệ thống.
      </p>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
