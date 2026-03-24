"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { AccountStatus, AccountStatusLabel } from "@megawin/identity/entities";

import { Badge } from "@/components/ui/badge";

import type { PlayerAccount } from "../_lib/schema";

const STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

/** Columns chuẩn — dùng cho chế độ xem danh sách theo tenant. */
export const playerAccountsColumns: ColumnDef<PlayerAccount>[] = [
  {
    accessorKey: "username",
    header: "Tên tài khoản",
    cell: ({ row }) => (
      <Link
        href={`/accounts/players/${row.original.accountId}/overview`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.username}
      </Link>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "displayName",
    header: "Tên hiển thị",
    cell: ({ row }) => <span className="text-xs">{row.original.displayName}</span>,
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
      <span className="tabular-nums text-xs text-muted-foreground">
        {row.original.createdAt
          ? new Date(row.original.createdAt).toLocaleDateString("vi-VN")
          : "—"}
      </span>
    ),
    enableSorting: false,
  },
];

/**
 * Columns cho chế độ search cross-tenant — có thêm cột Tenant để phân biệt.
 * Đặt cột Tenant ngay sau cột username vì đây là thông tin quan trọng nhất khi search.
 */
export const searchResultColumns: ColumnDef<PlayerAccount>[] = [
  {
    accessorKey: "username",
    header: "Tên tài khoản",
    cell: ({ row }) => (
      <Link
        href={`/accounts/players/${row.original.accountId}/overview`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.original.username}
      </Link>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "tenantId",
    header: "Tenant",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.tenantId}</span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "displayName",
    header: "Tên hiển thị",
    cell: ({ row }) => <span className="text-xs">{row.original.displayName}</span>,
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
      <span className="tabular-nums text-xs text-muted-foreground">
        {row.original.createdAt
          ? new Date(row.original.createdAt).toLocaleDateString("vi-VN")
          : "—"}
      </span>
    ),
    enableSorting: false,
  },
];
