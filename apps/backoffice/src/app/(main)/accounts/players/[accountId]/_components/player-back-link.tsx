"use client";

import Link from "next/link";

import { ChevronLeft } from "lucide-react";
import type { Route } from "next";

import { usePlayerProfile } from "../_shared/queries";

interface PlayerBackLinkProps {
  accountId: string;
}

/**
 * Link quay về danh sách người chơi — Client Component.
 *
 * Fetch profile để lấy tenantId, truyền vào URL ?tenantId=<id>
 * để trang players list auto-filter đúng tenant chứa player này.
 * Khi chưa load xong profile: link về /accounts/players không có filter.
 */
export function PlayerBackLink({ accountId }: PlayerBackLinkProps) {
  const { data: profile } = usePlayerProfile(accountId);
  // Nếu profile chưa load → link không có tenant param, vẫn hoạt động
  const href = (profile?.tenantId ? `/accounts/players?tenantId=${profile.tenantId}` : "/accounts/players") as Route;

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Danh sách người chơi
    </Link>
  );
}
