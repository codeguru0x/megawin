"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { agentAccountsColumns } from "./columns";
import type { AgentAccount } from "../_lib/schema";
import type { ListAgentAccountsResponse } from "../_lib/types";

export function AgentAccountsTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent", "accounts"],
    queryFn: () =>
      apiClient.get<ListAgentAccountsResponse>("/accounts/agents"),
  });

  const table = useDataTableInstance<AgentAccount, unknown>({
    data: data?.accounts ?? [],
    columns: agentAccountsColumns,
    enableRowSelection: true,
    getRowId: (row) => row.username,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base md:text-lg">
            Danh sách đại lý
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
            <DataTable table={table} columns={agentAccountsColumns} />
          )}
        </div>
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}
