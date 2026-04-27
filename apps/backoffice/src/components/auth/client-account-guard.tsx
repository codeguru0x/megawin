"use client";

/**
 * ClientAccountGuard – client-side guard chạy trong `(main)` layout.
 *
 * Nhiệm vụ:
 * - Delegate cho `useAccountGuard` kiểm tra `accountStatus` trên session hiện tại.
 * - Khi account bị `suspended` → redirect về `/login`.
 * - Khi account `read_only` + trang yêu cầu `requireActive` → redirect `/unauthorized`.
 *
 * Việc redirect khi `session === null` đã được `AuthProvider` đảm nhiệm,
 * nên component này KHÔNG duplicate logic đó.
 *
 * Render children trong suốt; chỉ có side-effect là redirect khi cần.
 */

import type { ReactNode } from "react";

import { useAccountGuard } from "@/hooks/use-account-guard";

interface ClientAccountGuardProps {
  children: ReactNode;
}

export function ClientAccountGuard({ children }: ClientAccountGuardProps) {
  useAccountGuard();
  return <>{children}</>;
}
