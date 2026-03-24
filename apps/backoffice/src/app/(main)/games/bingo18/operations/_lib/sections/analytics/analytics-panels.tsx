"use client";

/**
 * Bingo 18 – Analytics Panels
 *
 * PlayTypeCard: phân bổ 5 kiểu chơi (singleNum, doubleMatch, tripleMatch, sumTotal, bigSmallDraw).
 * TenantBreakdownCard: doanh thu / hoa hồng theo đại lý.
 *
 * Bingo 18: basic boards (singleNum/doubleMatch/tripleMatch) + side bets (sumTotal/bigSmallDraw).
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import { BarChart2, Store } from "lucide-react";

// ─── PlayType Panel ─────────────────────────────────────────────────────────────

interface PlayTypeRow {
  playType: string;
  label: string;
  entries: number;
  selections: number;
  pct: number;
}

const PLAY_TYPE_COLORS: Record<string, string> = {
  singleNum: "bg-amber-400",
  doubleMatch: "bg-orange-500",
  "tripleMatch-specific": "bg-red-500",
  "tripleMatch-any": "bg-rose-400",
  sumTotal: "bg-cyan-500",
  bigSmallDraw: "bg-teal-500",
};

function isSideBet(playType: string) {
  return playType === "sumTotal" || playType === "bigSmallDraw";
}

export function PlayTypeCard({ playTypes }: { playTypes: PlayTypeRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
            <BarChart2 className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Phân bổ kiểu chơi</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Boards (singleNum · double · triple) · Side bets (sumTotal · bigSmallDraw)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {playTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1.5">
            {playTypes.map((row, i) => {
              const side = isSideBet(row.playType);
              const prevSide = i > 0 && isSideBet(playTypes[i - 1]!.playType);
              const showSeparator = side && !prevSide;
              return (
                <div key={row.playType}>
                  {showSeparator && (
                    <div className="relative flex items-center gap-2 py-1.5">
                      <div className="flex-1 border-t border-dashed border-border/50" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 shrink-0">
                        Side Bets
                      </span>
                      <div className="flex-1 border-t border-dashed border-border/50" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 py-1.5 group hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="w-28 shrink-0">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          side ? "text-cyan-700 dark:text-cyan-400" : "text-foreground",
                        )}
                      >
                        {row.label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            PLAY_TYPE_COLORS[row.playType] ?? "bg-slate-400",
                          )}
                          style={{ width: `${Math.max(row.pct, 0.5)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 w-44 justify-end">
                      <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                        {row.pct.toFixed(1)}%
                      </span>
                      <span className="text-xs tabular-nums font-medium w-16 text-right">
                        {formatNumber(row.selections)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tenant Breakdown ───────────────────────────────────────────────────────────

interface TenantRow {
  tenantId: string;
  entries: number;
  boards: number;
  players: number;
  revenue: number;
  commission: number;
  pct: number;
}

export function TenantBreakdownCard({ tenants }: { tenants: TenantRow[] }) {
  const maxRevenue = Math.max(...tenants.map((t) => t.revenue), 1);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
            <Store className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Phân tích theo đại lý</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Doanh thu · Hoa hồng · Người chơi
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <div
              className="grid gap-x-2 px-3 py-2 bg-muted/40 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
              style={{ gridTemplateColumns: "1fr 5rem 5rem 6rem" }}
            >
              <span>Đại lý</span>
              <span className="text-right">Entries</span>
              <span className="text-right">Người chơi</span>
              <span className="text-right">Doanh thu</span>
            </div>
            <div className="divide-y divide-border/50 max-h-[280px] overflow-y-auto">
              {tenants.map((t, i) => (
                <div
                  key={t.tenantId}
                  className="relative grid gap-x-2 px-3 py-2.5 items-center hover:bg-muted/20 transition-colors"
                  style={{ gridTemplateColumns: "1fr 5rem 5rem 6rem" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-500/5 dark:bg-blue-400/5 rounded-r-sm"
                    style={{ width: `${(t.revenue / maxRevenue) * 100}%` }}
                  />
                  <div className="relative flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground/40 w-4 tabular-nums shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium truncate">{t.tenantId}</span>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">
                      {t.pct.toFixed(0)}%
                    </span>
                  </div>
                  <span className="relative text-right tabular-nums text-sm">
                    {formatNumber(t.entries)}
                  </span>
                  <span className="relative text-right tabular-nums text-sm text-muted-foreground">
                    {formatNumber(t.players)}
                  </span>
                  <span className="relative text-right tabular-nums text-sm font-medium">
                    {formatNumber(t.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
