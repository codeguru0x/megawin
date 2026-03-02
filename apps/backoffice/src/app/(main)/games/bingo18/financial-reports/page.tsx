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
import { Bingo18StatCard } from "@/components/games/bingo18/stat-card";
import { formatVNDCompact as formatVND } from "@megawin/shared/utils/number";

const DAILY_REPORTS = [
  {
    date: "2026-02-22",
    drawCount: 150,
    totalTickets: 45_200,
    totalRevenue: 904_000_000,
    totalPayout: 678_000_000,
    profit: 226_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-21",
    drawCount: 240,
    totalTickets: 82_400,
    totalRevenue: 1_648_000_000,
    totalPayout: 1_236_000_000,
    profit: 412_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-20",
    drawCount: 240,
    totalTickets: 78_600,
    totalRevenue: 1_572_000_000,
    totalPayout: 1_179_000_000,
    profit: 393_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-19",
    drawCount: 240,
    totalTickets: 74_100,
    totalRevenue: 1_482_000_000,
    totalPayout: 1_112_000_000,
    profit: 370_000_000,
    payoutRate: 75.0,
  },
  {
    date: "2026-02-18",
    drawCount: 240,
    totalTickets: 71_800,
    totalRevenue: 1_436_000_000,
    totalPayout: 1_077_000_000,
    profit: 359_000_000,
    payoutRate: 75.0,
  },
];

export default function Bingo18FinancialReportsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-orange-600 shadow-sm">
          <CircleDollarSign className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Bingo 18 — Thống kê tài chính
          </h1>
          <p className="text-xs text-muted-foreground">
            Báo cáo doanh thu, trả thưởng và lợi nhuận theo ngày.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Bingo18StatCard
          title="Doanh thu tuần"
          value="7,04 tỷ"
          description="5 ngày gần nhất"
          icon={CircleDollarSign}
          trend={{ value: 6.2, isPositive: true }}
        />
        <Bingo18StatCard
          title="Trả thưởng tuần"
          value="5,28 tỷ"
          description="Tỷ lệ payout: 75%"
          icon={TrendingUp}
        />
        <Bingo18StatCard
          title="Lợi nhuận tuần"
          value="1,76 tỷ"
          description="Margin: 25%"
          icon={CalendarClock}
          trend={{ value: 3.8, isPositive: true }}
        />
        <Bingo18StatCard
          title="Tổng vé tuần"
          value="352,100"
          description="TB 70.420/ngày · 240 kỳ/ngày"
          icon={Ticket}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo theo ngày</CardTitle>
          <CardDescription>
            Thống kê doanh thu và trả thưởng Bingo 18 theo từng ngày.
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
