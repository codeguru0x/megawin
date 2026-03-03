"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";

import type { AgentAccount } from "../_lib/schema";
import { AgentRowActions } from "./row-actions";

const statusMap: Record<
  string,
  {
    label: string;
    variant: "default" | "outline" | "secondary" | "destructive";
  }
> = {
  active: { label: "Hoạt động", variant: "default" },
  read_only: { label: "Chỉ đọc", variant: "secondary" },
  suspended: { label: "Bị khoá", variant: "destructive" },
};

const mfaStatusMap: Record<
  string,
  {
    label: string;
    variant: "default" | "outline" | "secondary" | "destructive";
  }
> = {
  none: { label: "Chưa thiết lập", variant: "outline" },
  enabled: { label: "Đang bật", variant: "default" },
  disabled: { label: "Đã tắt", variant: "secondary" },
};

export const agentAccountsColumns: ColumnDef<AgentAccount>[] = [
  {
    id: "rowNumber",
    header: "STT",
    cell: ({ row }) => (
      <span className="text-xs font-mono tabular-nums">{row.index + 1}</span>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
  {
    accessorKey: "username",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tên tài khoản" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.original.username}</span>
    ),
  },
  {
    accessorKey: "displayName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tên hiển thị" />
    ),
    cell: ({ row }) => row.original.displayName,
  },
  {
    accessorKey: "tenantId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tenant" />
    ),
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs">
        {row.original.tenantId}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => {
      const status = row.original.status;
      const mapped = statusMap[status];
      return (
        <Badge variant={mapped?.variant ?? "outline"}>
          {mapped?.label ?? status}
        </Badge>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "mfaStatus",
    header: "MFA",
    cell: ({ row }) => {
      const mfa = row.original.mfaStatus ?? "none";
      const mapped = mfaStatusMap[mfa];
      return (
        <Badge variant={mapped?.variant ?? "outline"}>
          {mapped?.label ?? mfa}
        </Badge>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ngày tạo" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {row.original.createdAt
          ? new Date(row.original.createdAt).toLocaleDateString("vi-VN")
          : "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AgentRowActions account={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
