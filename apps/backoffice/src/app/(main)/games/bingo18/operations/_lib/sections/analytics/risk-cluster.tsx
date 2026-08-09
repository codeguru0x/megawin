"use client";

/**
 * Bingo 18 – Cụm rủi ro (tab Phân tích cược)
 *
 * [Top người chơi (emerald) | Top phải trả tiềm năng (đỏ nền)] — 2 cột (guideline §5;
 * Bingo 18 KHÔNG có panel "Bộ số phổ biến" dạng combo — panel SumTotalBar đứng riêng).
 * `potentialWin` là EXACT max over 216 outcome (không phải proxy).
 * Username hiển thị qua `PlayerName`/`PlayerOutstandingLink` (rule player-display-username).
 */

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { formatNumber } from "@megawin/shared/utils";
import { TrendingUp, TriangleAlert } from "lucide-react";

import { PlayerOutstandingLink } from "@/components/player-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { TopAccountRow, TopPotentialRow } from "../../types";

/** Số dòng hiển thị mặc định mỗi bảng — data top-K đầy đủ đã có trong snapshot. */
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
      {/* Top người chơi — dòng tiền vào (emerald) */}
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
                      gameProduct={GameProduct.Bingo18}
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

      {/* Top phải trả tiềm năng — rủi ro (đỏ nền) */}
      {topPotential.length > 0 && (
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                <TriangleAlert className="size-3.5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Top phải trả tiềm năng</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Worst-case per vé — chính xác trên 216 kết quả</p>
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
                      gameProduct={GameProduct.Bingo18}
                      drawId={drawId}
                      accountId={p.accountId}
                      username={p.username}
                      className="text-xs"
                    />
                    <p className="text-[10px] tabular-nums text-muted-foreground">Cược {formatNumber(p.amount)}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-red-700 dark:text-red-300">
                    Phải trả {formatNumber(p.potentialWin)}
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
