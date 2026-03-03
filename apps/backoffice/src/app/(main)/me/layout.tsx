import type { ReactNode } from "react";

import { UserCog } from "lucide-react";

import { AccountNav } from "./_components/account-nav";

export default function AccountLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <UserCog className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Tài khoản
          </h1>
          <p className="text-muted-foreground text-sm">
            Quản lý tài khoản và bảo mật
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <AccountNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
