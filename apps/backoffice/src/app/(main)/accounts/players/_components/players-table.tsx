"use client";

import { useMemo } from "react";
import { Info, List, Loader2 } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { usePlayerAccounts } from "../../_shared/queries";
import { ACCOUNTS_PAGE_SIZE } from "../../_shared/constants";
import { playerAccountsColumns } from "./columns";
import type { PlayerAccount } from "../_lib/schema";

interface PlayersTableProps {
  tenantId: string;
}

export function PlayersTable({ tenantId }: PlayersTableProps) {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePlayerAccounts(tenantId);

  // Flatten tất cả pages thành 1 mảng accounts
  const accounts = useMemo<PlayerAccount[]>(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.accounts);
  }, [data]);

  // Total từ page đầu tiên (hoặc mới nhất) — luôn nhất quán vì cùng tenantId
  const total = data?.pages[0]?.total ?? 0;

  const table = useDataTableInstance<PlayerAccount, unknown>({
    data: accounts,
    columns: playerAccountsColumns,
    enableRowSelection: false,
    defaultPageSize: ACCOUNTS_PAGE_SIZE,
    getRowId: (row) => row.username,
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
          {total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Hiển thị {accounts.length} / {total}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex size-full flex-col gap-4 px-5 pb-4 pt-0">
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

        {/* Nút tải thêm — hiển thị khi còn trang tiếp theo */}
        {hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Đang tải...
                </>
              ) : (
                "Tải thêm"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
