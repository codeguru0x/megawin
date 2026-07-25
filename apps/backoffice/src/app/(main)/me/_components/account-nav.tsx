"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ACCOUNT_NAV_ITEMS } from "@/lib/account-nav";
import { cn } from "@/lib/utils";

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-row gap-1 lg:flex-col">
      {ACCOUNT_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
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
