"use client";

/**
 * Max 3D – Analytics Panels (tab Phân tích cược)
 *
 * Toàn bộ data từ snapshot slice (adapters) — KHÔNG request riêng:
 * - PlayTypeCard: 4 nhóm (straight/combo3/combo6/plus) theo revenue.
 * - TopTripletsCard: bộ ba bị dồn tiền (từ tripletStakes).
 * - PairTable: cặp Max 3D+ bị dồn + liability ĐB — PANEL RỦI RO SỐ 1, tô màu theo
 *   ngưỡng config thực (`overLiability`/`overAccounts` gắn sẵn từ adapter).
 * - RiskCluster: [Top người chơi | Top phải trả (ước tính)].
 * - TenantPanel: doanh thu đại lý (card ≤3 / bảng >3).
 */

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { formatNumber } from "@megawin/shared/utils";
import { Building2, Grid3x3, Link2, PieChart, TrendingUp, TriangleAlert } from "lucide-react";

import { PlayerOutstandingLink } from "@/components/player-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { PairRow, PlayTypeRow, TenantRow, TopAccountRow, TopPotentialRow, TopTripletRow } from "../../types";

// ─── Play type distribution ───────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { dot: string; bar: string }> = {
  basicStraight: { dot: "bg-amber-400", bar: "bg-amber-400/70" },
  basicCombo3: { dot: "bg-orange-500", bar: "bg-orange-500/70" },
  basicCombo6: { dot: "bg-red-400", bar: "bg-red-400/70" },
  plus: { dot: "bg-violet-500", bar: "bg-violet-500/70" },
};

export function PlayTypeCard({ playTypes }: { playTypes: PlayTypeRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <PieChart className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Phân bổ kiểu chơi</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {playTypes.map((r) => {
            const color = GROUP_COLORS[r.playType] ?? GROUP_COLORS.basicStraight!;
            return (
              <div key={r.playType} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 shrink-0 rounded-full", color.dot)} />
                  <span className="truncate text-xs font-medium">{r.label}</span>
                </div>
                <p className="mt-1 text-sm font-bold tabular-nums">{formatNumber(r.revenue)}</p>
                <p
                  className="text-[10px] tabular-nums text-muted-foreground"
                  title="Số phiếu xấp xỉ theo nhóm — cộng dồn không dedupe khi 1 phiếu có nhiều bộ số cùng nhóm."
                >
                  {formatNumber(r.units)} đơn vị · {formatNumber(r.entries)} phiếu
                </p>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", color.bar)} style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Top triplets ─────────────────────────────────────────────────────────────

export function TopTripletsCard({ rows }: { rows: TopTripletRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Grid3x3 className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <CardTitle className="text-sm font-semibold">Bộ ba bị dồn tiền</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Combo tính theo từng hoán vị (mỗi hoán vị là 1 line dự thưởng)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div
                key={r.triplet}
                className="grid items-center gap-x-2 rounded-lg border border-border/40 bg-muted/10 px-2.5 py-1.5"
                style={{ gridTemplateColumns: "1.5rem 3.5rem 1fr 5.5rem" }}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground/50">{i + 1}</span>
                <span className="inline-flex h-6 items-center justify-center rounded-md bg-emerald-500/15 px-1.5 font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {r.triplet}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatNumber(r.straightUnits)} trùng khớp · {formatNumber(r.comboUnits)} tổ hợp
                </span>
                <span className="text-right text-xs font-semibold tabular-nums">{formatNumber(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pair table (rủi ro số 1) ─────────────────────────────────────────────────

export function PairTable({ rows }: { rows: PairRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
            <Link2 className="size-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Cặp Max 3D+ bị dồn</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Liability ĐB = số bộ × 1 tỷ — KHÔNG có cap, đỏ khi vượt ngưỡng config
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chưa có cược Max 3D+</p>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div
                key={r.pairKey}
                className={cn(
                  "grid items-center gap-x-2 rounded-lg border px-2.5 py-1.5",
                  r.overLiability
                    ? "border-red-300/70 bg-red-50/60 dark:border-red-800/50 dark:bg-red-950/20"
                    : "border-border/40 bg-muted/10",
                )}
                style={{ gridTemplateColumns: "7.5rem 3.5rem 4.5rem 1fr" }}
              >
                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
                  <span className="rounded bg-violet-500/15 px-1 py-0.5 text-violet-700 dark:text-violet-400">
                    {r.triplet1}
                  </span>
                  <span className="text-muted-foreground/50">–</span>
                  <span className="rounded bg-violet-500/15 px-1 py-0.5 text-violet-700 dark:text-violet-400">
                    {r.triplet2}
                  </span>
                </span>
                <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatNumber(r.units)} bộ
                </span>
                <span
                  className={cn(
                    "text-right text-[11px] tabular-nums",
                    r.overAccounts ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}
                  title={r.overAccounts ? "Nhiều account cùng cược cặp này (nghi syndicate)" : undefined}
                >
                  {formatNumber(r.accounts)} acc
                </span>
                <span
                  className={cn(
                    "text-right text-xs font-semibold tabular-nums",
                    r.overLiability ? "text-red-600 dark:text-red-400" : "text-foreground",
                  )}
                >
                  Trả {formatNumber(r.liability)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Risk cluster ─────────────────────────────────────────────────────────────

const VISIBLE_ROWS = 10;

function RankBadge({ rank, topClass }: { rank: number; topClass: string }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
        rank === 1 ? topClass : "bg-muted text-muted-foreground",
      )}
    >
      {rank}
    </span>
  );
}

export function RiskCluster({
  drawId,
  topAccounts,
  topPotential,
}: {
  drawId: string;
  topAccounts: TopAccountRow[];
  topPotential: TopPotentialRow[];
}) {
  if (topAccounts.length === 0 && topPotential.length === 0) return null;

  return (
    <div className="grid gap-4 @[40rem]/main:grid-cols-2">
      {topAccounts.length > 0 && (
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-sm font-semibold">Top người chơi</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
            <div className="divide-y divide-border/40">
              {topAccounts.slice(0, VISIBLE_ROWS).map((a, i) => (
                <div key={a.accountId} className="flex items-center gap-2.5 py-2">
                  <RankBadge
                    rank={i + 1}
                    topClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                  />
                  <div className="min-w-0 flex-1">
                    <PlayerOutstandingLink
                      gameProduct={GameProduct.Max3d}
                      drawId={drawId}
                      accountId={a.accountId}
                      username={a.username}
                      className="text-xs"
                    />
                    <p className="text-[10px] tabular-nums text-muted-foreground">{formatNumber(a.entries)} phiếu</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatNumber(a.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {topPotential.length > 0 && (
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                <TriangleAlert className="size-3.5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Top phải trả tiềm năng</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ước tính thiên cao (Σ max mỗi board) — không phải số chính xác
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4 pt-0">
            <div className="divide-y divide-border/40">
              {topPotential.slice(0, VISIBLE_ROWS).map((p, i) => (
                <div key={p.entryId} className="flex items-center gap-2.5 py-2">
                  <RankBadge rank={i + 1} topClass="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" />
                  <div className="min-w-0 flex-1">
                    <PlayerOutstandingLink
                      gameProduct={GameProduct.Max3d}
                      drawId={drawId}
                      accountId={p.accountId}
                      username={p.username}
                      className="text-xs"
                    />
                    <p className="text-[10px] tabular-nums text-muted-foreground">Cược {formatNumber(p.amount)}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-red-700 dark:text-red-300">
                    ≈ {formatNumber(p.potentialWin)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tenant panel ─────────────────────────────────────────────────────────────

export function TenantPanel({ tenants }: { tenants: TenantRow[] }) {
  if (tenants.length === 0) return null;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Đại lý</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {tenants.map((t) => (
            <div
              key={t.tenantId}
              className="grid items-center gap-x-2 rounded-lg border border-border/40 bg-muted/10 px-2.5 py-1.5"
              style={{ gridTemplateColumns: "1fr 4rem 5rem 3rem" }}
            >
              <span className="truncate text-xs font-medium">{t.tenantId}</span>
              <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                {formatNumber(t.entries)}
              </span>
              <span className="text-right text-xs font-semibold tabular-nums">{formatNumber(t.revenue)}</span>
              <span className="text-right text-[11px] tabular-nums text-muted-foreground">{t.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
