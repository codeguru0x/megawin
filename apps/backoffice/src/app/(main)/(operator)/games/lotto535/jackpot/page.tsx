"use client";

import {
  ArrowUpRight,
  CircleDollarSign,
  History,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JackpotDisplay, formatVND } from "@/components/games/lotto535/jackpot-display";
import { StatCard } from "@/components/games/lotto535/stat-card";

const JACKPOT_HISTORY = [
  { drawId: "2026-02-22-001", opening: 3_000_000_000, contribution: 200_000_000, closing: 3_200_000_000, hasWinner: false, isSplit: false },
  { drawId: "2026-02-21-002", opening: 2_800_000_000, contribution: 200_000_000, closing: 3_000_000_000, hasWinner: false, isSplit: false },
  { drawId: "2026-02-21-001", opening: 2_500_000_000, contribution: 300_000_000, closing: 2_800_000_000, hasWinner: false, isSplit: false },
  { drawId: "2026-02-20-002", opening: 2_200_000_000, contribution: 300_000_000, closing: 2_500_000_000, hasWinner: false, isSplit: false },
  { drawId: "2026-02-20-001", opening: 1_000_000_000, contribution: 1_200_000_000, closing: 2_200_000_000, hasWinner: false, isSplit: false },
];

export default function AdminJackpotPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Lotto 5/35 – Jackpot
        </h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi tích luỹ Jackpot, lịch sử chia giải và xu hướng.
        </p>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Jackpot hiện tại"
          value="3,45 tỷ"
          description="Kỳ tiếp: 2026-02-22 Kỳ 2"
          icon={Trophy}
          trend={{ value: 8.2, isPositive: true }}
        />
        <StatCard
          title="Tích luỹ liên tiếp"
          value="14 kỳ"
          description="Từ 2026-02-15"
          icon={TrendingUp}
        />
        <StatCard
          title="Ngưỡng chia"
          value="12 tỷ"
          description="Còn 8,55 tỷ nữa"
          icon={CircleDollarSign}
        />
        <StatCard
          title="Lần chia gần nhất"
          value="2026-01-28"
          description="Kỳ 2 – 4 tier có người trúng"
          icon={History}
        />
      </div>

      {/* Jackpot Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Tiến trình đến ngưỡng chia</CardTitle>
          <CardDescription>
            Jackpot sẽ được chia khi đạt 12 tỷ VND
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">3,45 tỷ / 12 tỷ</span>
              <span className="text-muted-foreground">28.75%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
                style={{ width: "28.75%" }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jackpot History */}
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử Jackpot</CardTitle>
          <CardDescription>
            Biến động Jackpot qua từng kỳ quay
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Draw ID</TableHead>
                  <TableHead className="text-right">Đầu kỳ</TableHead>
                  <TableHead className="text-right">Tích luỹ</TableHead>
                  <TableHead className="text-right">Cuối kỳ</TableHead>
                  <TableHead className="text-center">Trúng JP</TableHead>
                  <TableHead className="text-center">Chia giải</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {JACKPOT_HISTORY.map((row) => (
                  <TableRow key={row.drawId}>
                    <TableCell className="font-mono text-sm">
                      {row.drawId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatVND(row.opening)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <ArrowUpRight className="size-3" />
                        <span className="tabular-nums">
                          {formatVND(row.contribution)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <JackpotDisplay amount={row.closing} size="sm" />
                    </TableCell>
                    <TableCell className="text-center">
                      {row.hasWinner ? (
                        <Badge className="bg-green-500">Có</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.isSplit ? (
                        <Badge className="bg-amber-500">Split</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
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
