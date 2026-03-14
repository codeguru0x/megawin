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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/games/max3dpro/stat-card";
import { DrawStatusBadge } from "@/components/games/max3dpro/draw-status-badge";
import { EntryStatusBadge } from "@/components/games/max3dpro/entry-status-badge";
import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";
import { MAX3DPRO_PLAY_MODE_LABELS } from "@megawin/game-max3dpro/labels";

const PENDING_DRAW = {
  drawId: "2026-02-22-001",
  drawDate: "2026-02-22",
  drawNo: 1,
  drawTime: "18:00",
  status: "salesOpen",
  salesCloseAt: "2026-02-22 17:30",
};

const MOCK_TENANT_SUMMARY = [
  { tenantId: "T001", tenantName: "Đại lý Sài Gòn", entryCount: 4150, totalLines: 12_600, totalAmount: 126_000_000, playerCount: 312, avgAmountPerPlayer: 403_846 },
  { tenantId: "T002", tenantName: "Đại lý Hà Nội", entryCount: 3280, totalLines: 8_450, totalAmount: 84_500_000, playerCount: 231, avgAmountPerPlayer: 365_800 },
  { tenantId: "T003", tenantName: "Đại lý Đà Nẵng", entryCount: 1820, totalLines: 4_560, totalAmount: 45_600_000, playerCount: 128, avgAmountPerPlayer: 356_250 },
  { tenantId: "T004", tenantName: "Đại lý Cần Thơ", entryCount: 950, totalLines: 2_370, totalAmount: 23_700_000, playerCount: 72, avgAmountPerPlayer: 329_167 },
];

const MOCK_TENANT_ENTRIES = [
  { entryId: "E50001", ticketNo: "M3DP-20260222-00045", playerId: "P001", playerName: "Nguyễn Văn A", boards: [{ boardNo: "A", playType: "multiNumber", triplets: ["123", "456"], expandedLines: 2 }, { boardNo: "B", playType: "pair", triplets: ["112", "334"], expandedLines: 6 }], lineCount: 8, amount: 160_000, status: "scheduled", drawCount: 2, currentDraw: 1 },
  { entryId: "E50002", ticketNo: "M3DP-20260222-00046", playerId: "P002", playerName: "Trần Thị B", boards: [{ boardNo: "A", playType: "pair", triplets: ["789"], expandedLines: 1 }], lineCount: 1, amount: 10_000, status: "scheduled", drawCount: 1, currentDraw: 1 },
  { entryId: "E50003", ticketNo: "M3DP-20260222-00047", playerId: "P003", playerName: "Lê Văn C", boards: [{ boardNo: "A", playType: "multiNumber", triplets: ["123", "456", "789"], expandedLines: 18 }, { boardNo: "B", playType: "pair", triplets: ["001", "999", "555"], expandedLines: 3 }], lineCount: 21, amount: 210_000, status: "active", drawCount: 4, currentDraw: 2 },
  { entryId: "E50004", ticketNo: "M3DP-20260222-00048", playerId: "P004", playerName: "Phạm Thị D", boards: [{ boardNo: "A", playType: "pair", triplets: ["246", "135"], expandedLines: 2 }], lineCount: 2, amount: 20_000, status: "scheduled", drawCount: 6, currentDraw: 3 },
  { entryId: "E50005", ticketNo: "M3DP-20260222-00049", playerId: "P005", playerName: "Hoàng Văn E", boards: [{ boardNo: "A", playType: "multiNumber", triplets: ["223", "445", "667", "889"], expandedLines: 12 }, { boardNo: "B", playType: "pair", triplets: ["000", "111", "222"], expandedLines: 3 }], lineCount: 15, amount: 150_000, status: "scheduled", drawCount: 1, currentDraw: 1 },
];

const PLAY_TYPE_LABELS: Record<string, string> = {
  ...MAX3DPRO_PLAY_MODE_LABELS,
  pair: "Cặp số",
};

function fmtVND(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  return n.toLocaleString("vi-VN") + " ₫";
}

type SelectedEntry = (typeof MOCK_TENANT_ENTRIES)[number];

export default function PendingTicketsPage() {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [entryDetail, setEntryDetail] = useState<SelectedEntry | null>(null);

  const selectedTenantData = MOCK_TENANT_SUMMARY.find((t) => t.tenantId === selectedTenant);

  const totalEntries = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.entryCount, 0);
  const totalAmount = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.totalAmount, 0);
  const totalLines = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.totalLines, 0);
  const totalPlayers = MOCK_TENANT_SUMMARY.reduce((s, t) => s + t.playerCount, 0);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-600 shadow-sm">
          <Clock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Max 3D Pro — Vé chờ quay
          </h1>
          <p className="text-xs text-muted-foreground">
            Thống kê vé tham gia phiên đang chờ quay kết quả, phân bổ theo agent/tenant.
          </p>
        </div>
      </div>

      <Card className="bg-linear-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/50">
              <CalendarClock className="size-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Kỳ quay sắp tới</p>
              <p className="text-lg font-bold">{PENDING_DRAW.drawDate} – Kỳ {PENDING_DRAW.drawNo} ({PENDING_DRAW.drawTime})</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <DrawStatusBadge status={PENDING_DRAW.status} />
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" />
              <span>Đóng bán: {PENDING_DRAW.salesCloseAt}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng vé tham gia" value={totalEntries.toLocaleString("vi-VN")} description={`${totalLines.toLocaleString("vi-VN")} lines`} icon={Ticket} />
        <StatCard title="Tổng tiền cược" value={fmtVND(totalAmount)} description="Phiên sắp quay" icon={CircleDollarSign} />
        <StatCard title="Đại lý tham gia" value={String(MOCK_TENANT_SUMMARY.length)} description={`${totalPlayers} người chơi`} icon={Building2} />
        <StatCard title="Người chơi" value={totalPlayers.toLocaleString("vi-VN")} description="Đang chờ kết quả" icon={Users} />
      </div>

      <div className="flex items-center gap-2">
        <Select defaultValue={PENDING_DRAW.drawId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Chọn kỳ quay" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2026-02-22-001">2026-02-22 Kỳ 1 (18:00) – Đang bán</SelectItem>
            <SelectItem value="2026-02-23-001">2026-02-23 Kỳ 1 (18:00) – Đã lên lịch</SelectItem>
            <SelectItem value="2026-02-24-001">2026-02-24 Kỳ 1 (18:00) – Đã lên lịch</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                      <TableRow key={t.tenantId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTenant(t.tenantId)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="size-4 text-muted-foreground" />
                            <div><p className="font-medium">{t.tenantName}</p><p className="text-xs text-muted-foreground">{t.tenantId}</p></div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{t.entryCount.toLocaleString("vi-VN")}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.totalLines.toLocaleString("vi-VN")}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtVND(t.totalAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.playerCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtVND(t.avgAmountPerPlayer)}</TableCell>
                        <TableCell className="text-right"><Badge variant="secondary">{pct}%</Badge></TableCell>
                        <TableCell><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium">Tổng cộng</span>
              <div className="flex items-center gap-6 text-sm tabular-nums">
                <span><strong>{totalEntries.toLocaleString("vi-VN")}</strong> vé</span>
                <span><strong>{totalLines.toLocaleString("vi-VN")}</strong> lines</span>
                <span><strong>{fmtVND(totalAmount)}</strong></span>
                <span><strong>{totalPlayers}</strong> người chơi</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedTenant && selectedTenantData && (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedTenant(null)}>
              <ArrowLeft className="mr-1 size-4" />Quay lại
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedTenantData.tenantName} – {selectedTenantData.entryCount.toLocaleString("vi-VN")} vé – {fmtVND(selectedTenantData.totalAmount)}
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết vé – {selectedTenantData.tenantName}</CardTitle>
              <CardDescription>Danh sách entries chờ quay thưởng kỳ {PENDING_DRAW.drawId}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input placeholder="Mã vé hoặc người chơi..." className="pl-8" />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-36"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="scheduled">Chờ quay</SelectItem>
                    <SelectItem value="active">Đã khoá</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="all">
                  <SelectTrigger className="w-36"><SelectValue placeholder="Kiểu chơi" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="multiNumber">Bao số</SelectItem>
                    <SelectItem value="multiDigit">Bao chữ số</SelectItem>
                    <SelectItem value="pair">Cặp số</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm"><Filter className="mr-1 size-3.5" />Lọc</Button>
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
                        <TableCell className="text-center tabular-nums">{entry.lineCount}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{entry.amount.toLocaleString("vi-VN")} ₫</TableCell>
                        <TableCell className="text-center"><Badge variant="outline">{entry.currentDraw}/{entry.drawCount}</Badge></TableCell>
                        <TableCell><EntryStatusBadge status={entry.status} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setEntryDetail(entry)}>
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

      <Dialog open={!!entryDetail} onOpenChange={(open) => !open && setEntryDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết vé – {entryDetail?.ticketNo}</DialogTitle>
            <DialogDescription>Người chơi: {entryDetail?.playerName} · Entry: {entryDetail?.entryId}</DialogDescription>
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
                  <p className="text-lg font-bold tabular-nums">{entryDetail.amount.toLocaleString("vi-VN")} ₫</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Kỳ</p>
                  <p className="text-lg font-bold tabular-nums">{entryDetail.currentDraw}/{entryDetail.drawCount}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Boards</h4>
                {entryDetail.boards.map((board) => (
                  <div key={board.boardNo} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">{board.boardNo}</Badge>
                        <Badge variant="secondary">{PLAY_TYPE_LABELS[board.playType] ?? board.playType}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{board.expandedLines} line(s)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {board.triplets.map((triplet, idx) => (
                        <TripletDisplay key={idx} value={triplet} size="sm" />
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
