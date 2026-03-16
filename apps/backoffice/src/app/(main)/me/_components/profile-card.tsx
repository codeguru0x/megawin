"use client";

import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  CircleUser,
  Mail,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Clock,
  Loader2,
  Briefcase,
} from "lucide-react";
import { apiClient } from "@megawin/next/client";
import {
  AccountTypeLabel,
  CompanyRoleLabel,
  AgentRoleLabel,
  AccountStatusLabel,
  MfaStatusLabel,
} from "@megawin/identity/entities/labels";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProfileResponse {
  accountId: string;
  username: string;
  displayName: string;
  accountType: string;
  roles: string[];
  status: string;
  mfaStatus: string;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  ...CompanyRoleLabel,
  ...AgentRoleLabel,
};

const mfaStatusConfig = {
  none: {
    icon: ShieldOff,
    variant: "outline" as const,
    color: "text-muted-foreground",
  },
  enabled: {
    icon: ShieldCheck,
    variant: "default" as const,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  disabled: {
    icon: Shield,
    variant: "secondary" as const,
    color: "text-amber-600 dark:text-amber-400",
  },
} as const;

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

export function ProfileCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => apiClient.get<ProfileResponse>("/me/profile"),
  });

  if (isLoading) {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="flex items-center justify-center px-5 py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="px-5 py-16 text-center text-sm text-muted-foreground">
          Không thể tải thông tin tài khoản.
        </CardContent>
      </Card>
    );
  }

  const mfaConfig =
    mfaStatusConfig[data.mfaStatus as keyof typeof mfaStatusConfig] ?? mfaStatusConfig.none;
  const MfaIcon = mfaConfig.icon;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <CircleUser className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Thông tin cá nhân</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              Thông tin tài khoản đang đăng nhập
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0">
        <div className="mx-auto max-w-md divide-y divide-border/50">
          <InfoRow
            icon={<CircleUser className="size-4" />}
            label="Tên tài khoản"
            value={<span className="font-mono text-sm">{data.username}</span>}
          />
          <InfoRow
            icon={<UserCog className="size-4" />}
            label="Tên hiển thị"
            value={data.displayName}
          />
          <InfoRow icon={<Mail className="size-4" />} label="Email" value={data.username} />
          <InfoRow
            icon={<Briefcase className="size-4" />}
            label="Loại tài khoản"
            value={
              <Badge variant="outline">
                {AccountTypeLabel[data.accountType as keyof typeof AccountTypeLabel] ??
                  data.accountType}
              </Badge>
            }
          />
          <InfoRow
            icon={<Shield className="size-4" />}
            label="Quyền hạn"
            value={
              <div className="flex flex-wrap gap-1.5">
                {data.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {roleLabels[role] ?? role}
                  </Badge>
                ))}
              </div>
            }
          />
          <InfoRow
            icon={<Shield className="size-4" />}
            label="Trạng thái"
            value={
              <Badge variant={statusBadgeVariant[data.status] ?? "outline"}>
                {AccountStatusLabel[data.status as keyof typeof AccountStatusLabel] ?? data.status}
              </Badge>
            }
          />
          <InfoRow
            icon={<MfaIcon className={`size-4 ${mfaConfig.color}`} />}
            label="Xác thực 2 lớp (MFA)"
            value={
              <Badge variant={mfaConfig.variant}>
                {MfaStatusLabel[data.mfaStatus as keyof typeof MfaStatusLabel] ?? data.mfaStatus}
              </Badge>
            }
          />
          <InfoRow
            icon={<Clock className="size-4" />}
            label="Ngày tạo tài khoản"
            value={
              <span className="tabular-nums text-sm">
                {new Date(data.createdAt).toLocaleDateString("vi-VN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-right text-sm">{value}</div>
    </div>
  );
}
