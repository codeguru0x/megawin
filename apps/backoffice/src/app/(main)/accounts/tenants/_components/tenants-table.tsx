"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { tenantColumns } from "./columns";
import type { Tenant } from "../_lib/schema";
import type { ListTenantsResponse } from "../_lib/types";

export function TenantsTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => apiClient.get<ListTenantsResponse>("/tenants"),
  });

  const table = useDataTableInstance<Tenant, unknown>({
    data: data?.tenants ?? [],
    columns: tenantColumns,
    getRowId: (row) => row.tenantId,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base md:text-lg">
            Danh sách ứng dụng
          </CardTitle>
          <DataTableViewOptions table={table} />
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error.message}</p>}
        <div className="overflow-hidden rounded-md border">
          {isLoading ? (
            <div className="h-[320px] animate-pulse bg-muted" />
          ) : (
            <DataTable table={table} columns={tenantColumns} />
          )}
        </div>
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}
