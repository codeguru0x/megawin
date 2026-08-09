"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { type AccountStatus, AccountStatusLabel } from "@megawin/identity/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { Loader2, Search, SearchX, UserSearch, X } from "lucide-react";
import { parseAsString, useQueryStates } from "nuqs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenantOptions } from "@/hooks/use-tenant-options";

import { useSearchPlayerAccounts } from "../../_shared/queries";
import type { PlayerAccount } from "../_lib/schema";
import { PlayersTable } from "./players-table";

export function PlayersContent() {
  // URL state — tất cả params trong 1 object:
  // tenant + search mutually exclusive
  // after + before mutually exclusive (cursor navigation)
  // Khi đổi tenant → clear after/before
  const [{ tenant: activeTenantId, search: activeSearch, after, before }, setUrlState] = useQueryStates(
    {
      tenant: parseAsString.withDefault(""),
      search: parseAsString.withDefault(""),
      after: parseAsString.withDefault(""),
      before: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  const { data, isLoading: isLoadingOptions } = useTenantOptions();
  const tenants = data?.tenants ?? [];

  // isSearchOpen: local state — ô input search có visible không.
  const [isSearchOpen, setIsSearchOpen] = useState(!!activeSearch);
  const [inputValue, setInputValue] = useState(activeSearch);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearchActive = !!activeSearch;

  // Khi tenants load xong mà URL chưa có ?tenant= và không đang search,
  // tự động chọn tenant đầu tiên (replace history — không phải user action).
  useEffect(() => {
    const firstTenant = tenants[0];
    if (!isLoadingOptions && firstTenant && !activeTenantId && !activeSearch) {
      void setUrlState(
        { tenant: firstTenant.tenantId, search: null, after: null, before: null },
        { history: "replace" },
      );
    }
  }, [isLoadingOptions, tenants, activeTenantId, activeSearch, setUrlState]);

  // Focus input khi mở
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  // Khởi tạo isSearchOpen từ URL khi mount lần đầu — chỉ chạy 1 lần, không theo activeSearch thay đổi sau đó.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy 1 lần lúc mount, không muốn re-run khi activeSearch đổi.
  useEffect(() => {
    if (activeSearch) setIsSearchOpen(true);
  }, []);

  const handleOpenSearch = () => setIsSearchOpen(true);

  const handleSubmitSearch = () => {
    const keyword = inputValue.trim();
    if (!keyword) return;
    void setUrlState({ search: keyword, tenant: null, after: null, before: null });
  };

  const handleClearSearch = () => {
    setInputValue("");
    setIsSearchOpen(false);
    // Clear search + cursor → useEffect auto-select tenant đầu tiên
    void setUrlState({ search: null, tenant: null, after: null, before: null }, { history: "replace" });
  };

  const handleTenantChange = (v: string) => {
    // Đổi tenant → clear cursor (bắt đầu từ trang đầu)
    void setUrlState({ tenant: v || null, search: null, after: null, before: null });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmitSearch();
    if (e.key === "Escape") handleClearSearch();
  };

  const handleNext = (nextCursor: string) => {
    void setUrlState({ after: nextCursor, before: null });
  };

  const handlePrev = (prevCursor: string) => {
    void setUrlState({ before: prevCursor, after: null });
  };

  // Controls dùng chung cho cả PlayersTable header lẫn SearchResultCard header
  const toolbarControls = (
    <div className="flex items-center gap-2">
      {isSearchActive ? (
        /* Đang có kết quả search — hiện keyword pill + nút xoá */
        <>
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
            <Search className="size-3 text-muted-foreground" />
            <span className="max-w-35 truncate font-mono text-xs text-foreground">{activeSearch}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={handleClearSearch}
            title="Xoá tìm kiếm"
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : isSearchOpen ? (
        /* Input đang mở — chưa submit */
        <>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mã TK hoặc tên tài khoản…"
            className="h-7 w-48 font-mono text-xs"
          />
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={handleSubmitSearch}
            disabled={!inputValue.trim()}
          >
            Tìm
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={() => setIsSearchOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        </>
      ) : (
        /* Trạng thái mặc định — icon search */
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={handleOpenSearch}
          title="Tìm kiếm theo mã tài khoản hoặc tên tài khoản"
        >
          <Search className="size-3.5" />
        </Button>
      )}
    </div>
  );

  // Tenant selector dùng chung — chỉ hiển thị khi không search
  const tenantSelector = !isSearchActive && (
    <Select value={activeTenantId} onValueChange={handleTenantChange} disabled={isLoadingOptions}>
      <SelectTrigger className="h-7 w-auto max-w-55 border-0 bg-transparent px-1.5 text-xs font-medium shadow-none focus:ring-0">
        <SelectValue placeholder={isLoadingOptions ? "Đang tải..." : "Chọn đối tác"} />
      </SelectTrigger>
      <SelectContent>
        {tenants.map((t) => (
          <SelectItem key={t.tenantId} value={t.tenantId}>
            <span className="font-medium">{t.displayName}</span>
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{t.tenantId}</span>
          </SelectItem>
        ))}
        {tenants.length === 0 && !isLoadingOptions && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">Chưa có đối tác nào.</div>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      {isSearchActive ? (
        <SearchResultCard keyword={activeSearch} toolbarControls={toolbarControls} />
      ) : (
        <PlayersTable
          tenantId={activeTenantId}
          after={after || undefined}
          before={before || undefined}
          onNext={handleNext}
          onPrev={handlePrev}
          tenantSelector={tenantSelector}
          toolbarControls={toolbarControls}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SearchResultCard — hiển thị kết quả tìm kiếm (0-N kết quả)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  read_only: "secondary",
  suspended: "destructive",
};

function SearchResultCard({ keyword, toolbarControls }: { keyword: string; toolbarControls: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, error } = useSearchPlayerAccounts(keyword);

  const accounts = data?.accounts ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserSearch className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Kết quả tìm kiếm</CardTitle>
            <span className="font-mono text-xs text-muted-foreground">{keyword}</span>
            {accounts.length > 0 && (
              <Badge variant="secondary" className="tabular-nums text-[11px]">
                {accounts.length} kết quả
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">{toolbarControls}</div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        {error && <p className="px-5 pb-2 text-sm text-destructive">{error.message}</p>}
        {isLoading ? (
          <div className="flex h-30 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Đang tìm kiếm...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex h-30 flex-col items-center justify-center gap-1 text-center">
            <SearchX className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Không tìm thấy</p>
            <p className="text-xs text-muted-foreground">
              Không có tài khoản nào khớp với <span className="font-mono">{keyword}</span>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Tên tài khoản</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="pr-5 text-right">Ngày tạo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const status = account.status as AccountStatus;
                  return (
                    <TableRow
                      key={account.accountId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/accounts/players/${account.accountId}/settle`)}
                    >
                      <TableCell className="pl-5">
                        <span className="font-mono text-sm">{account.username}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-muted-foreground">{account.tenantId}</span>
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
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
