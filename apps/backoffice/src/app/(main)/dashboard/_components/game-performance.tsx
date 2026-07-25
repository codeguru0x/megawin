"use client";

import Link from "next/link";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { BarChart2, PieChart as PieChartIcon } from "lucide-react";
import type { SectorProps } from "recharts";
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts/types/polar/Pie";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGameHex } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { type DashboardDayKpis, getGameLabel } from "../_lib/compute";
import { ChartSkeleton, GameTableSkeleton } from "./skeletons";

// ─── Helpers color theo rule financial-report-ui ─────────────────────────────

function getNetProfitClass(value: number) {
  if (value < 0) return "text-red-600 dark:text-red-400";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  return "";
}

// ─── Pie Chart Tooltip ──────────────────────────────────────────────────────

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { gameProduct: string; pct: number };
  }>;
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{getGameLabel(item.payload.gameProduct)}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {formatVNDCompact(item.value)} · {item.payload.pct.toFixed(1)}%
      </p>
    </div>
  );
}

// ─── Recharts custom label trên pie slices ──────────────────────────────────

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelRenderProps) {
  if (!cx || !cy || !midAngle || !innerRadius || !outerRadius || !percent) return null;
  // Chỉ label slice >= 5% để tránh chồng chéo
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[10px] font-bold"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
    >
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

// ─── Pie slice shape — thay thế Cell (deprecated từ Recharts 4.0) ────────────

function renderPieSlice(props: SectorProps & { gameProduct?: string }) {
  return <Sector {...props} fill={getGameHex(props.gameProduct ?? "")} />;
}

// ─── Game Overview — Pie (trái) + Table (phải) ──────────────────────────────

interface GameOverviewProps {
  kpis: DashboardDayKpis | undefined;
  isLoading: boolean;
}

/**
 * Hiệu suất theo game — gộp donut chart + data table trong 1 card.
 *
 * Layout 2 cột trên xl:
 * - Trái: Donut chart phân bổ doanh thu với % label trực tiếp trên slices
 * - Phải: Table chi tiết theo thứ tự: Game · Kỳ · Tiền cược · Trả thưởng · GGR · Hoa hồng ĐL · Lợi nhuận ròng
 *
 * Dùng dữ liệu KPI đã compute — không fetch thêm.
 */
export function GameOverview({ kpis, isLoading }: GameOverviewProps) {
  if (isLoading) return <GameTableSkeleton />;
  if (!kpis || kpis.byGame.length === 0) return null;

  const chartData = kpis.byGame
    .filter((r) => r.totalStake > 0)
    .map((r) => ({
      name: getGameLabel(r.gameProduct),
      value: r.totalStake,
      gameProduct: r.gameProduct,
      pct: kpis.totalStake > 0 ? (r.totalStake / kpis.totalStake) * 100 : 0,
    }));

  // Tổng hoa hồng + trả thưởng cho hàng tổng
  const totalCommission = kpis.byGame.reduce((s, r) => s + r.totalCommission, 0);
  const totalPayout = kpis.byGame.reduce((s, r) => s + r.totalPayout, 0);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <PieChartIcon className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Hiệu suất theo game</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col xl:flex-row">
          {/* ── Pie chart — cột trái ─────────────────────────────────── */}
          <div className="flex shrink-0 flex-col items-center justify-center border-b px-4 pb-4 pt-1 xl:w-65 xl:border-b-0 xl:border-r xl:pb-4">
            <div className="relative">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    label={renderPieLabel}
                    labelLine={false}
                    shape={renderPieSlice}
                  />
                  <Tooltip content={<PieTooltip />} wrapperStyle={{ zIndex: 20 }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label — z-10 để nằm trên SVG, tooltip dùng z-20 nên sẽ đè lên được */}
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tổng DT</p>
                <p className="text-sm font-bold tabular-nums text-foreground">{formatVNDCompact(kpis.totalStake)}</p>
              </div>
            </div>
            {/* Mini legend dưới chart — text-[10px] chấp nhận vì trong vùng chart compact */}
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
              {chartData.map((item) => (
                <div key={item.gameProduct} className="flex items-center gap-1">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: getGameHex(item.gameProduct) }}
                  />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Table — cột phải ──────────────────────────────────── */}
          {/* Thứ tự cột: Game · Tiền cược · Trả thưởng · GGR · Hoa hồng ĐL · Lợi nhuận ròng */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-5 text-xs">{REPORT_COLUMN_LABELS.game}</TableHead>
                  <TableHead className="h-9 text-right text-xs">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="h-9 text-right text-xs">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="h-9 text-right text-xs">{REPORT_COLUMN_LABELS.ggr}</TableHead>
                  <TableHead className="h-9 text-right text-xs">{REPORT_COLUMN_LABELS.totalCommission}</TableHead>
                  <TableHead className="h-9 pr-5 text-right text-xs">{REPORT_COLUMN_LABELS.netProfit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.byGame.map((row) => (
                  <TableRow key={row.gameProduct} className="h-9">
                    <TableCell className="py-0 pl-5">
                      <Link
                        href={`/games/${row.gameProduct}/reports/settle`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: getGameHex(row.gameProduct) }}
                        />
                        <span className="text-xs font-medium">{getGameLabel(row.gameProduct)}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="py-0 text-right text-xs tabular-nums">
                      {formatNumber(row.totalStake)}
                    </TableCell>
                    <TableCell className="py-0 text-right text-xs tabular-nums">
                      {formatNumber(row.totalPayout)}
                    </TableCell>
                    <TableCell className="py-0 text-right text-xs tabular-nums">{formatNumber(row.ggr)}</TableCell>
                    <TableCell className="py-0 text-right text-xs tabular-nums">
                      {formatNumber(row.totalCommission)}
                    </TableCell>
                    <TableCell className="py-0 pr-5 text-right">
                      <span className={cn("text-xs tabular-nums", getNetProfitClass(row.netProfit))}>
                        {formatNumber(row.netProfit)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Hàng TỔNG CỘNG */}
                <TableRow className="h-9 border-t-2 bg-muted/30 font-semibold hover:bg-muted/40">
                  <TableCell className="py-0 pl-5 text-xs font-semibold uppercase tracking-wide">
                    {REPORT_COLUMN_LABELS.summary}
                  </TableCell>
                  <TableCell className="py-0 text-right text-xs tabular-nums">
                    {formatNumber(kpis.totalStake)}
                  </TableCell>
                  <TableCell className="py-0 text-right text-xs tabular-nums">{formatNumber(totalPayout)}</TableCell>
                  <TableCell className="py-0 text-right text-xs tabular-nums">{formatNumber(kpis.totalGgr)}</TableCell>
                  <TableCell className="py-0 text-right text-xs tabular-nums">
                    {formatNumber(totalCommission)}
                  </TableCell>
                  <TableCell className="py-0 pr-5 text-right">
                    <span className={cn("text-xs tabular-nums font-semibold", getNetProfitClass(kpis.totalProfit))}>
                      {formatNumber(kpis.totalProfit)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Payout Ratio Chart ───────────────────────────────────────────────────────

interface PayoutRatioChartProps {
  kpis: DashboardDayKpis | undefined;
  isLoading: boolean;
}

function PayoutRatioBar({ gameProduct, payoutRatio }: { gameProduct: string; payoutRatio: number }) {
  const displayPct = Math.min(payoutRatio * 100, 100);
  const isOver = payoutRatio >= 1;
  const isDanger = payoutRatio >= 0.95;
  const isWarn = payoutRatio >= 0.85;

  // Bar luôn dùng màu brand của game — không thay đổi theo mức cảnh báo
  const barColor = getGameHex(gameProduct);

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0 truncate text-xs text-muted-foreground">{getGameLabel(gameProduct)}</div>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${displayPct}%`, background: barColor }}
        />
      </div>
      {/* Chỉ text % bên phải đổi màu theo mức cảnh báo */}
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs tabular-nums font-medium",
          isOver
            ? "text-red-600 dark:text-red-400"
            : isDanger
              ? "text-orange-600 dark:text-orange-400"
              : isWarn
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-foreground",
        )}
      >
        {(payoutRatio * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/**
 * Tỷ lệ trả thưởng (payout ratio) theo game.
 *
 * Bars xếp từ trên xuống theo thứ tự từ cao nhất → thấp nhất, gap cố định (không justify-evenly).
 * Badge tổng bên header. Không có ký tự ₫ trong labels.
 * Thiết kế h-full để fit cột 1/3 cạnh card GameOverview.
 */
export function PayoutRatioChart({ kpis, isLoading }: PayoutRatioChartProps) {
  if (isLoading) return <ChartSkeleton height={220} />;
  if (!kpis || kpis.byGame.length === 0) return null;

  const rows = kpis.byGame
    .filter((r) => r.totalStake > 0)
    .map((r) => ({
      gameProduct: r.gameProduct,
      payoutRatio: r.totalPayout / r.totalStake,
    }))
    .sort((a, b) => b.payoutRatio - a.payoutRatio);

  const overallRatio = kpis.totalStake > 0 ? kpis.payoutRatio : 0;
  const isOverallDanger = overallRatio >= 0.95;

  return (
    <Card className="flex h-full flex-col gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Tỷ lệ trả thưởng</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-xs tabular-nums",
              isOverallDanger
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400",
            )}
          >
            Tổng: {(overallRatio * 100).toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between px-5 pb-4 pt-0">
        {/* Bars xếp sát nhau từ trên xuống, gap cố định — không rời rạc */}
        <div className="flex flex-col gap-2 py-2">
          {rows.map((row) => (
            <PayoutRatioBar key={row.gameProduct} gameProduct={row.gameProduct} payoutRatio={row.payoutRatio} />
          ))}
        </div>
        {/* Chú thích: bar = màu game cố định; text % thay đổi theo mức cảnh báo */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Số %:</p>
          {[
            { textClass: "text-foreground", label: "< 85%" },
            { textClass: "text-yellow-600 dark:text-yellow-400", label: "85–95%" },
            { textClass: "text-orange-600 dark:text-orange-400", label: "95–100%" },
            { textClass: "text-red-600 dark:text-red-400", label: "> 100%" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <span className={cn("text-xs tabular-nums font-medium", item.textClass)}>{item.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
