"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { readAuthCallbackUrl } from "@/lib/auth/callback-url-storage";
import { consumeAuthRecoveryAttempt, isRecoverableAuthError } from "@/lib/auth/state-recovery";

/**
 * `state_mismatch`/`state_invalid`/`state_not_found` xảy ra khi OAuth `state` (cookie
 * `oauth_state`) đã hết hạn hoặc không khớp — better-auth giới hạn CỨNG 10 phút, không
 * config được (xem `state-recovery.ts` JSDoc). Trường hợp phổ biến nhất: user bị timeout
 * session → tự động chuyển sang `/login` → tự động sang Cognito Hosted UI, nhưng để
 * trang đó mở quá lâu mới nhập thông tin. Đây KHÔNG phải lỗi hệ thống — chỉ cần đăng
 * nhập lại — nên các mã này được TỰ ĐỘNG khôi phục (xem {@link useAuthErrorRecovery}),
 * chỉ hiện message dưới đây khi đã hết budget auto-recovery.
 */
const STATE_EXPIRED_MESSAGE =
  "Phiên đăng nhập đã hết hạn do trang đăng nhập được mở quá lâu (quá 10 phút). Vui lòng đăng nhập lại.";

const ERROR_MESSAGES: Record<string, string> = {
  please_restart_the_process: "Phiên xác thực đã hết hạn hoặc bị gián đoạn. Vui lòng thử đăng nhập lại.",
  UNKNOWN: "Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.",
  invalid_request: "Yêu cầu không hợp lệ. Vui lòng thử lại.",
  access_denied: "Truy cập bị từ chối. Bạn không có quyền truy cập tài nguyên này.",
  server_error: "Lỗi hệ thống. Vui lòng thử lại sau hoặc liên hệ quản trị viên.",
  temporarily_unavailable: "Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.",
  state_mismatch: STATE_EXPIRED_MESSAGE,
  state_invalid: STATE_EXPIRED_MESSAGE,
  state_not_found: STATE_EXPIRED_MESSAGE,
  state_generation_error: STATE_EXPIRED_MESSAGE,
};

const FALLBACK_MESSAGE = "Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.";

function getErrorMessage(code: string | null): string {
  if (!code) {
    return ERROR_MESSAGES.UNKNOWN ?? FALLBACK_MESSAGE;
  }
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN ?? FALLBACK_MESSAGE;
}

function formatErrorCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Dựng URL `/login` kèm trang đích ban đầu.
 *
 * PHẢI gọi ở thời điểm dùng (event handler / effect), KHÔNG gọi trong thân render:
 * `readAuthCallbackUrl()` đọc `localStorage` nên server và client cho ra giá trị khác
 * nhau → hydration mismatch (đã xảy ra thật: server render `href="/login?callbackUrl=%2F"`,
 * client render `href="/login?callbackUrl=%2Fgames%2Fkeno%2Fdraws"`).
 */
function buildLoginHref(): string {
  return `/login?callbackUrl=${encodeURIComponent(readAuthCallbackUrl())}`;
}

/** Trạng thái xử lý lỗi: chờ quyết định → tự khôi phục, hoặc hiển thị lỗi cho user. */
const RecoveryPhase = {
  /** Chưa mount xong / chưa quyết định — tránh nháy card lỗi rồi mới redirect. */
  Deciding: "deciding",
  /** Đang tự động chạy lại flow đăng nhập. */
  Recovering: "recovering",
  /** Không tự khôi phục được (lỗi không recoverable, hoặc hết budget) → hiện lỗi. */
  Failed: "failed",
} as const;
type RecoveryPhase = (typeof RecoveryPhase)[keyof typeof RecoveryPhase];

/**
 * Guard ở MODULE SCOPE (không phải `useRef`) — theo pattern "initialize once per page load".
 *
 * `/auth/error` luôn được vào bằng full page load (better-auth redirect 302 từ callback), nên
 * quyết định "có auto-recovery hay không" thuộc về LẦN LOAD TRANG, không thuộc về instance
 * component — module scope reset sạch ở mỗi lần load. Đặt ở module scope còn chặn luôn
 * double-invoke của StrictMode (dev: mount → cleanup → mount lại): nếu để ở `useRef`, một lần
 * vào trang lỗi sẽ ăn 2 suất budget → user hết auto-recovery ngay từ lần đầu.
 */
let hasDecidedRecovery = false;

/**
 * Tự động chạy lại luồng đăng nhập với các mã lỗi `state_*` thay vì bắt user tự bấm.
 *
 * Chạy lại thường thành công IM LẶNG: Cognito đã có session cookie riêng (user vừa nhập
 * credential ngay trước đó) nên Hosted UI redirect về liền, không hỏi lại mật khẩu.
 * `window.location.replace` (không phải `assign`) để không nhồi `/auth/error` vào history
 * — user bấm Back sẽ về đúng trang trước đó, không quay lại trang lỗi.
 */
function useAuthErrorRecovery(errorCode: string | null): RecoveryPhase {
  const [phase, setPhase] = useState<RecoveryPhase>(RecoveryPhase.Deciding);

  useEffect(() => {
    if (hasDecidedRecovery) {
      return;
    }
    hasDecidedRecovery = true;

    if (!isRecoverableAuthError(errorCode)) {
      setPhase(RecoveryPhase.Failed);
      return;
    }

    // Hết budget → dừng auto-recovery, hiện lỗi. Nếu không có chặn này, lỗi mang tính
    // hệ thống (browser chặn cookie, cấu hình Cognito sai) sẽ tạo loop vô hạn
    // /auth/error → /login → Cognito → /auth/error.
    if (!consumeAuthRecoveryAttempt()) {
      setPhase(RecoveryPhase.Failed);
      return;
    }

    setPhase(RecoveryPhase.Recovering);
    window.location.replace(buildLoginHref());
  }, [errorCode]);

  return phase;
}

function AuthRecoveringCard() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-muted-foreground text-sm">Đang khôi phục phiên đăng nhập...</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const phase = useAuthErrorRecovery(errorCode);

  // Đọc localStorage tại thời điểm click (không phải khi render) — vừa tránh hydration
  // mismatch, vừa luôn lấy giá trị mới nhất nếu tab khác vừa ghi lại callbackUrl.
  const handleRetryLogin = useCallback(() => {
    window.location.assign(buildLoginHref());
  }, []);

  // errorDescription từ better-auth (vd "State not found in OAuth callback") là tiếng Anh,
  // kỹ thuật, không thân thiện với người dùng cuối — ưu tiên message tiếng Việt đã map sẵn
  // hơn errorDescription (khác với hành vi cũ: errorDescription luôn được ưu tiên trước).
  const displayMessage =
    errorCode && ERROR_MESSAGES[errorCode] ? ERROR_MESSAGES[errorCode] : errorDescription || getErrorMessage(errorCode);
  const displayCode = errorCode || "UNKNOWN";

  if (phase !== RecoveryPhase.Failed) {
    return <AuthRecoveringCard />;
  }

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
          <Button variant="default" size="sm" onClick={handleRetryLogin}>
            <ArrowLeft />
            Đăng nhập lại
          </Button>
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
