"use client";

import { useState } from "react";
import { EllipsisVertical, KeyRound, ShieldCheck } from "lucide-react";
import { CompanyRole } from "@megawin/identity/entities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth-client";

import type { CompanyAccount } from "../_lib/schema";
import { SetPasswordDialog } from "../../_shared/set-password-dialog";

export function AccountRowActions({ account }: { account: CompanyAccount }) {
  const [passwordOpen, setPasswordOpen] = useState(false);

  const { data: session } = useSession();
  const currentRoles = (session?.user as { roles?: string[] })?.roles ?? [];
  const isCurrentAdmin = currentRoles.includes(CompanyRole.Admin);
  const targetIsAdmin = account.roles.includes(CompanyRole.Admin);

  // Staff không được đổi mật khẩu cho tài khoản Admin → disable action.
  // Admin đổi pass cho mọi tài khoản.
  const canSetPassword = isCurrentAdmin || !targetIsAdmin;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
            aria-label="Mở menu thao tác"
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Điều chỉnh trạng thái
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSetPassword}
            onClick={() => setPasswordOpen(true)}
            title={
              canSetPassword ? undefined : "Chỉ Admin mới được đổi mật khẩu cho tài khoản Admin."
            }
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Đặt mật khẩu mới
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {canSetPassword && (
        <SetPasswordDialog
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
          username={account.username}
        />
      )}
    </>
  );
}
