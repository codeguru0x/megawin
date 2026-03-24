"use client";

import { Building2, Shield, Clock } from "lucide-react";
import { AccountStatusLabel, AccountStatus } from "@megawin/identity/entities";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import type { PlayerProfileResponse } from "../_shared/queries";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

interface PlayerProfileBannerProps {
  profile: PlayerProfileResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Banner ngang compact thể hiện identity của player.
 *
 * Full-width, single row: username · displayName · status · tenantId · ngày tạo.
 * Không dùng Card để tránh tạo thêm lớp container thừa — chỉ cần divider nhẹ.
 * Tách profile query khỏi date-range vì đây là dữ liệu tĩnh (identity).
 */
export function PlayerProfileBanner({ profile, isLoading, isError }: PlayerProfileBannerProps) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-5 py-3.5 shadow-sm">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-36" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex items-center rounded-xl border bg-card px-5 py-3.5 shadow-sm">
        <p className="text-sm text-destructive">Không thể tải thông tin tài khoản.</p>
      </div>
    );
  }

  const statusVariant = STATUS_VARIANT[profile.status] ?? "outline";
  const statusLabel = AccountStatusLabel[profile.status as AccountStatus] ?? profile.status;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border bg-card px-5 py-3.5 shadow-sm">
      {/* Username — primary identifier */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tài khoản
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">{profile.username}</span>
      </div>

      <Separator />

      {/* Display name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tên hiển thị
        </span>
        <span className="text-sm text-foreground">{profile.displayName}</span>
      </div>

      <Separator />

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Shield className="size-3.5 shrink-0 text-muted-foreground" />
        <Badge variant={statusVariant} className="h-5 text-[11px]">
          {statusLabel}
        </Badge>
      </div>

      <Separator />

      {/* Tenant / Đại lý */}
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">{profile.tenantId}</span>
      </div>

      <Separator />

      {/* Ngày tạo */}
      <div className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="tabular-nums text-xs text-muted-foreground">
          {new Date(profile.createdAt).toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

function Separator() {
  return <span className="hidden h-4 w-px shrink-0 bg-border sm:block" />;
}
