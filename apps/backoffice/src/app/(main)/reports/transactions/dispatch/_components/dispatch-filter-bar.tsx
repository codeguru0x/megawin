"use client";

import { useEffect, useMemo, useState } from "react";

import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";
import {
  DISPATCH_ORDER_STATUS_LABELS,
  DISPATCH_SOURCE_KIND_LABELS,
} from "@megawin/tenant-dispatch/shared/labels";
import { HelpCircle, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";

import { FinancialDateRangePicker } from "@/components/date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  detectIdentity,
  IDENTITY_HINT,
  IDENTITY_KIND_LABELS,
  type IdentityKind,
} from "../_lib/identity-detector";
import { useDispatchFilters } from "../_lib/use-filters";
import { useDispatchFacets } from "../_lib/use-queries";
import { TenantCombobox } from "./tenant-combobox";

/**
 * Filter bar phục vụ 3 use case vận hành chính:
 *
 * 1. **Identity lookup** — staff có 1 ID cụ thể (Tx/BatchKey/AccountId/Username):
 *    dán vào universal search, auto-detect type → server trả exact match.
 *    Dimension filters bị bypass để tránh match rỗng.
 *
 * 2. **Daily monitoring** — vào trang → KPI "Cần chú ý" hiển thị số stuck.
 *    Click KPI → auto filter `retryMode=stuck`. Không cần setup tay.
 *
 * 3. **Drill-down tenant/status** — chọn Tenant + Status trong range date
 *    để xem orders của 1 tenant trong khoảng thời gian.
 *
 * ## Layout (1 hàng)
 *
 * ```
 * [🔍 Universal ID……]                   [📅 Date] [⚙ Bộ lọc·N]
 *   col-span 3                          col-span 9, justify-end
 * ```
 *
 * 3 selects (Trạng thái / Loại / Tenant) được gom vào Popover "Bộ lọc" — trigger
 * có badge đếm số filter đang active. Khi identity active → popover bị disabled.
 * Xoá filter nhanh qua nút "Xoá lọc" bên trong popover (không duplicate chip ngoài).
 */
export function DispatchFilterBar() {
  const {
    tx,
    batchKey,
    accountId,
    username,
    isIdentityMode,
    setIdentity,
    clearIdentity,

    tenantId,
    status,
    sourceKind,
    retryMode,
    setTenantId,
    setStatus,
    setSourceKind,
    setRetryMode,

    from,
    to,
    setRange,
  } = useDispatchFilters();

  const { data: facets, isLoading: facetsLoading } = useDispatchFacets({ from, to });

  // Current identity value — 1 trong 4 được set.
  const activeIdentity = useMemo<{ kind: IdentityKind; value: string } | null>(() => {
    if (tx) return { kind: "tx", value: tx };
    if (batchKey) return { kind: "batchKey", value: batchKey };
    if (accountId) return { kind: "accountId", value: accountId };
    if (username) return { kind: "username", value: username };
    return null;
  }, [tx, batchKey, accountId, username]);

  // Local input — chỉ commit khi submit (Enter / click Tìm).
  const [searchInput, setSearchInput] = useState(activeIdentity?.value ?? "");
  useEffect(() => {
    setSearchInput(activeIdentity?.value ?? "");
  }, [activeIdentity]);

  const detectedKind = useMemo(() => detectIdentity(searchInput), [searchInput]);
  const isInputValid = detectedKind !== null && searchInput.trim().length > 0;

  function handleSubmitSearch() {
    const value = searchInput.trim();
    if (!value) {
      clearIdentity();
      return;
    }
    const kind = detectIdentity(value);
    if (!kind) return; // invalid — giữ input, không submit
    setIdentity(kind, value);
  }

  function handleClearSearch() {
    setSearchInput("");
    clearIdentity();
  }

  const hasAnyDimension = !!(tenantId || status || sourceKind || retryMode);

  // Count dimension filters đang active để hiện badge trên trigger Popover.
  const activeDimensionCount =
    (tenantId ? 1 : 0) + (status ? 1 : 0) + (sourceKind ? 1 : 0) + (retryMode ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Main row — 2 cluster: search bên trái, date + filter bên phải (justify-end) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* ── Cluster 1: Universal search (col-span 3) ───────────────────── */}
        <div className="flex items-center gap-1.5 lg:col-span-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitSearch();
                if (e.key === "Escape") handleClearSearch();
              }}
              placeholder="Tx / Batch / Account / Username…"
              className="h-8 min-w-0 flex-1 pl-8 pr-16 font-mono text-xs"
            />
            {/* Detected-type badge bên phải input */}
            {searchInput.trim() && detectedKind && (
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-medium uppercase tabular-nums"
                >
                  {IDENTITY_KIND_LABELS[detectedKind]}
                </Badge>
              </span>
            )}
          </div>

          {isIdentityMode ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-xs"
              onClick={handleClearSearch}
              title="Xoá tìm"
            >
              <X className="size-3.5" />
              Xoá
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 shrink-0 px-3 text-xs"
              onClick={handleSubmitSearch}
              disabled={!isInputValid}
            >
              <Search className="size-3.5" />
              Tìm
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Gợi ý định dạng"
              >
                <HelpCircle className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-xs">
              {IDENTITY_HINT}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Cluster 2: Date + Filter Popover (col-span 9, justify-end) ── */}
        <div
          className={
            isIdentityMode
              ? "flex items-center justify-end gap-1.5 opacity-60 lg:col-span-9"
              : "flex items-center justify-end gap-1.5 lg:col-span-9"
          }
        >
          <FinancialDateRangePicker
            label=""
            from={from}
            to={to}
            onChange={(f, t) => setRange(f, t)}
            className="shrink-0 flex-nowrap gap-0!"
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                disabled={isIdentityMode}
                title="Bộ lọc"
              >
                <SlidersHorizontal className="size-3.5" />
                Bộ lọc
                {activeDimensionCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                  >
                    {activeDimensionCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bộ lọc chi tiết
                  </span>
                  {hasAnyDimension && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[11px]"
                      onClick={() => {
                        setTenantId(null);
                        setStatus(null);
                        setSourceKind(null);
                        setRetryMode(null);
                      }}
                    >
                      <RotateCcw className="size-3" />
                      Xoá lọc
                    </Button>
                  )}
                </div>

                {/* Status */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="dispatch-filter-status"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Trạng thái
                  </label>
                  <Select
                    value={status ?? "all"}
                    onValueChange={(v) =>
                      setStatus(v === "all" ? null : (v as DispatchOrderStatus))
                    }
                  >
                    <SelectTrigger
                      id="dispatch-filter-status"
                      size="sm"
                      className="h-8 w-full text-xs"
                    >
                      <SelectValue placeholder="Trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả trạng thái</SelectItem>
                      {Object.values(DispatchOrderStatus).map((s) => (
                        <SelectItem key={s} value={s}>
                          {DISPATCH_ORDER_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Source kind */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="dispatch-filter-source"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Loại nguồn
                  </label>
                  <Select
                    value={sourceKind ?? "all"}
                    onValueChange={(v) =>
                      setSourceKind(v === "all" ? null : (v as DispatchSourceKind))
                    }
                  >
                    <SelectTrigger
                      id="dispatch-filter-source"
                      size="sm"
                      className="h-8 w-full text-xs"
                    >
                      <SelectValue placeholder="Loại nguồn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả loại</SelectItem>
                      {Object.values(DispatchSourceKind).map((k) => (
                        <SelectItem key={k} value={k}>
                          {DISPATCH_SOURCE_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tenant */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="dispatch-filter-tenant"
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Tenant
                  </label>
                  <TenantCombobox
                    id="dispatch-filter-tenant"
                    value={tenantId}
                    onChange={setTenantId}
                    options={facets?.tenants.map((t) => ({ value: t.value, count: t.count })) ?? []}
                    isLoading={facetsLoading}
                    placeholder="Tất cả tenants"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Identity mode banner — hiển thị rõ cho staff biết đang lookup */}
      {isIdentityMode && activeIdentity && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <Search className="size-3.5 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            Đang tra cứu theo{" "}
            <span className="font-semibold text-foreground">
              {IDENTITY_KIND_LABELS[activeIdentity.kind]}
            </span>
            :
          </span>
          <code className="rounded bg-background px-1.5 py-0.5 font-mono">
            {activeIdentity.value}
          </code>
          <span className="text-muted-foreground">— các bộ lọc khác tạm bị tắt.</span>
        </div>
      )}
    </div>
  );
}
