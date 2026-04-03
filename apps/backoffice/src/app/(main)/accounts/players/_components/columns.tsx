"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AccountStatus, AccountStatusLabel } from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";

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
    cell: ({ row }) => <span className="font-mono text-sm">{row.original.username}</span>,
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
      <span className="text-sm tabular-nums">
        {row.original.createdAt ? displayVNDateTime(new Date(row.original.createdAt)) : "—"}
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
    cell: ({ row }) => <span className="font-mono text-sm">{row.original.username}</span>,
    enableSorting: false,
  },
  {
    accessorKey: "tenantId",
    header: "Tenant",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-muted-foreground">{row.original.tenantId}</span>
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
      <span className="text-sm tabular-nums">
        {row.original.createdAt ? displayVNDateTime(new Date(row.original.createdAt)) : "—"}
      </span>
    ),
    enableSorting: false,
  },
];
