"use client";

import React, { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  Search,
  Plus,
  AlertCircle,
  TrendingUp,
  Power,
  Save,
  CheckCircle2,
  XCircle,
  Users,
  CircleCheck,
  CircleX,
} from "lucide-react";

import { displayVNDateTime } from "@megawin/shared/utils";

import { MoneyInput } from "@megawin/ui/components/money-input";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  useTenantConfigs,
  useCreateTenantConfig,
  useUpdateTenantConfig,
  type TenantConfig,
} from "./_lib/use-tenant-config";
import { useTenantOptions, type TenantOption } from "@/hooks/use-tenant-options";

// ─────────────────────────────────────────────
// Form schema
// ─────────────────────────────────────────────

const tenantFormSchema = z.object({
  commissionRate: z.coerce
    .number()
    .min(0, "Hoa hồng không được nhỏ hơn 0%")
    .max(100, "Hoa hồng không được vượt quá 100%"),
  isEnabled: z.boolean(),
});

type TenantFormValues = z.infer<typeof tenantFormSchema>;

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function KenoTenantConfigPage() {
  const { data: tenantConfigs, isLoading, isError, error } = useTenantConfigs();
  const { data: tenantOptionsData, isLoading: isLoadingOptions } = useTenantOptions();
  const createMutation = useCreateTenantConfig();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const tenantOptions = tenantOptionsData?.tenants;

  const displayNameMap = useMemo(
    () => new Map(tenantOptions?.map((t) => [t.tenantId, t.displayName]) ?? []),
    [tenantOptions],
  );

  const filtered = useMemo(() => {
    if (!tenantConfigs) return [];
    if (!search.trim()) return tenantConfigs;
    const q = search.toLowerCase();
    return tenantConfigs.filter((c) => {
      const name = displayNameMap.get(c.tenantId) ?? "";
      return c.tenantId.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [tenantConfigs, search, displayNameMap]);

  const stats = tenantConfigs
    ? {
        total: tenantConfigs.length,
        active: tenantConfigs.filter((c) => c.isEnabled).length,
        inactive: tenantConfigs.filter((c) => !c.isEnabled).length,
      }
    : { total: 0, active: 0, inactive: 0 };

  function handleCreateTenant(tenantId: string) {
    const alreadyExists = tenantConfigs?.some((c) => c.tenantId === tenantId);
    if (alreadyExists) return;
    createMutation.mutate(tenantId, {
      onSuccess: () => setDialogOpen(false),
    });
  }

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-orange-500 to-orange-600 shadow-sm">
            <Building2 className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Keno — Cấu hình đại lý
            </h1>
            <p className="text-xs text-muted-foreground">
              Quản lý hoa hồng và trạng thái hoạt động của từng đại lý
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(tenantConfigs?.length ?? 0) > 1 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên hoặc ID đại lý…"
                className="h-9 w-64 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <AddTenantDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            tenantOptions={tenantOptions}
            existingIds={tenantConfigs?.map((c) => c.tenantId) ?? []}
            isLoadingOptions={isLoadingOptions}
            onCreateTenant={handleCreateTenant}
            isCreating={createMutation.isPending}
          />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          icon={Users}
          iconBg="bg-indigo-100 dark:bg-indigo-900/50"
          iconColor="text-indigo-600 dark:text-indigo-400"
          label="Tổng đại lý"
          value={stats.total}
          isLoading={isLoading}
        />
        <KpiCard
          icon={CircleCheck}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="Đang hoạt động"
          value={stats.active}
          isLoading={isLoading}
        />
        <KpiCard
          icon={CircleX}
          iconBg="bg-red-100 dark:bg-red-900/50"
          iconColor="text-red-500 dark:text-red-400"
          label="Vô hiệu hoá"
          value={stats.inactive}
          isLoading={isLoading}
        />
      </div>

      {/* States */}
      {isLoading && <CardListSkeleton />}

      {isError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-sm text-destructive">
            Không thể tải danh sách: {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState hasSearch={!!search.trim()} />
      )}

      {/* Tenant Cards */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((config) => (
            <TenantCard
              key={config.id}
              config={config}
              displayName={displayNameMap.get(config.tenantId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  isLoading,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`size-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-6 w-10" />
        ) : (
          <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tenant Card (form per tenant)
// ─────────────────────────────────────────────

function TenantCard({ config, displayName }: { config: TenantConfig; displayName?: string }) {
  const mutation = useUpdateTenantConfig(config.tenantId);

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema) as any,
    values: {
      commissionRate: config.commissionRate * 100,
      isEnabled: config.isEnabled,
    },
  });

  const isEnabled = form.watch("isEnabled");

  function handleSubmit(values: TenantFormValues) {
    const data: Record<string, unknown> = {};
    const newRate = values.commissionRate / 100;

    if (newRate !== config.commissionRate) data.commissionRate = newRate;
    if (values.isEnabled !== config.isEnabled) data.isEnabled = values.isEnabled;

    if (Object.keys(data).length === 0) return;
    mutation.mutate(data);
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          {/* Card Header */}
          <CardHeader className="flex-row items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Building2 className="size-4.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {displayName || config.tenantId}
                  </h3>
                </div>
                {displayName && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{config.tenantId}</p>
                )}
              </div>
            </div>

            <Badge
              variant={config.isEnabled ? "default" : "destructive"}
              className="shrink-0 gap-1 text-xs"
            >
              {config.isEnabled ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <XCircle className="size-3" />
              )}
              {config.isEnabled ? "Hoạt động" : "Vô hiệu hoá"}
            </Badge>
          </CardHeader>

          {/* Card Content */}
          <CardContent className="p-0">
            <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {/* Commission Rate Field */}
              <div className="p-6">
                <FormField
                  control={form.control}
                  name="commissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
                          <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <FormLabel className="text-sm font-semibold">Hoa hồng đại lý</FormLabel>
                          <p className="text-xs text-muted-foreground">Tỷ lệ trên tổng doanh thu</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <FormControl>
                            <MoneyInput
                              className="h-12 w-24 text-center text-2xl font-bold tabular-nums"
                              value={field.value}
                              onValueChange={(v) => field.onChange(v ?? 0)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              decimalScale={1}
                              thousandSeparator={false}
                              isAllowed={({ floatValue }) =>
                                floatValue === undefined || floatValue <= 100
                              }
                            />
                          </FormControl>
                          <span className="text-lg font-semibold text-muted-foreground">%</span>
                        </div>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* Status Toggle Field */}
              <div className="p-6">
                <FormField
                  control={form.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <FormItem>
                      <div className="mb-4 flex items-center gap-3">
                        <div
                          className={`flex size-9 items-center justify-center rounded-lg ${
                            isEnabled
                              ? "bg-emerald-100 dark:bg-emerald-950/40"
                              : "bg-red-100 dark:bg-red-950/40"
                          }`}
                        >
                          <Power
                            className={`size-4 ${
                              isEnabled
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-500 dark:text-red-400"
                            }`}
                          />
                        </div>
                        <div>
                          <FormLabel className="text-sm font-semibold">Trạng thái game</FormLabel>
                          <p className="text-xs text-muted-foreground">Cho phép đại lý bán vé</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <span
                          className={`text-sm font-medium ${
                            isEnabled
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500 dark:text-red-400"
                          }`}
                        >
                          {isEnabled ? "Đang hoạt động" : "Đã vô hiệu hoá"}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>

          {/* Card Footer */}
          <CardFooter className="justify-between border-t px-5 py-3">
            <p className="text-xs tabular-nums text-muted-foreground">
              v{config.version} · Cập nhật {displayVNDateTime(config.updatedAt)}
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={mutation.isPending || !form.formState.isDirty}
            >
              {mutation.isPending ? (
                <Spinner className="mr-2" />
              ) : (
                <Save className="mr-2 size-3.5" />
              )}
              Lưu thay đổi
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Add Tenant Dialog
// ─────────────────────────────────────────────

function AddTenantDialog({
  open,
  onOpenChange,
  tenantOptions,
  existingIds,
  isLoadingOptions,
  onCreateTenant,
  isCreating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantOptions: TenantOption[] | undefined;
  existingIds: string[];
  isLoadingOptions: boolean;
  onCreateTenant: (tenantId: string) => void;
  isCreating: boolean;
}) {
  const [dialogSearch, setDialogSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const existingSet = new Set(existingIds);

  const available = useMemo(() => {
    if (!tenantOptions) return [];
    return tenantOptions.filter((t) => !existingSet.has(t.tenantId));
  }, [tenantOptions, existingSet]);

  const filtered = useMemo(() => {
    if (!dialogSearch.trim()) return available;
    const q = dialogSearch.toLowerCase();
    return available.filter(
      (t) => t.tenantId.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q),
    );
  }, [available, dialogSearch]);

  function handleOpenChange(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setSelected(null);
      setDialogSearch("");
    }
  }

  function handleCreate() {
    if (!selected) return;
    onCreateTenant(selected);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          Thêm đại lý
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-orange-500 to-orange-600 shadow-sm">
              <Building2 className="size-4.5 text-white" />
            </div>
            <div>
              <DialogTitle>Thêm cấu hình đại lý</DialogTitle>
              <DialogDescription>
                Chọn đại lý từ hệ thống để tạo cấu hình Keno. Chỉ hiển thị đại lý chưa có cấu hình.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm theo ID hoặc tên đại lý…"
              className="h-9 pl-8 text-sm"
              value={dialogSearch}
              onChange={(e) => setDialogSearch(e.target.value)}
            />
          </div>

          <ScrollArea className="h-[260px] rounded-lg border">
            {isLoadingOptions && (
              <div className="space-y-1 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-md" />
                ))}
              </div>
            )}

            {!isLoadingOptions && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="size-6 text-muted-foreground/40" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {dialogSearch
                    ? "Không tìm thấy đại lý phù hợp"
                    : available.length === 0
                      ? "Tất cả đại lý đã có cấu hình"
                      : "Không có đại lý nào"}
                </p>
              </div>
            )}

            <div className="space-y-0.5 p-1.5">
              {filtered.map((t) => (
                <button
                  key={t.tenantId}
                  type="button"
                  onClick={() => setSelected(t.tenantId)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                    selected === t.tenantId ? "bg-primary/10 ring-1 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Building2 className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.tenantId}</p>
                  </div>
                  <Badge
                    variant={t.status === "active" ? "default" : "secondary"}
                    className="shrink-0 text-xs"
                  >
                    {t.status === "active" ? "Hoạt động" : t.status}
                  </Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleCreate} disabled={!selected || isCreating}>
            {isCreating ? <Spinner className="mr-2" /> : null}
            Tạo cấu hình
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-20">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Building2 className="size-6 text-muted-foreground/50" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">
        {hasSearch ? "Không tìm thấy đại lý phù hợp" : "Chưa có đại lý nào được cấu hình"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasSearch ? "Thử tìm kiếm với từ khoá khác" : 'Nhấn "Thêm đại lý" ở góc phải để bắt đầu'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Card List Skeleton
// ─────────────────────────────────────────────

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
              <Skeleton className="h-12 w-24" />
            </div>
            <div className="space-y-3 p-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
          <div className="flex justify-end border-t px-6 py-3">
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
