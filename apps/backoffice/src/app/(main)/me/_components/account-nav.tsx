"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser, KeyRound, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const accountNavItems = [
  {
    title: "Thông tin cá nhân",
    href: "/me",
    icon: CircleUser,
  },
  {
    title: "Đổi mật khẩu",
    href: "/me/change-password",
    icon: KeyRound,
  },
  {
    title: "Bảo mật (MFA)",
    href: "/me/mfa",
    icon: ShieldCheck,
  },
] as const;

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-row gap-1 lg:flex-col">
      {accountNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="hidden lg:inline">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
