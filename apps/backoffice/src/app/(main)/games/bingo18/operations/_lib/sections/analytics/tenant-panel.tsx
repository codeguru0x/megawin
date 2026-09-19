"use client";

import type { CSSProperties } from "react";

/**
 * Bingo 18 – Tenant Panel (cột hẹp cạnh Live feed)
 *
 * Thích ứng số lượng (guideline §5): ≤ 3 đại lý → mỗi đại lý 1 card giàu thông tin
 * (rank + % share + bar doanh thu + chỉ số); > 3 → bảng compact cuộn.
 * Data từ `stats.byTenant` (snapshot) — không request riêng.
 */
import { formatNumber } from "@megawin/shared/utils";
import { Building2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { TenantRow } from "../../types";

function TenantRichCard({ tenant, rank }: { tenant: TenantRow; rank: number }) {
  return (
    <div className="border-border/50 bg-muted/10 space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
            rank === 1
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{tenant.tenantId}</span>
        <span className="text-muted-foreground shrink-0 text-[11px] font-medium tabular-nums">
          {tenant.pct.toFixed(0)}%
        </span>
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="h-full w-[var(--bar-w)] rounded-full bg-amber-500/60 transition-all"
          style={{ "--bar-w": `${tenant.pct}%` } as CSSProperties}
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-muted/40 rounded-md px-1 py-1.5">
          <p className="text-muted-foreground text-[10px]">Doanh thu</p>
          <p className="text-xs font-semibold tabular-nums">{formatNumber(tenant.revenue)}</p>
        </div>
        <div className="bg-muted/40 rounded-md px-1 py-1.5">
          <p className="text-muted-foreground text-[10px]">Hoa hồng</p>
          <p className="text-xs font-semibold tabular-nums">{formatNumber(tenant.commission)}</p>
        </div>
        <div className="bg-muted/40 rounded-md px-1 py-1.5">
          <p className="text-muted-foreground text-[10px]">Phiếu</p>
          <p className="text-xs font-semibold tabular-nums">{formatNumber(tenant.entries)}</p>
        </div>
      </div>
    </div>
  );
}

export function TenantPanel({ tenants }: { tenants: TenantRow[] }) {
  if (tenants.length === 0) {
    return null;
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="text-muted-foreground size-4 shrink-0" />
          <CardTitle className="text-sm font-semibold">Đại lý</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-4">
        {tenants.length <= 3 ? (
          // ≤ 3 đại lý → card giàu thông tin (KHÔNG bảng 1 dòng trống trải).
          <div className="space-y-2">
            {tenants.map((t, i) => (
              <TenantRichCard key={t.tenantId} tenant={t} rank={i + 1} />
            ))}
          </div>
        ) : (
          // > 3 đại lý → bảng compact cuộn.
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {tenants.map((t) => (
              <div
                key={t.tenantId}
                className="border-border/40 bg-muted/10 grid [grid-template-columns:1fr_4rem_5rem_3rem] items-center gap-x-2 rounded-lg border px-2.5 py-1.5"
              >
                <span className="truncate text-xs font-medium">{t.tenantId}</span>
                <span className="text-muted-foreground text-right text-[11px] tabular-nums">
                  {formatNumber(t.entries)}
                </span>
                <span className="text-right text-xs font-semibold tabular-nums">{formatNumber(t.revenue)}</span>
                <span className="text-muted-foreground text-right text-[11px] tabular-nums">{t.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
