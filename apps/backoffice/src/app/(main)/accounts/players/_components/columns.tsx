"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AccountStatus } from "@megawin/identity/entities/account";
import { AccountStatusLabel } from "@megawin/identity/entities/labels";

import { Badge } from "@/components/ui/badge";

import type { PlayerAccount } from "../_lib/schema";

const STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

export const playerAccountsColumns: ColumnDef<PlayerAccount>[] = [
  {
    accessorKey: "username",
    header: "Tên tài khoản",
    cell: ({ row }) => (
      <span className="font-medium font-mono text-xs">{row.original.username}</span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "displayName",
    header: "Tên hiển thị",
    cell: ({ row }) => <span className="text-sm">{row.original.displayName}</span>,
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
    accessorKey: "updatedAt",
    header: "Cập nhật",
    cell: ({ row }) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {row.original.updatedAt
          ? new Date(row.original.updatedAt).toLocaleDateString("vi-VN")
          : "—"}
      </span>
    ),
    enableSorting: false,
  },
];
