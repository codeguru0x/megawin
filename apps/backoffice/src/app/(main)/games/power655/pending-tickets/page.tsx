"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Eye,
  Filter,
  Search,
  Ticket,
  Users,
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
import { StatCard } from "@/components/games/power655/stat-card";
import { Power655DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import { Power655EntryStatusBadge } from "@/components/games/power655/entry-status-badge";
import { PowerNumberBall } from "@/components/games/power655/power-number-ball";
import { DualJackpotDisplay } from "@/components/games/power655/jackpot-display";
import { POWER655_PLAY_TYPE_LABELS } from "@megawin/game-power655/labels";
import { formatVNDCompact as fmtVND, formatVND, formatNumber } from "@megawin/shared/utils/number";

const PENDING_DRAW = {
  drawId: "2026-02-24-T3",
  drawDate: "2026-02-24",
  drawNo: 1,
  drawTime: "18:00",
  schedule: "T3",
  status: "salesOpen",
  salesCloseAt: "2026-02-24 17:30",
  jp1Amount: 45_200_000_000,
  jp2Amount: 3_800_000_000,
};

const MOCK_TENANT_SUMMARY = [
  {
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    entryCount: 2180,
    totalLines: 6420,
    totalAmount: 128_400_000,
    playerCount: 178,
    avgAmountPerPlayer: 721_348,
  },
  {
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    entryCount: 1720,
    totalLines: 4350,
    totalAmount: 87_000_000,
    playerCount: 134,
    avgAmountPerPlayer: 649_254,
  },
  {
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    entryCount: 890,
    totalLines: 2100,
    totalAmount: 42_000_000,
    playerCount: 72,
    avgAmountPerPlayer: 583_333,
  },
  {
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    entryCount: 510,
    totalLines: 1230,
    totalAmount: 24_600_000,
    playerCount: 41,
    avgAmountPerPlayer: 600_000,
  },
];

const MOCK_TENANT_ENTRIES = [
  {
    entryId: "E60001",
    ticketNo: "P655-20260224-00045",
    playerId: "P001",
    playerName: "Nguyễn Văn A",
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        mainNumbers: [3, 12, 17, 24, 31, 45],
        bonusNumber: null,
        expandedLines: 1,
      },
      {
        boardNo: "B",
        playType: "bao8",
        mainNumbers: [1, 5, 9, 14, 22, 28, 33, 40],
        bonusNumber: null,
        expandedLines: 28,
      },
    ],
    lineCount: 29,
    amount: 290_000,
    status: "scheduled",
    drawCount: 2,
    currentDraw: 1,
  },
  {
    entryId: "E60002",
    ticketNo: "P655-20260224-00046",
    playerId: "P002",
    playerName: "Trần Thị B",
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        mainNumbers: [5, 10, 15, 20, 25, 30],
        bonusNumber: null,
        expandedLines: 1,
      },
    ],
    lineCount: 1,
    amount: 10_000,
    status: "scheduled",
    drawCount: 1,
    currentDraw: 1,
  },
  {
    entryId: "E60003",
    ticketNo: "P655-20260224-00047",
    playerId: "P003",
    playerName: "Lê Văn C",
    boards: [
      {
        boardNo: "A",
        playType: "bao12",
        mainNumbers: [2, 8, 16, 23, 35, 41, 7, 19, 28, 33, 44, 50],
        bonusNumber: null,
        expandedLines: 924,
      },
    ],
    lineCount: 924,
    amount: 9_240_000,
    status: "active",
    drawCount: 3,
    currentDraw: 2,
  },
  {
    entryId: "E60004",
    ticketNo: "P655-20260224-00048",
    playerId: "P004",
    playerName: "Phạm Thị D",
    boards: [
      {
        boardNo: "A",
        playType: "quickPick",
        mainNumbers: [1, 9, 18, 26, 34, 49],
        bonusNumber: null,
        expandedLines: 1,
      },
    ],
    lineCount: 1,
    amount: 10_000,
    status: "scheduled",
    drawCount: 5,
    currentDraw: 3,
  },
  {
    entryId: "E60005",
    ticketNo: "P655-20260224-00049",
    playerId: "P005",
    playerName: "Hoàng Văn E",
    boards: [
      {
        boardNo: "A",
        playType: "bao7",
        mainNumbers: [2, 6, 13, 19, 24, 30, 55],
        bonusNumber: null,
        expandedLines: 7,
      },
    ],
    lineCount: 7,
    amount: 70_000,
    status: "scheduled",
    drawCount: 1,
    currentDraw: 1,
  },
];

type SelectedEntry = (typeof MOCK_TENANT_ENTRIES)[number];

export default function Power655PendingTicketsPage() {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [entryDetail, setEntryDetail] = useState<SelectedEntry | null>(null);

  const selectedTenantData = MOCK_TENANT_SUMMARY.find((t) => t.tenantId === selectedTenant);

  const totalEntries = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.entryCount, 0);
  const totalAmount = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.totalAmount, 0);
  const totalLines = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.totalLines, 0);
  const totalPlayers = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.playerCount, 0);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-sm">
          <Clock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Power 6/55 — Vé chờ quay
          </h1>
          <p className="text-xs text-muted-foreground">
            Thống kê vé tham gia phiên đang chờ quay kết quả, phân bổ theo agent/tenant.
          </p>
        </div>
      </div>

      {/* Current Draw Info Banner */}
      <Card className="bg-linear-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/50">
              <CalendarClock className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Kỳ quay sắp tới</p>
              <p className="text-lg font-bold">
                {PENDING_DRAW.drawDate} – {PENDING_DRAW.schedule} ({PENDING_DRAW.drawTime})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <DualJackpotDisplay
              jp1Amount={PENDING_DRAW.jp1Amount}
              jp2Amount={PENDING_DRAW.jp2Amount}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <Power655DrawStatusBadge status={PENDING_DRAW.status} />
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" />
              <span>Đóng bán: {PENDING_DRAW.salesCloseAt}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng vé tham gia"
          value={formatNumber(totalEntries)}
          description={`${formatNumber(totalLines)} lines`}
          icon={Ticket}
        />
        <StatCard
          title="Tổng tiền cược"
          value={fmtVND(totalAmount)}
          description="Phiên sắp quay"
          icon={CircleDollarSign}
        />
        <StatCard
          title="Đại lý tham gia"
          value={String(MOCK_TENANT_SUMMARY.length)}
          description={`${totalPlayers} người chơi`}
          icon={Building2}
        />
        <StatCard
          title="Người chơi"
          value={formatNumber(totalPlayers)}
          description="Đang chờ kết quả"
          icon={Users}
        />
      </div>

      {/* Select Draw */}
      <div className="flex items-center gap-2">
        <Select defaultValue={PENDING_DRAW.drawId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Chọn kỳ quay" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2026-02-24-T3">2026-02-24 T3 (18:00) – Đang bán</SelectItem>
            <SelectItem value="2026-02-26-T5">2026-02-26 T5 (18:00) – Đã lên lịch</SelectItem>
            <SelectItem value="2026-02-28-T7">2026-02-28 T7 (18:00) – Đã lên lịch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── LEVEL 1: Tenant Summary ─── */}
      {!selectedTenant && (
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ theo đại lý</CardTitle>
            <CardDescription>Chọn đại lý để xem chi tiết từng vé tham gia kỳ quay</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Đại lý</TableHead>
                    <TableHead className="text-right">Vé (entries)</TableHead>
                    <TableHead className="text-right">Tổng lines</TableHead>
                    <TableHead className="text-right">Tiền cược</TableHead>
                    <TableHead className="text-right">Người chơi</TableHead>
                    <TableHead className="text-right">TB/người</TableHead>
                    <TableHead className="text-right">Tỷ lệ</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_TENANT_SUMMARY.map((t) => {
                    const pct = ((t.totalAmount / totalAmount) * 100).toFixed(1);
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
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatNumber(t.entryCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(t.totalLines)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtVND(t.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.playerCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtVND(t.avgAmountPerPlayer)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{pct}%</Badge>
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

            {/* Totals Row */}
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium">Tổng cộng</span>
              <div className="flex items-center gap-6 text-sm tabular-nums">
                <span>
                  <strong>{formatNumber(totalEntries)}</strong> vé
                </span>
                <span>
                  <strong>{formatNumber(totalLines)}</strong> lines
                </span>
                <span>
                  <strong>{fmtVND(totalAmount)}</strong>
                </span>
                <span>
                  <strong>{totalPlayers}</strong> người chơi
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── LEVEL 2: Tenant Entry Detail ─── */}
      {selectedTenant && selectedTenantData && (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTenant(null)}>
              <ArrowLeft className="mr-1 size-4" />
              Quay lại
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedTenantData.tenantName} – {formatNumber(selectedTenantData.entryCount)} vé –{" "}
              {fmtVND(selectedTenantData.totalAmount)}
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết vé – {selectedTenantData.tenantName}</CardTitle>
              <CardDescription>
                Danh sách entries chờ quay thưởng kỳ {PENDING_DRAW.drawId}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input placeholder="Mã vé hoặc người chơi..." className="pl-8" />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="scheduled">Chờ quay</SelectItem>
                    <SelectItem value="active">Đã khoá</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="all">
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Kiểu chơi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="standard">Thường</SelectItem>
                    <SelectItem value="bao7">Bao 7</SelectItem>
                    <SelectItem value="bao8">Bao 8</SelectItem>
                    <SelectItem value="bao12">Bao 12-18</SelectItem>
                    <SelectItem value="quickPick">Tự chọn</SelectItem>
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
                      <TableHead>Mã vé</TableHead>
                      <TableHead>Người chơi</TableHead>
                      <TableHead className="text-center">Boards</TableHead>
                      <TableHead className="text-center">Lines</TableHead>
                      <TableHead className="text-right">Tiền cược</TableHead>
                      <TableHead className="text-center">Kỳ</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_TENANT_ENTRIES.map((entry) => (
                      <TableRow key={entry.entryId}>
                        <TableCell className="font-mono text-sm">{entry.ticketNo}</TableCell>
                        <TableCell>{entry.playerName}</TableCell>
                        <TableCell className="text-center">{entry.boards.length}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {entry.lineCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatNumber(entry.amount)} ₫
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {entry.currentDraw}/{entry.drawCount}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Power655EntryStatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEntryDetail(entry)}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Entry Detail Dialog ─── */}
      <Dialog open={!!entryDetail} onOpenChange={(open) => !open && setEntryDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết vé – {entryDetail?.ticketNo}</DialogTitle>
            <DialogDescription>
              Người chơi: {entryDetail?.playerName} · Entry: {entryDetail?.entryId}
            </DialogDescription>
          </DialogHeader>
          {entryDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Lines</p>
                  <p className="text-lg font-bold tabular-nums">{entryDetail.lineCount}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Tiền cược</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatNumber(entryDetail.amount)} ₫
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Kỳ</p>
                  <p className="text-lg font-bold tabular-nums">
                    {entryDetail.currentDraw}/{entryDetail.drawCount}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Boards</h4>
                {entryDetail.boards.map((board) => (
                  <div key={board.boardNo} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {board.boardNo}
                        </Badge>
                        <Badge variant="secondary">
                          {POWER655_PLAY_TYPE_LABELS[board.playType as keyof typeof POWER655_PLAY_TYPE_LABELS] ?? board.playType}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {board.expandedLines} line(s)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {board.mainNumbers.map((n, idx) => (
                        <PowerNumberBall key={`${n}-${idx}`} number={n} variant="main" size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
