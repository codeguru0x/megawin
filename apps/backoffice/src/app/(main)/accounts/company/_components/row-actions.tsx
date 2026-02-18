"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { EllipsisVertical } from "lucide-react";

import type { CompanyAccount } from "../_lib/schema";

type ActionType = "status" | "password" | null;

export function AccountRowActions({ account }: { account: CompanyAccount }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionType>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  function openAction(type: ActionType) {
    setAction(type);
    setOpen(true);
  }

  async function handleConfirm() {
    setPending(true);

    // TODO: Gọi API thực tế (React Query mutation + apiClient)
    await new Promise((resolve) => setTimeout(resolve, 600));

    setPending(false);
    setOpen(false);

    const label = action === "status" ? "Điều chỉnh trạng thái" : "Đổi mật khẩu";
    toast.success(`${label} cho tài khoản ${account.username} thành công (mock).`);
  }

  const dialogTitle = action === "status" ? "Điều chỉnh trạng thái" : "Đổi mật khẩu";
  const dialogDescription =
    action === "status"
      ? "Chọn trạng thái mới và xác nhận để cập nhật cho tài khoản."
      : "Nhập mật khẩu mới cho tài khoản. Hành động này không thể hoàn tác.";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="hidden size-8 text-muted-foreground data-[state=open]:bg-muted lg:flex"
            size="icon"
            aria-label="Mở menu thao tác"
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => openAction("status")}>Điều chỉnh trạng thái</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openAction("password")}>Đổi mật khẩu</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          {action === "status" && (
            <div className="space-y-2">
              <p className="text-sm">
                Tài khoản: <span className="font-medium">{account.username}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Trạng thái hiện tại: <span className="font-medium">{account.status}</span>
              </p>
            </div>
          )}

          {action === "password" && (
            <div className="space-y-2">
              <p className="text-sm">
                Tài khoản: <span className="font-medium">{account.username}</span>
              </p>
              <Input
                type="password"
                placeholder="Mật khẩu mới"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Huỷ
            </Button>
            <Button onClick={handleConfirm} disabled={pending}>
              {pending ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
