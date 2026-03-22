"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryStates, parseAsString } from "nuqs";
import { Filter, Loader2, Search, SearchX, UserSearch, X } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";
import { useTenantOptions } from "@/hooks/use-tenant-options";

import { useSearchPlayerAccounts } from "../../_shared/queries";
import { searchResultColumns } from "./columns";
import { PlayersTable } from "./players-table";
import type { PlayerAccount } from "../_lib/schema";

export function PlayersContent() {
  // URL state — tất cả params trong 1 object:
  // tenant + search mutually exclusive
  // after + before mutually exclusive (cursor navigation)
  // Khi đổi tenant → clear after/before
  const [{ tenant: activeTenantId, search: activeSearch, after, before }, setUrlState] =
    useQueryStates(
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

  // Khởi tạo isSearchOpen từ URL khi mount lần đầu
  useEffect(() => {
    if (activeSearch) setIsSearchOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    void setUrlState(
      { search: null, tenant: null, after: null, before: null },
      { history: "replace" },
    );
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

  return (
    <div className="space-y-4">
      {/* ── Filter Bar: icon search + tenant dropdown, căn phải ─────────── */}
      <div className="flex items-end justify-end gap-2">
        {/* Search input — xuất hiện bên trái icon khi isSearchOpen */}
        {isSearchOpen && (
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Mã TK (ULID) hoặc tên tài khoản (user@tenant / prefix)"
              className="h-9 w-64 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={handleSubmitSearch}
              disabled={!inputValue.trim()}
              title="Tìm kiếm"
            >
              <Search className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={handleClearSearch}
              title="Đóng tìm kiếm"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {/* Icon search toggle — chỉ hiện khi input chưa mở */}
        {!isSearchOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 self-end"
            onClick={handleOpenSearch}
            title="Tìm kiếm theo mã tài khoản hoặc tên tài khoản"
          >
            <Search className="size-4" />
          </Button>
        )}

        {/* Tenant dropdown — disabled khi search active */}
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="tenant-select" className="flex items-center gap-1.5 text-xs font-medium">
            <Filter className="size-3 text-muted-foreground" />
            Tenant
          </Label>
          <Select
            value={isSearchActive ? "" : activeTenantId}
            onValueChange={(v) => {
              if (isSearchActive) return;
              handleTenantChange(v);
            }}
            disabled={isSearchActive}
          >
            <SelectTrigger id="tenant-select">
              <SelectValue
                placeholder={
                  isSearchActive
                    ? "Đang tìm kiếm..."
                    : isLoadingOptions
                      ? "Đang tải..."
                      : "Chọn đối tác"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.tenantId} value={t.tenantId}>
                  {t.displayName} ({t.tenantId})
                </SelectItem>
              ))}
              {tenants.length === 0 && !isLoadingOptions && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Chưa có đối tác nào.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Content Area ─────────────────────────────────────────────────── */}
      {isSearchActive ? (
        <SearchResultCard keyword={activeSearch} />
      ) : (
        <PlayersTable
          tenantId={activeTenantId}
          after={after || undefined}
          before={before || undefined}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SearchResultCard — hiển thị kết quả tìm kiếm (0-N kết quả)
// ─────────────────────────────────────────────────────────────────────────────

function SearchResultCard({ keyword }: { keyword: string }) {
  const { data, isLoading, error } = useSearchPlayerAccounts(keyword);

  const accounts = data?.accounts ?? [];

  const table = useDataTableInstance<PlayerAccount, unknown>({
    data: accounts,
    columns: searchResultColumns,
    enableRowSelection: false,
    defaultPageSize: 20,
    getRowId: (row) => row.accountId,
  });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserSearch className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Kết quả tìm kiếm – <span className="font-mono text-xs font-normal">{keyword}</span>
            </CardTitle>
            {accounts.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {accounts.length} kết quả
              </span>
            )}
          </div>
          <DataTableViewOptions table={table} />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        <div className="overflow-hidden rounded-md border">
          {isLoading ? (
            <div className="flex h-[120px] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Đang tìm kiếm...</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex h-[120px] flex-col items-center justify-center gap-1 text-center">
              <SearchX className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Không tìm thấy</p>
              <p className="text-xs text-muted-foreground">
                Không có tài khoản nào khớp với <span className="font-mono">{keyword}</span>
              </p>
            </div>
          ) : (
            <DataTable table={table} columns={searchResultColumns} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
