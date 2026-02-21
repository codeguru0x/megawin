"use client";

import { useState } from "react";
import { EllipsisVertical, KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { AgentAccount } from "../_lib/schema";
import { SetPasswordDialog } from "../../_shared/set-password-dialog";

export function AgentRowActions({ account }: { account: AgentAccount }) {
  const [passwordOpen, setPasswordOpen] = useState(false);

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
          <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Đặt mật khẩu mới
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SetPasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        username={account.username}
      />
    </>
  );
}
