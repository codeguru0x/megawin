"use client";

import { ChevronLeft, ChevronRight, Info, List } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { usePlayerAccountsCursor } from "../../_shared/queries";
import { ACCOUNTS_PAGE_SIZE } from "../../_shared/constants";
import { playerAccountsColumns } from "./columns";
import type { PlayerAccount } from "../_lib/schema";

interface PlayersTableProps {
  tenantId: string;
  /** accountId của record cuối trang hiện tại → lấy trang tiếp. */
  after?: string;
  /** accountId của record đầu trang hiện tại → lấy trang trước. */
  before?: string;
  onNext: (nextCursor: string) => void;
  onPrev: (prevCursor: string) => void;
}

export function PlayersTable({ tenantId, after, before, onNext, onPrev }: PlayersTableProps) {
  const cursor = after ? { after } : before ? { before } : undefined;

  const { data, isLoading, error } = usePlayerAccountsCursor(tenantId, cursor);

  const accounts = data?.accounts ?? [];

  const table = useDataTableInstance<PlayerAccount, unknown>({
    data: accounts,
    columns: playerAccountsColumns,
    enableRowSelection: false,
    defaultPageSize: ACCOUNTS_PAGE_SIZE,
    getRowId: (row) => row.accountId,
  });

  if (!tenantId) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex items-center gap-3 px-5 py-12 text-muted-foreground">
          <Info className="h-5 w-5 shrink-0" />
          <span className="text-sm">Chọn một Tenant ID để xem danh sách người chơi.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Người chơi – <span className="font-mono text-xs font-normal">{tenantId}</span>
            </CardTitle>
          </div>
          {accounts.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {accounts.length} tài khoản
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col gap-3 px-5 pb-4 pt-0">
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        <div className="overflow-hidden rounded-md border">
          {isLoading ? (
            <div className="h-[320px] animate-pulse bg-muted" />
          ) : accounts.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium text-muted-foreground">Chưa có người chơi nào</p>
              <p className="text-xs text-muted-foreground">
                Tenant này chưa có tài khoản người chơi.
              </p>
            </div>
          ) : (
            <DataTable table={table} columns={playerAccountsColumns} />
          )}
        </div>

        {/* Prev / Next navigation — chỉ hiện khi có data */}
        {!isLoading && accounts.length > 0 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const cursor = data?.prevCursor;
                if (cursor) onPrev(cursor);
              }}
              disabled={!data?.hasPrev}
            >
              <ChevronLeft className="size-3.5" />
              Trang trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const cursor = data?.nextCursor;
                if (cursor) onNext(cursor);
              }}
              disabled={!data?.hasNext}
            >
              Trang tiếp
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
