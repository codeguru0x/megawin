"use client";

import type { ReactNode } from "react";
import { CircleUser, Building2, Shield, Clock, CalendarClock } from "lucide-react";
import { AccountStatusLabel, AccountStatus } from "@megawin/identity/entities";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { PlayerProfileResponse } from "../_shared/queries";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

interface PlayerProfileCardProps {
  profile: PlayerProfileResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Card thông tin identity của player.
 * Pattern giống ProfileCard trong /me — InfoRow layout với divide-y.
 */
export function PlayerProfileCard({ profile, isLoading, isError }: PlayerProfileCardProps) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CircleUser className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Thông tin tài khoản</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {isLoading && (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        )}
        {isError && (
          <p className="py-8 text-center text-sm text-destructive">
            Không thể tải thông tin tài khoản.
          </p>
        )}
        {!isLoading && !isError && profile && (
          <div className="divide-y divide-border/50">
            <InfoRow
              icon={<CircleUser className="size-4" />}
              label="Tên tài khoản"
              value={<span className="font-mono text-sm">{profile.username}</span>}
            />
            <InfoRow
              icon={<CircleUser className="size-4" />}
              label="Tên hiển thị"
              value={profile.displayName}
            />
            <InfoRow
              icon={<Shield className="size-4" />}
              label="Trạng thái"
              value={
                <Badge variant={STATUS_VARIANT[profile.status] ?? "outline"}>
                  {AccountStatusLabel[profile.status as AccountStatus] ?? profile.status}
                </Badge>
              }
            />
            <InfoRow
              icon={<Building2 className="size-4" />}
              label="Đại lý"
              value={<span className="font-mono text-xs">{profile.tenantId}</span>}
            />
            <InfoRow
              icon={<Clock className="size-4" />}
              label="Ngày tạo"
              value={
                <span className="tabular-nums text-sm">
                  {new Date(profile.createdAt).toLocaleDateString("vi-VN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              }
            />
            <InfoRow
              icon={<CalendarClock className="size-4" />}
              label="Cập nhật lần cuối"
              value={
                <span className="tabular-nums text-sm">
                  {new Date(profile.updatedAt).toLocaleDateString("vi-VN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              }
            />
          </div>
        )}
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
