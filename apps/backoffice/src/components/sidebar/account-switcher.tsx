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
import type { AccountDisplayUser } from "@/lib/account-user";
import { signOutAndRedirect } from "@/lib/auth/sign-out";
import { getInitials } from "@/lib/utils";

/**
 * Menu tài khoản RÚT GỌN ở header (góc trên phải) — shortcut nhanh.
 *
 * CỐ Ý chỉ gồm "Thông tin cá nhân" + "Thoát" để tránh trùng lặp với menu đầy đủ
 * ở sidebar footer ({@link NavUser}). Header ưu tiên cho tiện ích global (theme,
 * sau này thêm thông báo/help); menu tài khoản đầy đủ thuộc về sidebar footer.
 *
 * `user` NHẬN QUA PROP từ server layout — lý do xem JSDoc {@link NavUser}.
 */
export function AccountSwitcher({ user }: Readonly<{ user: AccountDisplayUser }>) {
  async function handleSignOut() {
    await signOutAndRedirect();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 cursor-pointer rounded-lg">
          <AvatarImage src={user.avatar || undefined} alt={user.name} />
          <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
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
