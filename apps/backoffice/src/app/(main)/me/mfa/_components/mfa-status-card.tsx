"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2 } from "lucide-react";
import { apiClient } from "@megawin/next/client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { MfaStatusResponse } from "../_lib/schema";

interface MfaStatusCardProps {
  onSetup: () => void;
  onDisable: () => void;
}

const statusConfig = {
  none: {
    icon: ShieldOff,
    title: "MFA chưa được thiết lập",
    description:
      "Tài khoản của bạn chưa bật xác thực 2 lớp. Kích hoạt MFA để tăng cường bảo mật.",
    badgeLabel: "Chưa thiết lập",
    badgeVariant: "outline" as const,
    iconColor: "text-muted-foreground",
    bgColor: "bg-muted/30",
  },
  enabled: {
    icon: ShieldCheck,
    title: "MFA đang hoạt động",
    description:
      "Tài khoản của bạn đang được bảo vệ bằng xác thực 2 lớp qua app Authenticator.",
    badgeLabel: "Đang bật",
    badgeVariant: "default" as const,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  disabled: {
    icon: ShieldAlert,
    title: "MFA đã tắt",
    description:
      "Xác thực 2 lớp đã bị tắt. Tài khoản của bạn chỉ được bảo vệ bằng mật khẩu.",
    badgeLabel: "Đã tắt",
    badgeVariant: "secondary" as const,
    iconColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
  },
} as const;

export function MfaStatusCard({ onSetup, onDisable }: MfaStatusCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "mfa", "status"],
    queryFn: () => apiClient.get<MfaStatusResponse>("/me/mfa/status"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const mfaStatus = data?.mfaStatus ?? "none";
  const config = statusConfig[mfaStatus];
  const Icon = config.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bgColor}`}
            >
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
            <div>
              <CardTitle className="text-base">{config.title}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
          <Badge variant={config.badgeVariant}>{config.badgeLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="mb-2 text-sm font-medium">
              Xác thực 2 lớp (TOTP) là gì?
            </h4>
            <p className="text-sm text-muted-foreground">
              Mỗi lần đăng nhập, ngoài mật khẩu, bạn cần nhập thêm mã 6 số từ
              app Authenticator (Google Authenticator, Authy, Microsoft
              Authenticator...). Điều này giúp bảo vệ tài khoản ngay cả khi mật
              khẩu bị lộ.
            </p>
          </div>

          <div className="flex gap-3">
            {mfaStatus === "enabled" ? (
              <Button variant="destructive" onClick={onDisable}>
                <ShieldOff className="mr-2 h-4 w-4" />
                Tắt MFA
              </Button>
            ) : (
              <Button onClick={onSetup}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {mfaStatus === "disabled" ? "Bật lại MFA" : "Thiết lập MFA"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
