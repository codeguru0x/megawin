"use client";

/**
 * Login client component – hiển thị UI và trigger Cognito sign-in.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Crown, Loader2, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app-config";
import { saveAuthCallbackUrl } from "@/lib/auth/callback-url-storage";
import { signIn } from "@/lib/auth-client";

const AUTO_REDIRECT_SECONDS = 1;

export function LoginClient({ callbackUrl }: { readonly callbackUrl?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Chống double-invoke handleSignIn (click tay trùng thời điểm auto-redirect effect
  // fire, do AUTO_REDIRECT_SECONDS=1 rất ngắn). `isLoading` (state) không đủ vì cập
  // nhật bất đồng bộ qua re-render — 2 lời gọi gần như đồng thời vẫn có thể lọt qua
  // trước khi re-render tới. Ref đọc/ghi đồng bộ ngay trong cùng tick, chặn được lời
  // gọi thứ 2. Double-invoke khiến 2 request generateState() chạy song song, mỗi
  // request set lại cookie `oauth_state` (đè lên nhau) nhưng browser chỉ redirect
  // theo URL (chứa `state` query param) của MỘT trong hai request — nếu cookie cuối
  // cùng không khớp `state` trên URL đó → Cognito callback báo `state_mismatch` NGAY,
  // không cần chờ hết hạn 10 phút.
  const hasStartedRef = useRef(false);

  const handleSignIn = useCallback(async () => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    // Dừng timer khi user click hoặc tự động redirect
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    // Lưu callbackUrl TRƯỚC khi rời trang — OAuth state của better-auth hết hạn
    // cứng sau 10 phút (không config được), nếu user để trang Cognito mở quá lâu
    // callback sẽ báo state_mismatch và mất luôn callbackUrl gốc. auth/error đọc
    // lại giá trị này để đưa user về đúng trang đích khi thử đăng nhập lại.
    saveAuthCallbackUrl(callbackUrl ?? "/");

    try {
      await signIn.social({
        provider: "cognito",
        callbackURL: callbackUrl ?? "/",
      });
    } catch (err) {
      setError("Đăng nhập thất bại. Vui lòng thử lại.");
      setIsLoading(false);
      hasStartedRef.current = false;
      // Reset countdown khi lỗi
      setCountdown(AUTO_REDIRECT_SECONDS);
    }
  }, [callbackUrl]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Tự động redirect khi countdown về 0
  useEffect(() => {
    if (countdown === 0 && !isLoading) {
      void handleSignIn();
    }
  }, [countdown, isLoading, handleSignIn]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">{APP_CONFIG.name}</CardTitle>
          <CardDescription>Đăng nhập vào hệ thống quản trị để tiếp tục sử dụng.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-center text-destructive text-sm">{error}</div>
          )}
          <Button onClick={handleSignIn} disabled={isLoading} className="w-full" size="lg">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang chuyển hướng...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Đăng nhập
              </>
            )}
          </Button>
          {!isLoading && (
            <p className="text-center text-muted-foreground text-sm">
              Tự động chuyển hướng sau <span className="font-semibold text-primary">{countdown}</span> giây
            </p>
          )}
          <p className="text-center text-muted-foreground text-xs">{APP_CONFIG.copyright}</p>
        </CardContent>
      </Card>
    </div>
  );
}
