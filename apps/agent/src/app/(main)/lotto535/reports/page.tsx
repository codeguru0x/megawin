"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Download,
  Percent,
  Ticket,
  TrendingUp,
  Users,
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
import { StatCard } from "@/components/games/lotto535/stat-card";

const DAILY_REPORT = [
  { date: "22/02/2026", tickets: 156, revenue: 15_600_000, payout: 2_340_000, commission: 3_120_000, players: 89 },
  { date: "21/02/2026", tickets: 134, revenue: 12_800_000, payout: 1_920_000, commission: 2_560_000, players: 72 },
  { date: "20/02/2026", tickets: 142, revenue: 14_200_000, payout: 3_550_000, commission: 2_840_000, players: 81 },
  { date: "19/02/2026", tickets: 128, revenue: 11_500_000, payout: 1_150_000, commission: 2_300_000, players: 65 },
  { date: "18/02/2026", tickets: 119, revenue: 10_700_000, payout: 2_140_000, commission: 2_140_000, players: 58 },
];

function fmtVND(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  return n.toLocaleString("vi-VN") + " ₫";
}

export default function TenantReportsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Lotto 5/35 – Báo cáo đại lý
          </h1>
          <p className="text-sm text-muted-foreground">
            Doanh thu, hoa hồng và thống kê hoạt động.
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 size-4" />
          Xuất Excel
        </Button>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Doanh thu tháng"
          value="389,2 tr"
          description="Tháng 02/2026"
          icon={CircleDollarSign}
          trend={{ value: 14.2, isPositive: true }}
        />
        <StatCard
          title="Hoa hồng tháng"
          value="77,8 tr"
          description="Tỷ lệ 20%"
          icon={Banknote}
          trend={{ value: 14.2, isPositive: true }}
        />
        <StatCard
          title="Tổng vé tháng"
          value="3,240"
          description="Trung bình 156/ngày"
          icon={Ticket}
          trend={{ value: 8.5, isPositive: true }}
        />
        <StatCard
          title="Người chơi tháng"
          value="312"
          description="89 mới trong tháng"
          icon={Users}
          trend={{ value: 5.1, isPositive: true }}
        />
      </div>

      {/* Financial Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng Payout</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">58,4 tr</span>
              <span className="flex items-center text-xs text-red-600">
                <ArrowUpRight className="size-3" /> 12.3%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Payout rate: 15%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lợi nhuận ròng</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                253 tr
              </span>
              <span className="flex items-center text-xs text-green-600">
                <ArrowUpRight className="size-3" /> 9.8%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              = Doanh thu - Payout - Hoa hồng
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win/Loss Ratio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">35%</span>
              <span className="flex items-center text-xs text-muted-foreground">
                <ArrowDownRight className="size-3" /> -2.1%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tỷ lệ payout / doanh thu
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Date filter + table */}
      <Card>
        <CardHeader>
          <CardTitle>Báo cáo theo ngày</CardTitle>
          <CardDescription>
            Chi tiết doanh thu, hoa hồng và payout mỗi ngày
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select defaultValue="thisMonth">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hôm nay</SelectItem>
                <SelectItem value="thisWeek">Tuần này</SelectItem>
                <SelectItem value="thisMonth">Tháng này</SelectItem>
                <SelectItem value="lastMonth">Tháng trước</SelectItem>
                <SelectItem value="custom">Tuỳ chọn</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" />
            <Input type="date" className="w-40" />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead className="text-right">Vé</TableHead>
                  <TableHead className="text-right">Người chơi</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DAILY_REPORT.map((row) => {
                  const profit = row.revenue - row.payout - row.commission;
                  return (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium">{row.date}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.tickets}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.players}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtVND(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                        {fmtVND(row.payout)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-blue-600 dark:text-blue-400">
                        {fmtVND(row.commission)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                        {fmtVND(profit)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
