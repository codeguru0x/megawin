"use client";

/**
 * Login client component – hiển thị UI và trigger Cognito sign-in.
 */

import { useEffect, useState } from "react";
import { Loader2, LogIn, Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/lib/auth-client";
import { APP_CONFIG } from "@/config/app-config";

export function LoginClient({
  callbackUrl,
}: {
  readonly callbackUrl?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      await signIn.social({
        provider: "cognito",
        callbackURL: callbackUrl ?? "/",
      });
    } catch (err) {
      setError("Đăng nhập thất bại. Vui lòng thử lại.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">{APP_CONFIG.name}</CardTitle>
          <CardDescription>
            Đăng nhập vào hệ thống quản trị để tiếp tục sử dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-center text-destructive text-sm">
              {error}
            </div>
          )}
          <Button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang chuyển hướng...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Đăng nhập với AWS Cognito
              </>
            )}
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            {APP_CONFIG.copyright}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
