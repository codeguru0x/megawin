"use client";

import Link from "next/link";
import { BadgeCheck, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";
import { signOutAndRedirect } from "@/lib/auth/sign-out";
import { getInitials } from "@/lib/utils";

/**
 * Menu tài khoản RÚT GỌN ở header (góc trên phải) — shortcut nhanh.
 *
 * CỐ Ý chỉ gồm "Thông tin cá nhân" + "Thoát" để tránh trùng lặp với menu đầy đủ
 * ở sidebar footer ({@link NavUser}). Header ưu tiên cho tiện ích global (theme,
 * sau này thêm thông báo/help); menu tài khoản đầy đủ thuộc về sidebar footer.
 */
export function AccountSwitcher() {
  const { session, isPending } = useAuth();

  const user = {
    name:
      ((session?.user as Record<string, unknown>)?.username as string) ??
      session?.user?.name ??
      "User",
    email: session?.user?.email ?? "",
    avatar: session?.user?.image ?? "",
  };

  async function handleSignOut() {
    await signOutAndRedirect();
  }

  if (isPending) {
    return <div className="size-9 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 cursor-pointer rounded-lg">
          <AvatarImage src={user.avatar || undefined} alt={user.name} />
          <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 space-y-1 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <div className="flex w-full items-center gap-2 px-2 py-1.5">
          <Avatar className="size-9 rounded-lg">
            <AvatarImage src={user.avatar || undefined} alt={user.name} />
            <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/me">
              <BadgeCheck />
              Thông tin cá nhân
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut />
          Thoát
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
