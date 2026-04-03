"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Info, List } from "lucide-react";
import { AccountStatus, AccountStatusLabel } from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { usePlayerAccountsCursor } from "../../_shared/queries";
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
              <span className="text-xs tabular-nums text-muted-foreground">
                {accounts.length} tài khoản
              </span>
            )}
            {toolbarControls}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
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
                if (prevCursor) onPrev(prevCursor);
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
                if (nextCursor) onNext(nextCursor);
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
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onClick}>
      <TableCell className="pl-5">
        <span className="font-mono text-sm">{account.username}</span>
      </TableCell>
      <TableCell className="text-sm">{account.displayName}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
          {AccountStatusLabel[status] ?? status}
        </Badge>
      </TableCell>
      <TableCell className="pr-5 text-right text-sm tabular-nums text-muted-foreground">
        {account.createdAt ? displayVNDateTime(new Date(account.createdAt)) : "—"}
      </TableCell>
    </TableRow>
  );
}
