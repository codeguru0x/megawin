"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@megawin/next/client";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { companyAccountsColumns } from "./columns";
import type { CompanyAccount } from "../_lib/schema";
import type { ListCompanyAccountsResponse } from "../_lib/types";

export function CompanyAccountsTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["company", "accounts"],
    queryFn: () =>
      apiClient.get<ListCompanyAccountsResponse>("/accounts/company"),
  });

  const table = useDataTableInstance<CompanyAccount, unknown>({
    data: data?.accounts ?? [],
    columns: companyAccountsColumns,
    enableRowSelection: true,
    getRowId: (row) => row.username,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base md:text-lg">
            Danh sách tài khoản
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
            <DataTable table={table} columns={companyAccountsColumns} />
          )}
        </div>
        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  );
}
