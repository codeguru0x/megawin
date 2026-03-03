"use client";

import { useState, useMemo } from "react";
import { Building2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { useTenants } from "../_lib/use-tenants";
import { TenantCard } from "./tenant-card";

export function TenantsList() {
  const { data, isLoading, isError, error } = useTenants();
  const [search, setSearch] = useState("");

  const tenants = data?.tenants;

  const filtered = useMemo(() => {
    if (!tenants) return [];
    if (!search.trim()) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(
      (t) =>
        t.tenantId.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  const stats = useMemo(() => {
    if (!tenants) return { total: 0, active: 0, inactive: 0 };
    const active = tenants.filter((t) => t.status === "active").length;
    return { total: tenants.length, active, inactive: tenants.length - active };
  }, [tenants]);

  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Tổng đối tác"
          value={stats.total}
          isLoading={isLoading}
        />
        <KpiCard
          label="Đang hoạt động"
          value={stats.active}
          isLoading={isLoading}
          variant="success"
        />
        <KpiCard
          label="Vô hiệu hoá"
          value={stats.inactive}
          isLoading={isLoading}
          variant="danger"
        />
      </div>

      {/* Search */}
      {(tenants?.length ?? 0) > 1 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc ID đối tác…"
            className="h-9 pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && <CardListSkeleton />}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-sm text-destructive">
            Không thể tải danh sách:{" "}
            {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState hasSearch={!!search.trim()} />
      )}

      {/* Tenant Cards */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  isLoading,
  variant,
}: {
  label: string;
  value: number;
  isLoading: boolean;
  variant?: "success" | "danger";
}) {
  const colorClass =
    variant === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "danger"
        ? "text-red-500 dark:text-red-400"
        : "text-foreground";

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-1 h-8 w-12" />
      ) : (
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${colorClass}`}>
          {value}
        </p>
      )}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-20">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Building2 className="size-6 text-muted-foreground/50" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">
        {hasSearch ? "Không tìm thấy đối tác phù hợp" : "Chưa có đối tác nào"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasSearch
          ? "Thử tìm kiếm với từ khoá khác"
          : 'Nhấn "Thêm đối tác" ở góc phải để bắt đầu'}
      </p>
    </div>
  );
}

function CardListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card">
          <div className="flex items-center gap-3 border-b px-6 py-4">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="space-y-3 p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="space-y-3 p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
          <div className="flex justify-between border-t px-6 py-3">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
