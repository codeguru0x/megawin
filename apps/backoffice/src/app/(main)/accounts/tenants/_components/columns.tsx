"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Tenant } from "../_lib/schema";
import { TenantRowActions } from "./row-actions";

function ApiKeyCell({ apiKey }: { apiKey: string }) {
  const [visible, setVisible] = useState(false);
  const masked = apiKey.slice(0, 8) + "••••••••••••••••";

  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs font-mono truncate">
        {visible ? apiKey : masked}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

export const tenantColumns: ColumnDef<Tenant>[] = [
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
    accessorKey: "tenantId",
    header: "Tenant ID",
    enableHiding: false,
    cell: ({ row }) => (
      <span className="font-medium font-mono text-sm">
        {row.original.tenantId}
      </span>
    ),
  },
  {
    accessorKey: "displayName",
    header: "Tên hiển thị",
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    cell: ({ row }) => {
      const isActive = row.original.status === "active";
      return (
        <Badge variant={isActive ? "default" : "outline"}>
          {isActive ? "Hoạt động" : "Vô hiệu"}
        </Badge>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "apiKey",
    header: "API Key",
    size: 280,
    minSize: 280,
    maxSize: 280,
    cell: ({ row }) => <ApiKeyCell apiKey={row.original.apiKey} />,
    enableSorting: false,
  },
  {
    id: "allowedOrigins",
    header: "Allowed Origins",
    accessorFn: (row) => row.app.allowedOrigins,
    cell: ({ row }) => {
      const origins = row.original.app.allowedOrigins;
      return (
        <div className="flex flex-wrap gap-1">
          {origins.map((origin) => (
            <Badge
              key={origin}
              variant="secondary"
              className="text-xs font-normal"
            >
              {origin}
            </Badge>
          ))}
        </div>
      );
    },
    enableSorting: false,
  },
  {
    id: "jwksUrl",
    header: "JWKS URL",
    accessorFn: (row) => row.sso.jwksUrl,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs max-w-[200px] truncate block">
        {row.original.sso.jwksUrl}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: "Ngày tạo",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs tabular-nums">
        {new Date(row.original.createdAt).toLocaleDateString("vi-VN")}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <TenantRowActions tenant={row.original} />
      </div>
    ),
    enableSorting: false,
  },
];
