"use client";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Không thể tải thông tin tài khoản.
        </CardContent>
      </Card>
    );
  }

  const mfaConfig = mfaStatusConfig[data.mfaStatus as keyof typeof mfaStatusConfig] ?? mfaStatusConfig.none;
  const MfaIcon = mfaConfig.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CircleUser className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Thông tin cá nhân</CardTitle>
            <CardDescription>
              Thông tin tài khoản đang đăng nhập
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          <InfoRow
            icon={<CircleUser className="h-4 w-4" />}
            label="Tên tài khoản"
            value={
              <span className="font-mono text-sm">{data.username}</span>
            }
          />
          <InfoRow
            icon={<UserCog className="h-4 w-4" />}
            label="Tên hiển thị"
            value={data.displayName}
          />
          <InfoRow
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={data.username}
          />
          <InfoRow
            icon={<Briefcase className="h-4 w-4" />}
            label="Loại tài khoản"
            value={
              <Badge variant="outline">
                {AccountTypeLabel[data.accountType as keyof typeof AccountTypeLabel] ?? data.accountType}
              </Badge>
            }
          />
          <InfoRow
            icon={<Shield className="h-4 w-4" />}
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
            icon={<Shield className="h-4 w-4" />}
            label="Trạng thái"
            value={
              <Badge variant={statusBadgeVariant[data.status] ?? "outline"}>
                {AccountStatusLabel[data.status as keyof typeof AccountStatusLabel] ?? data.status}
              </Badge>
            }
          />
          <InfoRow
            icon={<MfaIcon className={`h-4 w-4 ${mfaConfig.color}`} />}
            label="Xác thực 2 lớp (MFA)"
            value={
              <Badge variant={mfaConfig.variant}>
                {MfaStatusLabel[data.mfaStatus as keyof typeof MfaStatusLabel] ?? data.mfaStatus}
              </Badge>
            }
          />
          <InfoRow
            icon={<Clock className="h-4 w-4" />}
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

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
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
