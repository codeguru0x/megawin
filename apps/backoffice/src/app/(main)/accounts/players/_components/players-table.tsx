"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";
import { Info } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { playerAccountsColumns } from "./columns";
import type { PlayerAccount } from "../_lib/schema";
import type { ListPlayerAccountsResponse } from "../_lib/types";

interface PlayersTableProps {
  tenantId: string;
}

export function PlayersTable({ tenantId }: PlayersTableProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["player", "accounts", tenantId],
    queryFn: () =>
      apiClient.get<ListPlayerAccountsResponse>(
        `/accounts/players?tenantId=${tenantId}`
      ),
    enabled: !!tenantId,
  });

  const table = useDataTableInstance<PlayerAccount, unknown>({
    data: data?.accounts ?? [],
    columns: playerAccountsColumns,
    enableRowSelection: true,
    getRowId: (row) => row.username,
  });

  if (!tenantId) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
          <Info className="h-5 w-5" />
          <span>Chọn một Tenant ID để xem danh sách người chơi.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base md:text-lg">
            Người chơi – {tenantId}
          </CardTitle>
          <DataTableViewOptions table={table} />
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col gap-4">
        {error && (
          <p className="text-destructive text-sm">{error.message}</p>
        )}
        <div className="overflow-hidden rounded-md border">
          {isLoading ? (
            <div className="h-[320px] animate-pulse bg-muted" />
          ) : (
            <DataTable table={table} columns={playerAccountsColumns} />
          )}
        </div>
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}
