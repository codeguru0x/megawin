"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  Filter,
  Percent,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/games/mega645/stat-card";
import { EntryStatusBadge } from "@/components/games/mega645/entry-status-badge";
import { formatVNDCompact as fmtVND, formatVND, formatNumber } from "@megawin/shared/utils/number";

// ─── Mock Data ───

const MOCK_TENANT_STATS = [
  {
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    revenue: 71_200_000,
    payout: 10_680_000,
    commission: 14_240_000,
    entries: 2850,
    players: 198,
    winRate: 15.0,
  },
  {
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    revenue: 46_800_000,
    payout: 5_616_000,
    commission: 9_360_000,
    entries: 2240,
    players: 156,
    winRate: 12.0,
  },
  {
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    revenue: 25_600_000,
    payout: 4_608_000,
    commission: 5_120_000,
    entries: 1180,
    players: 87,
    winRate: 18.0,
  },
  {
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    revenue: 14_200_000,
    payout: 1_420_000,
    commission: 2_840_000,
    entries: 640,
    players: 48,
    winRate: 10.0,
  },
];

const MOCK_PLAYERS = [
  {
    playerId: "P001",
    playerName: "Nguyễn Văn A",
    entries: 10,
    totalBet: 800_000,
    totalWin: 100_000,
    netResult: -700_000,
  },
  {
    playerId: "P002",
    playerName: "Trần Thị B",
    entries: 4,
    totalBet: 40_000,
    totalWin: 0,
    netResult: -40_000,
  },
  {
    playerId: "P003",
    playerName: "Lê Văn C",
    entries: 22,
    totalBet: 6_500_000,
    totalWin: 1_200_000,
    netResult: -5_300_000,
  },
  {
    playerId: "P004",
    playerName: "Phạm Thị D",
    entries: 3,
    totalBet: 30_000,
    totalWin: 80_000,
    netResult: 50_000,
  },
  {
    playerId: "P005",
    playerName: "Hoàng Văn E",
    entries: 6,
    totalBet: 210_000,
    totalWin: 250_000,
    netResult: 40_000,
  },
];

const MOCK_PLAYER_ENTRIES = [
  {
    entryId: "E45001",
    drawId: "2026-03-01-T7",
    drawDate: "01/03",
    schedule: "T7",
    ticketNo: "M645-20260301-00045",
    lineCount: 8,
    amount: 80_000,
    winAmount: 0,
    status: "scheduled",
    tiers: "",
  },
  {
    entryId: "E45002",
    drawId: "2026-02-27-T5",
    drawDate: "27/02",
    schedule: "T5",
    ticketNo: "M645-20260227-00112",
    lineCount: 1,
    amount: 10_000,
    winAmount: 0,
    status: "settled",
    tiers: "",
  },
  {
    entryId: "E45003",
    drawId: "2026-02-25-T3",
    drawDate: "25/02",
    schedule: "T3",
    ticketNo: "M645-20260225-00078",
    lineCount: 924,
    amount: 9_240_000,
    winAmount: 1_200_000,
    status: "settled",
    tiers: "Giải Tư ×1",
  },
  {
    entryId: "E45004",
    drawId: "2026-02-23-T7",
    drawDate: "23/02",
    schedule: "T7",
    ticketNo: "M645-20260223-00034",
    lineCount: 7,
    amount: 70_000,
    winAmount: 250_000,
    status: "settled",
    tiers: "Giải Năm ×1",
  },
];

type PlayerData = (typeof MOCK_PLAYERS)[number];

export default function Mega645FinancialReportsPage() {
  const [selectedDate] = useState("2026-03-01");
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
  const [entryDetailId, setEntryDetailId] = useState<string | null>(null);

  const selectedTenantData = MOCK_TENANT_STATS.find((t) => t.tenantId === selectedTenant);

  const totalRevenue = MOCK_TENANT_STATS.reduce((s, t) => s + t.revenue, 0);
  const totalPayout = MOCK_TENANT_STATS.reduce((s, t) => s + t.payout, 0);
  const totalCommission = MOCK_TENANT_STATS.reduce((s, t) => s + t.commission, 0);
  const totalEntries = MOCK_TENANT_STATS.reduce((s, t) => s + t.entries, 0);

  const entryDetail = MOCK_PLAYER_ENTRIES.find((e) => e.entryId === entryDetailId);
  const level = selectedPlayer ? "entries" : selectedTenant ? "players" : "tenants";

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-orange-500 to-amber-600 shadow-sm">
            <CircleDollarSign className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Mega 6/45 — Thống kê tài chính
            </h1>
            <p className="text-xs text-muted-foreground">
              Doanh thu, tiền cược, thắng thua theo ngày tài chính – từ đại lý đến chi tiết vé.
            </p>
          </div>
        </div>
        <Button variant="outline">
          <Download className="mr-2 size-4" />
          Xuất Excel
        </Button>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-sm font-medium">Ngày tài chính:</span>
          <Input type="date" className="w-40" defaultValue={selectedDate} />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input type="date" className="w-40" defaultValue={selectedDate} />
          <Select defaultValue="today">
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hôm nay</SelectItem>
              <SelectItem value="yesterday">Hôm qua</SelectItem>
              <SelectItem value="thisWeek">Tuần này</SelectItem>
              <SelectItem value="thisMonth">Tháng này</SelectItem>
              <SelectItem value="custom">Tuỳ chọn</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm">
            <Filter className="mr-1 size-3.5" />
            Áp dụng
          </Button>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng doanh thu"
          value={fmtVND(totalRevenue)}
          description={`${formatNumber(totalEntries)} entries`}
          icon={CircleDollarSign}
          trend={{ value: 10.8, isPositive: true }}
        />
        <StatCard
          title="Tổng Payout"
          value={fmtVND(totalPayout)}
          description={`Win rate: ${((totalPayout / totalRevenue) * 100).toFixed(1)}%`}
          icon={TrendingUp}
        />
        <StatCard
          title="Hoa hồng đại lý"
          value={fmtVND(totalCommission)}
          description={`${((totalCommission / totalRevenue) * 100).toFixed(1)}% doanh thu`}
          icon={Percent}
        />
        <StatCard
          title="Lợi nhuận ròng"
          value={fmtVND(totalRevenue - totalPayout - totalCommission)}
          description="DT - Payout - HH"
          icon={TrendingUp}
          trend={{ value: 7.5, isPositive: true }}
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Doanh thu vs Payout</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Doanh thu</span>
                <span className="font-medium tabular-nums">{fmtVND(totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payout</span>
                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                  {fmtVND(totalPayout)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${(totalPayout / totalRevenue) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Payout rate: {((totalPayout / totalRevenue) * 100).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hoa hồng đại lý</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {fmtVND(totalCommission)}
              </span>
              <span className="flex items-center text-xs text-blue-600">
                <ArrowUpRight className="size-3" /> 12.5%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {MOCK_TENANT_STATS.length} đại lý, tỷ lệ TB 20%
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
                {fmtVND(totalRevenue - totalPayout - totalCommission)}
              </span>
              <span className="flex items-center text-xs text-green-600">
                <ArrowUpRight className="size-3" /> 7.5%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">= Doanh thu – Payout – Hoa hồng</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation back */}
      {level !== "tenants" && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            if (selectedPlayer) setSelectedPlayer(null);
            else setSelectedTenant(null);
          }}
        >
          <ArrowLeft className="mr-1 size-4" />
          {selectedPlayer
            ? `Quay lại ${selectedTenantData?.tenantName}`
            : "Quay lại danh sách đại lý"}
        </Button>
      )}

      {/* LEVEL 1: Tenant breakdown */}
      {level === "tenants" && (
        <Card>
          <CardHeader>
            <CardTitle>Thống kê theo đại lý</CardTitle>
            <CardDescription>Chọn đại lý để xem chi tiết theo người chơi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Đại lý</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Người chơi</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                    <TableHead className="text-right">Hoa hồng</TableHead>
                    <TableHead className="text-right">Lợi nhuận</TableHead>
                    <TableHead className="text-right">Win%</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_TENANT_STATS.map((t) => {
                    const profit = t.revenue - t.payout - t.commission;
                    return (
                      <TableRow
                        key={t.tenantId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedTenant(t.tenantId)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="size-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{t.tenantName}</p>
                              <p className="text-xs text-muted-foreground">{t.tenantId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(t.entries)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.players}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtVND(t.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                          {fmtVND(t.payout)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-blue-600 dark:text-blue-400">
                          {fmtVND(t.commission)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-green-600 dark:text-green-400">
                          {fmtVND(profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={t.winRate > 15 ? "destructive" : "secondary"}>
                            {t.winRate}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <span className="font-medium">Tổng cộng</span>
              <div className="flex items-center gap-6 tabular-nums">
                <span>
                  <strong>{formatNumber(totalEntries)}</strong> entries
                </span>
                <span>
                  DT: <strong>{fmtVND(totalRevenue)}</strong>
                </span>
                <span className="text-red-600 dark:text-red-400">
                  PO: <strong>{fmtVND(totalPayout)}</strong>
                </span>
                <span className="text-green-600 dark:text-green-400">
                  LN: <strong>{fmtVND(totalRevenue - totalPayout - totalCommission)}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LEVEL 2: Players of a tenant */}
      {level === "players" && selectedTenantData && (
        <Card>
          <CardHeader>
            <CardTitle>Người chơi – {selectedTenantData.tenantName}</CardTitle>
            <CardDescription>
              Chi tiết tiền cược, thắng thua theo người chơi · Ngày: {selectedDate}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người chơi</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Tổng cược</TableHead>
                    <TableHead className="text-right">Tổng thắng</TableHead>
                    <TableHead className="text-right">Kết quả ròng</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_PLAYERS.map((p) => (
                    <TableRow
                      key={p.playerId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedPlayer(p)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{p.playerName}</p>
                          <p className="text-xs text-muted-foreground">{p.playerId}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.entries}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.totalBet)} ₫
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.totalWin > 0 ? (
                          <span className="text-green-600 dark:text-green-400">
                            {formatNumber(p.totalWin)} ₫
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0 ₫</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        <span
                          className={
                            p.netResult >= 0
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {p.netResult >= 0 ? "+" : ""}
                          {formatNumber(p.netResult)} ₫
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LEVEL 3: Entries of a player */}
      {level === "entries" && selectedPlayer && (
        <Card>
          <CardHeader>
            <CardTitle>Entries – {selectedPlayer.playerName}</CardTitle>
            <CardDescription>
              Chi tiết vé cược theo từng phiên · Ngày: {selectedDate} · Cược:{" "}
              {formatNumber(selectedPlayer.totalBet)} ₫ · Thắng:{" "}
              {formatNumber(selectedPlayer.totalWin)} ₫
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kỳ quay</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Lịch</TableHead>
                    <TableHead>Mã vé</TableHead>
                    <TableHead className="text-center">Lines</TableHead>
                    <TableHead className="text-right">Cược</TableHead>
                    <TableHead className="text-right">Thắng</TableHead>
                    <TableHead>Giải</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_PLAYER_ENTRIES.map((e) => (
                    <TableRow key={e.entryId}>
                      <TableCell className="font-mono text-sm">{e.drawId}</TableCell>
                      <TableCell>{e.drawDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.schedule}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{e.ticketNo}</TableCell>
                      <TableCell className="text-center tabular-nums">{e.lineCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(e.amount)} ₫
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.status === "settled" && e.winAmount > 0 ? (
                          <span className="font-medium text-green-600 dark:text-green-400">
                            {formatNumber(e.winAmount)} ₫
                          </span>
                        ) : e.status === "settled" ? (
                          <span className="text-muted-foreground">0 ₫</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.tiers ? (
                          <Badge variant="secondary">{e.tiers}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <EntryStatusBadge status={e.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEntryDetailId(e.entryId)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <span className="font-medium">Tổng</span>
              <div className="flex items-center gap-6 tabular-nums">
                <span>
                  Cược: <strong>{formatNumber(selectedPlayer.totalBet)} ₫</strong>
                </span>
                <span className="text-green-600 dark:text-green-400">
                  Thắng: <strong>{formatNumber(selectedPlayer.totalWin)} ₫</strong>
                </span>
                <span
                  className={
                    selectedPlayer.netResult >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  Ròng:{" "}
                  <strong>
                    {selectedPlayer.netResult >= 0 ? "+" : ""}
                    {formatNumber(selectedPlayer.netResult)} ₫
                  </strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={!!entryDetailId} onOpenChange={(open) => !open && setEntryDetailId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chi tiết Entry</DialogTitle>
            <DialogDescription>
              {entryDetail?.entryId} · {entryDetail?.ticketNo}
            </DialogDescription>
          </DialogHeader>
          {entryDetail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Kỳ quay", val: entryDetail.drawId },
                  { label: "Lines", val: String(entryDetail.lineCount) },
                  { label: "Tiền cược", val: formatVND(entryDetail.amount) },
                  {
                    label: "Tiền thắng",
                    val: entryDetail.winAmount > 0 ? formatVND(entryDetail.winAmount) : "0 ₫",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-bold tabular-nums">{item.val}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Trạng thái</span>
                <EntryStatusBadge status={entryDetail.status} />
              </div>
              {entryDetail.tiers && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm text-muted-foreground">Giải trúng</span>
                  <Badge variant="secondary">{entryDetail.tiers}</Badge>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
