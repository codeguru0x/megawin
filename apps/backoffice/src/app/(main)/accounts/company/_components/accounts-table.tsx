"use client";

import {
  type AccountStatus,
  AccountStatusLabel,
  type CompanyRole,
  CompanyRoleLabel,
  MfaStatus,
  MfaStatusLabel,
} from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { List } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useCompanyAccounts } from "../../_shared/queries";
import type { CompanyAccount } from "../_lib/schema";
import { AccountRowActions } from "./row-actions";

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

export function CompanyAccountsTable() {
  const { data, isLoading, error } = useCompanyAccounts();

  const accounts = data?.accounts ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <List className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Danh sách tài khoản</CardTitle>
          </div>
          {accounts.length > 0 && !isLoading && (
            <span className="text-xs tabular-nums text-muted-foreground">{accounts.length} tài khoản</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        {error && <p className="px-5 pb-2 text-sm text-destructive">{error.message}</p>}
        {isLoading ? (
          <div className="h-80 animate-pulse bg-muted" />
        ) : accounts.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-muted-foreground">Chưa có tài khoản nào</p>
            <p className="text-xs text-muted-foreground">
              Tạo tài khoản mới bằng nút &ldquo;Thêm tài khoản&rdquo; ở trên.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 w-12">STT</TableHead>
                  <TableHead>Tên tài khoản</TableHead>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="pr-5 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account, index) => (
                  <CompanyAccountRow key={account.accountId} account={account} index={index} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyAccountRow({ account, index }: { account: CompanyAccount; index: number }) {
  const status = account.status as AccountStatus;
  const mfa = (account.mfaStatus ?? MfaStatus.None) as MfaStatus;

  return (
    <TableRow>
      <TableCell className="pl-5">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      </TableCell>
      <TableCell>
        <span className="text-sm font-medium">{account.username}</span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{account.displayName}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {account.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {CompanyRoleLabel[role as CompanyRole] ?? role}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{AccountStatusLabel[status] ?? status}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={MFA_VARIANT[mfa] ?? "outline"}>{MfaStatusLabel[mfa] ?? mfa}</Badge>
      </TableCell>
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {account.createdAt ? displayVNDateTime(new Date(account.createdAt)) : "—"}
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex justify-end">
          <AccountRowActions account={account} />
        </div>
      </TableCell>
    </TableRow>
  );
}
