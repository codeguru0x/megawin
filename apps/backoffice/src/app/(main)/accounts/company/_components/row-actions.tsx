"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { EllipsisVertical } from "lucide-react";

import type { CompanyAccount } from "./config";
import { companyAccountRoles } from "./config";

type ActionType = "status" | "password" | "mfa" | "role" | null;

export function AccountRowActions({ account }: { account: CompanyAccount }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionType>(null);
  const [nextStatus, setNextStatus] = useState<CompanyAccount["status"]>(account.status);
  const [nextRoles, setNextRoles] = useState<CompanyAccount["roles"]>(account.roles);
  const [password, setPassword] = useState("");

  const [pending, setPending] = useState(false);

  function openAction(type: ActionType) {
    setAction(type);
    setOpen(true);
  }

  async function handleConfirm() {
    if (action === "role" && nextRoles.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 quyền.");
      return;
    }

    setPending(true);

    // TODO: Gọi API thực tế (React Query mutation hoặc fetch)
    await new Promise((resolve) => setTimeout(resolve, 600));

    queryClient.setQueryData<CompanyAccount[]>(["company", "accounts"], (old) => {
      if (!old) return old;
      return old.map((acc) => {
        if (acc.id !== account.id) return acc;

        if (action === "status") {
          return {
            ...acc,
            status: nextStatus,
          };
        }

        if (action === "mfa") {
          if (!acc.mfaEnabled) return acc;
          return {
            ...acc,
            mfaEnabled: false,
          };
        }

        if (action === "role") {
          return {
            ...acc,
            roles: nextRoles,
          };
        }

        return acc;
      });
    });

    setPending(false);
    setOpen(false);

    const label =
      action === "status"
        ? "Điều chỉnh trạng thái"
        : action === "password"
          ? "Đổi mật khẩu"
          : action === "mfa"
            ? "Bật / tắt MFA"
            : "Điều chỉnh quyền";

    toast.success(`${label} cho tài khoản ${account.username} thành công (mock).`);
  }

  const dialogTitle =
    action === "status"
      ? "Điều chỉnh trạng thái"
      : action === "password"
        ? "Đổi mật khẩu"
        : action === "mfa"
          ? "Force tắt MFA"
          : action === "role"
            ? "Điều chỉnh quyền"
            : "";

  const dialogDescription =
    action === "status"
      ? "Chọn trạng thái mới và xác nhận để cập nhật cho tài khoản."
      : action === "password"
        ? "Nhập mật khẩu mới cho tài khoản. Hành động này không thể hoàn tác."
        : action === "mfa"
          ? "Xác nhận bật / tắt xác thực đa yếu tố (MFA) cho tài khoản này."
          : action === "role"
            ? "Chọn quyền mới cho tài khoản từ danh sách quyền cho phép."
            : "";

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
          {account.mfaEnabled && (
            <DropdownMenuItem onClick={() => openAction("mfa")}>Force tắt MFA</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => openAction("role")}>Điều chỉnh quyền</DropdownMenuItem>
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
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={nextStatus === "active"}
                    onChange={() => setNextStatus("active")}
                  />
                  <span>Đang hoạt động</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={nextStatus === "inactive"}
                    onChange={() => setNextStatus("inactive")}
                  />
                  <span>Ngưng hoạt động</span>
                </label>
              </div>
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

          {action === "mfa" && (
            <div className="space-y-2">
              <p className="text-sm">
                Tài khoản: <span className="font-medium">{account.username}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Hành động này sẽ <span className="font-semibold">force tắt MFA</span> hiện tại để người dùng có thể
                cấu hình lại khi cần. Bạn có chắc chắn muốn thực hiện cho tài khoản{" "}
                <span className="font-medium">{account.username}</span>?
              </p>
            </div>
          )}

          {action === "role" && (
            <div className="space-y-2">
              <p className="text-sm">
                Tài khoản: <span className="font-medium">{account.username}</span>
              </p>
              <div className="space-y-1">
                {companyAccountRoles.map((role) => {
                  const checked = nextRoles.includes(role);
                  return (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const isChecked = Boolean(value);
                          setNextRoles((prev) =>
                            isChecked ? [...prev, role] : prev.filter((r) => r !== role),
                          );
                        }}
                      />
                      <span>{role}</span>
                    </label>
                  );
                })}
              </div>
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

