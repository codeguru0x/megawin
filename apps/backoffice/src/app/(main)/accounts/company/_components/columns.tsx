"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AccountStatus, CompanyRole, MfaStatus, AccountStatusLabel, CompanyRoleLabel, MfaStatusLabel } from "@megawin/identity/entities";

import { Badge } from "@/components/ui/badge";

import type { CompanyAccount } from "../_lib/schema";
import { AccountRowActions } from "./row-actions";

const STATUS_VARIANT: Record<AccountStatus, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

const MFA_VARIANT: Record<MfaStatus, "default" | "outline" | "secondary" | "destructive"> = {
  none: "outline",
  enabled: "default",
  disabled: "secondary",
};

export const companyAccountsColumns: ColumnDef<CompanyAccount>[] = [
  {
    id: "rowNumber",
    header: "STT",
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{row.index + 1}</span>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
  {
    accessorKey: "username",
    header: "Tên tài khoản",
    cell: ({ row }) => <span className="text-xs font-medium">{row.original.username}</span>,
    enableSorting: false,
  },
  {
    accessorKey: "displayName",
    header: "Tên hiển thị",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.displayName}</span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "roles",
    header: "Vai trò",
    cell: ({ row }) => (
      <div className="flex gap-1">
        {row.original.roles.map((role) => (
          <Badge key={role} variant="secondary" className="text-xs">
            {CompanyRoleLabel[role as CompanyRole] ?? role}
          </Badge>
        ))}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => {
      const status = row.original.status as AccountStatus;
      return (
        <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
          {AccountStatusLabel[status] ?? status}
        </Badge>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "mfaStatus",
    header: "MFA",
    cell: ({ row }) => {
      const mfa = (row.original.mfaStatus ?? MfaStatus.None) as MfaStatus;
      return <Badge variant={MFA_VARIANT[mfa] ?? "outline"}>{MfaStatusLabel[mfa] ?? mfa}</Badge>;
    },
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: "Ngày tạo",
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {row.original.createdAt
          ? new Date(row.original.createdAt).toLocaleDateString("vi-VN")
          : "—"}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AccountRowActions account={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
