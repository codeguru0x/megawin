import type { ReactNode } from "react";

import { UserCog } from "lucide-react";

import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";
import { AccountNav } from "./_components/account-nav";

export default function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page header — đồng nhất với Dashboard, Financial Reports */}
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
        >
          <UserCog className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Tài khoản</h1>
          <p className="text-xs text-muted-foreground">Quản lý tài khoản và bảo mật</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar nav — card riêng */}
        <div className="shrink-0 lg:w-52">
          <div className="rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-20">
            <AccountNav />
          </div>
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
