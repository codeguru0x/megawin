"use client";

import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { companyAccountsColumns } from "./columns";
import { companyAccountSchema, type CompanyAccount } from "./config";

async function fetchCompanyAccounts(): Promise<CompanyAccount[]> {
  const res = await fetch("/api/accounts/company", {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Không tải được danh sách tài khoản công ty.");
  }

  const json = await res.json();
  const parsed = companyAccountSchema.array().parse(json);
  return parsed;
}

export function CompanyAccountsTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["company", "accounts"],
    queryFn: fetchCompanyAccounts,
  });

  const table = useDataTableInstance<CompanyAccount, unknown>({
    data: data ?? [],
    columns: companyAccountsColumns,
    enableRowSelection: true,
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
          <p className="text-destructive text-sm">{(error as Error).message}</p>
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
