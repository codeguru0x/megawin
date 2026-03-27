"use client";

import { Building2, Clock, Copy, Check } from "lucide-react";
import { useState } from "react";
import { AccountStatusLabel, AccountStatus } from "@megawin/identity/entities";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { usePlayerProfile } from "../_shared/queries";

interface PlayerSidebarProfileProps {
  accountId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

/**
 * Profile card tĩnh của player — bên dưới sidebar nav, Client Component.
 *
 * Fetch qua usePlayerProfile hook (API route) — không gọi repo trực tiếp.
 * Luôn hiển thị khi chuyển tab → operator không mất context về tài khoản đang xem.
 * Layout dọc fit trong sidebar lg:w-52 (208px).
 *
 * Header page chỉ hiển thị title + @username — sidebar hiển thị chi tiết đầy đủ.
 * accountId: hiển thị đủ + nút copy (thay vì truncate vô dụng).
 */
export function PlayerSidebarProfile({ accountId }: PlayerSidebarProfileProps) {
  const { data: profile, isLoading, isError } = usePlayerProfile(accountId);

  if (isLoading) {
    return (
      <div className="mt-1 flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-col items-center gap-2 px-1 py-1">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-1 py-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !profile) return null;

  const statusVariant = STATUS_VARIANT[profile.status] ?? "outline";
  const statusLabel = AccountStatusLabel[profile.status as AccountStatus] ?? profile.status;

  // Tạo initials từ displayName hoặc username: lấy chữ cái đầu mỗi từ (tối đa 2)
  const nameForInitials = profile.displayName || profile.username;
  const initials =
    nameForInitials
      .split(/[\s_-]/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || profile.username.slice(0, 2).toUpperCase();

  return (
    <div className="mt-1 flex flex-col gap-0 border-t pt-3">
      {/* Avatar + username + status badge */}
      <div className="flex flex-col items-center gap-2 px-1 pb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 ring-primary/20">
          {initials}
        </div>
        <div className="text-center">
          {profile.displayName && profile.displayName !== profile.username && (
            <p className="font-mono text-xs font-semibold leading-tight text-foreground">
              {profile.displayName}
            </p>
          )}
        </div>
        <Badge variant={statusVariant} className="h-[18px] text-[10px]">
          {statusLabel}
        </Badge>
      </div>

      {/* Account ID — hiển thị đầy đủ + nút copy */}
      <CopyableId value={profile.accountId} />

      {/* Detail rows */}
      <div className="flex flex-col divide-y divide-border/50">
        <SidebarRow icon={Building2} label="Đại lý" value={profile.tenantId} mono />
        <SidebarRow
          icon={Clock}
          label="Ngày tạo"
          value={new Date(profile.createdAt).toLocaleDateString("vi-VN", {
            year: "2-digit",
            month: "2-digit",
            day: "2-digit",
          })}
          mono
        />
      </div>
    </div>
  );
}

/**
 * Hiển thị accountId đầy đủ + copy button.
 * Click → copy vào clipboard, icon chuyển sang Check 1.5s rồi quay lại Copy.
 */
function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-1 border-y border-border/50 px-1 py-2">
      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="Copy Account ID"
      >
        {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}

function SidebarRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-1 px-1 py-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <span
        className={`truncate text-right text-[11px] font-medium text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
