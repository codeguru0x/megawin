"use client";

import { List } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { useAgentAccounts } from "../../_shared/queries";
import { ACCOUNTS_PAGE_SIZE } from "../../_shared/constants";
import { agentAccountsColumns } from "./columns";
import type { AgentAccount } from "../_lib/schema";

export function AgentAccountsTable() {
  const { data, isLoading, error } = useAgentAccounts();

  const table = useDataTableInstance<AgentAccount, unknown>({
    data: data?.accounts ?? [],
    columns: agentAccountsColumns,
    enableRowSelection: false,
    defaultPageSize: ACCOUNTS_PAGE_SIZE,
    getRowId: (row) => row.accountId,
  });

  const accounts = data?.accounts ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Danh sách đại lý</CardTitle>
          </div>
          {accounts.length > 0 && !isLoading && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {accounts.length} tài khoản
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        {error && <p className="px-5 pb-2 text-sm text-destructive">{error.message}</p>}
        {isLoading ? (
          <div className="h-[320px] animate-pulse bg-muted" />
        ) : table.getRowCount() === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Chưa có tài khoản đại lý nào
            </p>
            <p className="text-xs text-muted-foreground">
              Tạo tài khoản mới bằng nút &ldquo;Thêm đại lý&rdquo; ở trên.
            </p>
          </div>
        ) : (
          <DataTable table={table} columns={agentAccountsColumns} />
        )}
      </CardContent>
    </Card>
  );
}
