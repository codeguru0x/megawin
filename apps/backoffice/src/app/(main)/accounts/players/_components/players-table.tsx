"use client";

import { useRouter } from "next/navigation";

import { AccountStatusLabel, type AccountStatus } from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { ChevronLeft, ChevronRight, Info, List } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { PlayerAccount } from "../_lib/schema";
import { usePlayerAccountsCursor } from "../../_shared/queries";

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

const STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

export function PlayersTable({
  tenantId,
  after,
  before,
  onNext,
  onPrev,
  tenantSelector,
  toolbarControls,
}: PlayersTableProps) {
  const router = useRouter();
  const cursor = after ? { after } : before ? { before } : undefined;

  const { data, isLoading, error } = usePlayerAccountsCursor(tenantId, cursor);

  const accounts = data?.accounts ?? [];

  if (!tenantId) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <List className="text-muted-foreground size-4" />
              <CardTitle className="text-sm font-semibold">Người chơi</CardTitle>
              {tenantSelector}
            </div>
            {toolbarControls}
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground flex items-center gap-3 px-5 py-10">
          <Info className="h-4 w-4 shrink-0" />
          <span className="text-sm">Chọn một Tenant để xem danh sách người chơi.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="text-muted-foreground size-4" />
            <CardTitle className="text-sm font-semibold">Người chơi</CardTitle>
            {tenantSelector}
          </div>
          <div className="flex items-center gap-1.5">
            {accounts.length > 0 && !isLoading && (
              <span className="text-muted-foreground text-xs tabular-nums">{accounts.length} tài khoản</span>
            )}
            {toolbarControls}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0 pb-0">
        {error && <p className="text-destructive px-5 pb-2 text-sm">{error.message}</p>}

        {isLoading ? (
          <div className="bg-muted h-80 animate-pulse" />
        ) : accounts.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-1 text-center">
            <p className="text-muted-foreground text-sm font-medium">Chưa có người chơi nào</p>
            <p className="text-muted-foreground text-xs">Tenant này chưa có tài khoản người chơi.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Tên tài khoản</TableHead>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="pr-5 text-right">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <AccountRow
                    key={account.accountId}
                    account={account}
                    onClick={() => router.push(`/accounts/players/${account.accountId}/settle`)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Prev / Next navigation */}
        {!isLoading && accounts.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const prevCursor = data?.prevCursor;
                if (prevCursor) {
                  onPrev(prevCursor);
                }
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
                const nextCursor = data?.nextCursor;
                if (nextCursor) {
                  onNext(nextCursor);
                }
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

function AccountRow({ account, onClick }: { account: PlayerAccount; onClick: () => void }) {
  const status = account.status as AccountStatus;
  return (
    <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={onClick}>
      <TableCell className="pl-5">
        <span className="font-mono text-sm">{account.username}</span>
      </TableCell>
      <TableCell className="text-sm">{account.displayName}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[status]}>{AccountStatusLabel[status]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground pr-5 text-right text-sm tabular-nums">
        {account.createdAt ? displayVNDateTime(new Date(account.createdAt)) : "—"}
      </TableCell>
    </TableRow>
  );
}
