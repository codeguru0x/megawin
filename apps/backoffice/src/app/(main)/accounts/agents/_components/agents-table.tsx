"use client";

import { AccountStatusLabel, MfaStatusLabel, type AccountStatus, type MfaStatus } from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { List } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { AgentAccount } from "../_lib/schema";
import { useAgentAccounts } from "../../_shared/queries";
import { AgentRowActions } from "./row-actions";

const STATUS_VARIANT: Record<AccountStatus, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

const MFA_VARIANT: Record<MfaStatus, "default" | "outline" | "secondary" | "destructive"> = {
  none: "outline",
  enabled: "default",
  disabled: "secondary",
};

export function AgentAccountsTable() {
  const { data, isLoading, error } = useAgentAccounts();

  const accounts = data?.accounts ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="text-muted-foreground size-4" />
            <CardTitle className="text-sm font-semibold">Danh sách đại lý</CardTitle>
          </div>
          {accounts.length > 0 && !isLoading && (
            <span className="text-muted-foreground text-xs tabular-nums">{accounts.length} tài khoản</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-0 pb-0">
        {error && <p className="text-destructive px-5 pb-2 text-sm">{error.message}</p>}
        {isLoading ? (
          <div className="bg-muted h-80 animate-pulse" />
        ) : accounts.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-1 text-center">
            <p className="text-muted-foreground text-sm font-medium">Chưa có tài khoản đại lý nào</p>
            <p className="text-muted-foreground text-xs">
              Tạo tài khoản mới bằng nút &ldquo;Thêm đại lý&rdquo; ở trên.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-5">STT</TableHead>
                  <TableHead>Tên tài khoản</TableHead>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="w-10 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account, index) => (
                  <AgentAccountRow key={account.accountId} account={account} index={index} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentAccountRow({ account, index }: { account: AgentAccount; index: number }) {
  const status = account.status as AccountStatus;
  const mfa = account.mfaStatus as MfaStatus;

  return (
    <TableRow>
      <TableCell className="pl-5">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{index + 1}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm font-medium">{account.username}</span>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{account.displayName}</TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {account.tenantId}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[status]}>{AccountStatusLabel[status]}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={MFA_VARIANT[mfa]}>{MfaStatusLabel[mfa]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {account.createdAt ? displayVNDateTime(new Date(account.createdAt)) : "—"}
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex justify-end">
          <AgentRowActions account={account} />
        </div>
      </TableCell>
    </TableRow>
  );
}
