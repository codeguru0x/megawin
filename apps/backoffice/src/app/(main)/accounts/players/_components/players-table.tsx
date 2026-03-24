"use client";

import { ChevronLeft, ChevronRight, Info, List } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
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
  /** Tenant selector control từ PlayersContent — render trong CardHeader. */
  tenantSelector?: React.ReactNode;
  /** Search controls từ PlayersContent — render trong CardHeader bên phải. */
  toolbarControls?: React.ReactNode;
}

export function PlayersTable({
  tenantId,
  after,
  before,
  onNext,
  onPrev,
  tenantSelector,
  toolbarControls,
}: PlayersTableProps) {
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
        <CardHeader className="px-5 pb-2 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <List className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Người chơi</CardTitle>
              {tenantSelector}
            </div>
            {toolbarControls}
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-3 px-5 py-10 text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span className="text-sm">Chọn một Tenant để xem danh sách người chơi.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Người chơi</CardTitle>
            {tenantSelector}
          </div>
          <div className="flex items-center gap-1.5">
            {accounts.length > 0 && !isLoading && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {accounts.length} tài khoản
              </span>
            )}
            {toolbarControls}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col gap-0 px-0 pb-0 pt-0">
        {error && <p className="px-5 pb-2 text-sm text-destructive">{error.message}</p>}

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

        {/* Prev / Next navigation — căn phải, chỉ hiện khi có data */}
        {!isLoading && accounts.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
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
