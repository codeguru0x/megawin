"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

const playerNavItems = [
  {
    title: "Tài chính",
    href: "settle",
    icon: BarChart3,
  },
  {
    title: "Đang chờ",
    href: "outstanding",
    icon: Clock,
  },
] as const;

interface PlayerDetailNavProps {
  accountId: string;
}

/**
 * Sidebar navigation cho trang Player Detail.
 *
 * <Link> dẫn đến path thuần (không query params) → chuyển tab luôn clear URL state.
 * Drill-down trong từng tab dùng nuqs với `history: "push"` để browser Back
 * quay về đúng level trước đó (xem outstanding-content, financials-content).
 */
export function PlayerDetailNav({ accountId }: PlayerDetailNavProps) {
  const pathname = usePathname();
  const base = `/accounts/players/${accountId}`;

  return (
    <nav className="flex flex-row gap-1 lg:flex-col">
      {playerNavItems.map((item) => {
        const href = `${base}/${item.href}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
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
