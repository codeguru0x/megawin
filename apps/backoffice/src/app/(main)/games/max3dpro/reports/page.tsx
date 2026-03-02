"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChartBar,
  CircleDollarSign,
  Filter,
  TrendingUp,
  Ticket,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/games/max3dpro/stat-card";
import { DrawStatusBadge } from "@/components/games/max3dpro/draw-status-badge";

function fmtVND(n: number) {
  if (n >= 1_000_000_000)
    return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  if (n >= 1_000_000)
    return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  return n.toLocaleString("vi-VN") + " ₫";
}

const MOCK_DRAWS = [
  { drawId: "2026-02-22-001", drawDate: "2026-02-22", drawNo: 1, drawTime: "18:00", status: "settled", entries: 8_320, revenue: 272_000_000, payout: 45_560_000, commission: 54_400_000, profit: 172_040_000 },
  { drawId: "2026-02-21-001", drawDate: "2026-02-21", drawNo: 1, drawTime: "18:00", status: "settled", entries: 7_890, revenue: 248_500_000, payout: 39_760_000, commission: 49_700_000, profit: 159_040_000 },
  { drawId: "2026-02-20-001", drawDate: "2026-02-20", drawNo: 1, drawTime: "18:00", status: "settled", entries: 6_540, revenue: 198_200_000, payout: 55_496_000, commission: 39_640_000, profit: 103_064_000 },
  { drawId: "2026-02-19-001", drawDate: "2026-02-19", drawNo: 1, drawTime: "18:00", status: "settled", entries: 7_120, revenue: 225_800_000, payout: 33_870_000, commission: 45_160_000, profit: 146_770_000 },
  { drawId: "2026-02-18-001", drawDate: "2026-02-18", drawNo: 1, drawTime: "18:00", status: "settled", entries: 5_980, revenue: 178_400_000, payout: 28_544_000, commission: 35_680_000, profit: 114_176_000 },
  { drawId: "2026-02-23-001", drawDate: "2026-02-23", drawNo: 1, drawTime: "18:00", status: "salesOpen", entries: 3_450, revenue: 105_600_000, payout: 0, commission: 0, profit: 0 },
];

export default function ReportsPage() {
  const [dateFrom] = useState("2026-02-18");
  const [dateTo] = useState("2026-02-23");

  const settledDraws = MOCK_DRAWS.filter((d) => d.status === "settled");
  const totalRevenue = settledDraws.reduce((s, d) => s + d.revenue, 0);
  const totalPayout = settledDraws.reduce((s, d) => s + d.payout, 0);
  const totalCommission = settledDraws.reduce((s, d) => s + d.commission, 0);
  const totalProfit = settledDraws.reduce((s, d) => s + d.profit, 0);
  const totalEntries = settledDraws.reduce((s, d) => s + d.entries, 0);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-600 shadow-sm">
          <ChartBar className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Max 3D Pro — Báo cáo
          </h1>
          <p className="text-xs text-muted-foreground">
            Tổng hợp doanh thu, payout, hoa hồng và lợi nhuận theo từng kỳ quay.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-sm font-medium">Từ ngày:</span>
          <Input type="date" className="w-40" defaultValue={dateFrom} />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input type="date" className="w-40" defaultValue={dateTo} />
          <Select defaultValue="thisWeek">
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hôm nay</SelectItem>
              <SelectItem value="yesterday">Hôm qua</SelectItem>
              <SelectItem value="thisWeek">Tuần này</SelectItem>
              <SelectItem value="thisMonth">Tháng này</SelectItem>
              <SelectItem value="custom">Tuỳ chọn</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm"><Filter className="mr-1 size-3.5" />Áp dụng</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng doanh thu" value={fmtVND(totalRevenue)} description={`${settledDraws.length} kỳ đã settle`} icon={CircleDollarSign} trend={{ value: 12.3, isPositive: true }} />
        <StatCard title="Tổng Payout" value={fmtVND(totalPayout)} description={`Rate: ${((totalPayout / totalRevenue) * 100).toFixed(1)}%`} icon={TrendingUp} />
        <StatCard title="Tổng entries" value={totalEntries.toLocaleString("vi-VN")} description={`TB ${Math.round(totalEntries / settledDraws.length).toLocaleString("vi-VN")}/kỳ`} icon={Ticket} />
        <StatCard title="Lợi nhuận ròng" value={fmtVND(totalProfit)} description="DT - Payout - HH" icon={TrendingUp} trend={{ value: 8.7, isPositive: true }} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Payout Rate</CardDescription></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{((totalPayout / totalRevenue) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(totalPayout / totalRevenue) * 100}%` }} /></div>
              <p className="text-xs text-muted-foreground">{fmtVND(totalPayout)} / {fmtVND(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Hoa hồng đại lý</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{fmtVND(totalCommission)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{((totalCommission / totalRevenue) * 100).toFixed(1)}% doanh thu</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Lợi nhuận ròng</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{fmtVND(totalProfit)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">= Doanh thu – Payout – Hoa hồng</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chi tiết theo kỳ quay</CardTitle>
          <CardDescription>{MOCK_DRAWS.length} kỳ quay trong khoảng thời gian đã chọn</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kỳ quay</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Giờ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_DRAWS.map((draw) => (
                  <TableRow key={draw.drawId}>
                    <TableCell className="font-mono text-sm">{draw.drawId}</TableCell>
                    <TableCell>{draw.drawDate}</TableCell>
                    <TableCell>{draw.drawTime}</TableCell>
                    <TableCell><DrawStatusBadge status={draw.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{draw.entries.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtVND(draw.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">{draw.status === "settled" ? fmtVND(draw.payout) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-orange-600 dark:text-orange-400">{draw.status === "settled" ? fmtVND(draw.commission) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">{draw.status === "settled" ? fmtVND(draw.profit) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <span className="font-medium">Tổng cộng (đã settle)</span>
            <div className="flex items-center gap-6 tabular-nums">
              <span><strong>{totalEntries.toLocaleString("vi-VN")}</strong> entries</span>
              <span>DT: <strong>{fmtVND(totalRevenue)}</strong></span>
              <span className="text-red-600 dark:text-red-400">PO: <strong>{fmtVND(totalPayout)}</strong></span>
              <span className="text-orange-600 dark:text-orange-400">HH: <strong>{fmtVND(totalCommission)}</strong></span>
              <span className="text-green-600 dark:text-green-400">LN: <strong>{fmtVND(totalProfit)}</strong></span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
