"use client";

import { useQueryState } from "nuqs";
import { Filter } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantOptions } from "@/hooks/use-tenant-options";

import { PlayersTable } from "./players-table";

export function PlayersContent() {
  // tenant selector persist vào URL — user không mất lựa chọn khi refresh
  const [activeTenantId, setActiveTenantId] = useQueryState("tenant", {
    defaultValue: "",
  });
  const { data, isLoading: isLoadingOptions } = useTenantOptions();

  const tenants = data?.tenants ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="tenant-select" className="flex items-center gap-1.5 text-xs font-medium">
            <Filter className="size-3 text-muted-foreground" />
            Tenant
          </Label>
          <Select value={activeTenantId} onValueChange={(v) => setActiveTenantId(v || null)}>
            <SelectTrigger id="tenant-select">
              <SelectValue placeholder={isLoadingOptions ? "Đang tải..." : "Chọn đối tác"} />
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

      <PlayersTable tenantId={activeTenantId} />
    </div>
  );
}
