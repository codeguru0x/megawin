"use client";

import { useState } from "react";

import { AccountStatusLabel, type AccountStatus } from "@megawin/identity/entities";
import { Building2, Check, Clock, Copy } from "lucide-react";

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
        {["r0", "r1", "r2"].map((id) => (
          <div key={id} className="flex items-center justify-between px-1 py-1.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !profile) {
    return null;
  }

  const statusVariant = STATUS_VARIANT[profile.status];
  const statusLabel = AccountStatusLabel[profile.status as AccountStatus];

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
        <div className="bg-primary/10 text-primary ring-primary/20 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2">
          {initials}
        </div>
        <div className="text-center">
          {profile.displayName && profile.displayName !== profile.username && (
            <p className="text-foreground font-mono text-xs leading-tight font-semibold">{profile.displayName}</p>
          )}
        </div>
        <Badge variant={statusVariant} className="h-5">
          {statusLabel}
        </Badge>
      </div>

      {/* Account ID — hiển thị đầy đủ + nút copy */}
      <CopyableId value={profile.accountId} />

      {/* Detail rows */}
      <div className="divide-border/50 flex flex-col divide-y">
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
    <div className="border-border/50 flex items-center gap-1 border-y px-1 py-2">
      <span className="text-muted-foreground min-w-0 truncate font-mono text-xs" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="text-muted-foreground hover:text-foreground flex shrink-0 items-center justify-center rounded p-0.5 transition-colors"
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
        <Icon className="text-muted-foreground size-3 shrink-0" />
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <span className={`text-foreground truncate text-right text-xs font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
