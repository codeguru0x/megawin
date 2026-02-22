"use client";

import {
  CalendarClock,
  CircleDollarSign,
  Filter,
  Ticket,
  TrendingUp,
} from "lucide-react";

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
import { KenoStatCard } from "@/components/games/keno/stat-card";
import { formatVND } from "@/components/games/keno/side-bet-badge";

const DAILY_REPORTS = [
  {
    date: "2026-02-22",
    drawCount: 55,
    totalTickets: 68_500,
    totalRevenue: 1_370_000_000,
    totalPayout: 1_028_000_000,
    profit: 342_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-21",
    drawCount: 96,
    totalTickets: 124_800,
    totalRevenue: 2_496_000_000,
    totalPayout: 1_872_000_000,
    profit: 624_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-20",
    drawCount: 96,
    totalTickets: 118_400,
    totalRevenue: 2_368_000_000,
    totalPayout: 1_776_000_000,
    profit: 592_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-19",
    drawCount: 96,
    totalTickets: 112_300,
    totalRevenue: 2_246_000_000,
    totalPayout: 1_685_000_000,
    profit: 561_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-18",
    drawCount: 96,
    totalTickets: 108_900,
    totalRevenue: 2_178_000_000,
    totalPayout: 1_634_000_000,
    profit: 544_000_000,
    payoutRate: 75.0,
  },
];

export default function KenoFinancialReportsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Keno – Thống kê tài chính
        </h1>
        <p className="text-sm text-muted-foreground">
          Báo cáo doanh thu, trả thưởng và lợi nhuận theo ngày.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KenoStatCard
          title="Doanh thu tuần"
          value="10,66 tỷ"
          description="5 ngày gần nhất"
          icon={CircleDollarSign}
          trend={{ value: 5.8, isPositive: true }}
        />
        <KenoStatCard
          title="Trả thưởng tuần"
          value="7,99 tỷ"
          description="Tỷ lệ payout: 75%"
          icon={TrendingUp}
        />
        <KenoStatCard
          title="Lợi nhuận tuần"
          value="2,66 tỷ"
          description="Margin: 25%"
          icon={CalendarClock}
          trend={{ value: 4.2, isPositive: true }}
        />
        <KenoStatCard
          title="Tổng vé tuần"
          value="532,900"
          description="TB 106.580/ngày"
          icon={Ticket}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo theo ngày</CardTitle>
          <CardDescription>
            Thống kê doanh thu và trả thưởng Keno theo từng ngày.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" defaultValue="2026-02-18" />
            <Input type="date" className="w-40" defaultValue="2026-02-22" />
            <Select defaultValue="all">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Filter className="mr-1 size-3.5" />
              Lọc
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Ngày</TableHead>
                  <TableHead className="w-20 text-right">Kỳ quay</TableHead>
                  <TableHead className="w-28 text-right">Tổng vé</TableHead>
                  <TableHead className="w-36 text-right">Doanh thu</TableHead>
                  <TableHead className="w-36 text-right">Trả thưởng</TableHead>
                  <TableHead className="w-36 text-right">Lợi nhuận</TableHead>
                  <TableHead className="w-24 text-right">Payout %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DAILY_REPORTS.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell className="font-mono">{row.date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.drawCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalTickets.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatVND(row.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.payoutRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
