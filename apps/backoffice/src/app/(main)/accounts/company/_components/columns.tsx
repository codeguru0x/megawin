"use client";

import { useState } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Lock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CompanyAccount } from "./config";
import { AccountRowActions } from "./row-actions";

function RolesCell({ account }: { account: CompanyAccount }) {
  return (
    <div className="flex flex-wrap gap-1">
      {account.roles.map((role) => (
        <Badge key={role} variant="outline">
          {role}
        </Badge>
      ))}
    </div>
  );
}

function StatusToggleCell({ account }: { account: CompanyAccount }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nextStatus, setNextStatus] = useState<CompanyAccount["status"]>(
    account.status
  );

  const isActive = account.status === "active";

  function handleToggle(checked: boolean) {
    const target: CompanyAccount["status"] = checked ? "active" : "inactive";
    if (target === account.status) return;
    setNextStatus(target);
    setOpen(true);
  }

  async function handleConfirm() {
    setPending(true);

    // TODO: Gọi API thực tế (React Query mutation hoặc fetch)
    await new Promise((resolve) => setTimeout(resolve, 500));

    queryClient.setQueryData<CompanyAccount[]>(
      ["company", "accounts"],
      (old) => {
        if (!old) return old;
        return old.map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                status: nextStatus,
              }
            : acc
        );
      }
    );

    setPending(false);
    setOpen(false);

    toast.success(
      `Cập nhật trạng thái tài khoản ${account.username} thành công (mock).`
    );
  }

  const label = nextStatus === "active" ? "Đang hoạt động" : "Ngưng hoạt động";

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label="Bật / tắt trạng thái hoạt động"
        />
        <span className="text-xs text-muted-foreground">
          {isActive ? "Đang hoạt động" : "Ngưng hoạt động"}
        </span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Điều chỉnh trạng thái</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn chuyển tài khoản{" "}
              <span className="font-medium">{account.username}</span> sang trạng
              thái <span className="font-medium">{label}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
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

function MfaCell({ account }: { account: CompanyAccount }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!account.mfaEnabled) {
    return <Badge variant="outline">Tắt</Badge>;
  }

  async function handleConfirm() {
    setPending(true);

    // TODO: Gọi API thực tế (React Query mutation hoặc fetch)
    await new Promise((resolve) => setTimeout(resolve, 500));

    queryClient.setQueryData<CompanyAccount[]>(
      ["company", "accounts"],
      (old) => {
        if (!old) return old;
        return old.map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                mfaEnabled: false,
              }
            : acc
        );
      }
    );

    setPending(false);
    setOpen(false);

    toast.success(
      `Force tắt MFA cho tài khoản ${account.username} thành công (mock).`
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">Bật</Badge>
        <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
          <Lock className="size-4" /> Huỷ kích hoạt
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Huỷ kích hoạt MFA</DialogTitle>
            <DialogDescription>
              Bạn muốn huỷ kích hoạt MFA cho tài khoản{" "}
              <span className="font-medium">{account.username}</span>? Người
              dùng sẽ cần cấu hình lại MFA cho lần đăng nhập tiếp theo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Đang xử lý..." : "Force tắt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const companyAccountsColumns: ColumnDef<CompanyAccount>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Chọn tất cả"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Chọn dòng"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "username",
    header: "Tên tài khoản",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.username}</span>
    ),
  },
  {
    accessorKey: "roles",
    header: "Quyền",
    cell: ({ row }) => <RolesCell account={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => <StatusToggleCell account={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: "mfaEnabled",
    header: "MFA",
    cell: ({ row }) => <MfaCell account={row.original} />,
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: "Ngày tạo",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {row.original.createdAt}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end">
        {/* Nút menu cho mobile / fallback nếu cần */}
        <Button
          variant="ghost"
          className="mr-1 flex size-8 text-muted-foreground lg:hidden"
          size="icon"
          aria-label="Thao tác"
        >
          <EllipsisVertical />
        </Button>
        <AccountRowActions account={row.original} />
      </div>
    ),
    enableSorting: false,
  },
];
