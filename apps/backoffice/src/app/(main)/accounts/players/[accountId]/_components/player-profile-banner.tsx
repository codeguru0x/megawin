"use client";

import { AccountStatusLabel, type AccountStatus } from "@megawin/identity/entities";
import { Building2, Clock, Shield } from "lucide-react";

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
      <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-5 py-3.5 shadow-sm">
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
      <div className="bg-card flex items-center rounded-xl border px-5 py-3.5 shadow-sm">
        <p className="text-destructive text-sm">Không thể tải thông tin tài khoản.</p>
      </div>
    );
  }

  const statusVariant = STATUS_VARIANT[profile.status] ?? "outline";
  const statusLabel = AccountStatusLabel[profile.status as AccountStatus] ?? profile.status;

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border px-5 py-3.5 shadow-sm">
      {/* Username — primary identifier */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">Tài khoản</span>
        <span className="text-foreground font-mono text-sm font-semibold">{profile.username}</span>
      </div>

      <Separator />

      {/* Display name */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">Tên hiển thị</span>
        <span className="text-foreground text-sm">{profile.displayName}</span>
      </div>

      <Separator />

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <Shield className="text-muted-foreground size-3.5 shrink-0" />
        <Badge variant={statusVariant} className="text-2xs h-5">
          {statusLabel}
        </Badge>
      </div>

      <Separator />

      {/* Tenant / Đại lý */}
      <div className="flex min-w-0 items-center gap-2">
        <Building2 className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground font-mono text-xs">{profile.tenantId}</span>
      </div>

      <Separator />

      {/* Ngày tạo */}
      <div className="flex items-center gap-2">
        <Clock className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs tabular-nums">
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
  return <span className="bg-border hidden h-4 w-px shrink-0 sm:block" />;
}
