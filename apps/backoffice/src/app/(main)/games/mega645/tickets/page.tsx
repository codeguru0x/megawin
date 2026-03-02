"use client";

import { useState } from "react";
import {
  Building2,
  CircleDollarSign,
  Eye,
  Filter,
  Layers,
  Search,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/games/mega645/stat-card";
import { TicketStatusBadge } from "@/components/games/mega645/ticket-status-badge";
import { EntryStatusBadge } from "@/components/games/mega645/entry-status-badge";
import { MegaNumberBall } from "@/components/games/mega645/mega-number-ball";

const PLAY_TYPE_LABELS: Record<string, string> = {
  standard: "Thường",
  bao7: "Bao 7",
  bao8: "Bao 8",
  bao9: "Bao 9",
  bao10: "Bao 10",
  bao11: "Bao 11",
  bao12: "Bao 12",
  bao13: "Bao 13",
  bao14: "Bao 14",
  bao15: "Bao 15",
  bao18: "Bao 18",
  quickPick: "Tự chọn",
};

function fmtVND(n: number) {
  if (n >= 1_000_000_000)
    return (
      (n / 1_000_000_000).toLocaleString("vi-VN", {
        maximumFractionDigits: 2,
      }) + " tỷ"
    );
  if (n >= 1_000_000)
    return (
      (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) +
      " tr"
    );
  return n.toLocaleString("vi-VN") + " ₫";
}

// ─── Mock Data ───

const MOCK_TICKETS = [
  {
    ticketNo: "M645-20260301-00045",
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    playerId: "P001",
    playerName: "Nguyễn Văn A",
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        numbers: [3, 12, 17, 24, 31, 45],
        expandedLines: 1,
      },
      {
        boardNo: "B",
        playType: "bao8",
        numbers: [1, 5, 9, 14, 22, 28, 33, 40],
        expandedLines: 28,
      },
    ],
    drawCount: 3,
    linesPerDraw: 29,
    amountPerDraw: 290_000,
    totalAmount: 870_000,
    status: "paid",
    createdAt: "2026-03-01 08:30",
    entries: [
      { drawId: "2026-03-01-T7", drawDate: "01/03", schedule: "T7", status: "scheduled", amount: 290_000, winAmount: 0 },
      { drawId: "2026-03-04-T3", drawDate: "04/03", schedule: "T3", status: "scheduled", amount: 290_000, winAmount: 0 },
      { drawId: "2026-03-06-T5", drawDate: "06/03", schedule: "T5", status: "scheduled", amount: 290_000, winAmount: 0 },
    ],
    progress: { total: 3, settled: 0, remaining: 3 },
  },
  {
    ticketNo: "M645-20260227-00112",
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    playerId: "P002",
    playerName: "Trần Thị B",
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        numbers: [5, 10, 15, 20, 25, 30],
        expandedLines: 1,
      },
    ],
    drawCount: 1,
    linesPerDraw: 1,
    amountPerDraw: 10_000,
    totalAmount: 10_000,
    status: "completed",
    createdAt: "2026-02-27 14:15",
    entries: [
      { drawId: "2026-02-27-T5", drawDate: "27/02", schedule: "T5", status: "settled", amount: 10_000, winAmount: 0 },
    ],
    progress: { total: 1, settled: 1, remaining: 0 },
  },
  {
    ticketNo: "M645-20260225-00078",
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    playerId: "P003",
    playerName: "Lê Văn C",
    boards: [
      {
        boardNo: "A",
        playType: "bao12",
        numbers: [2, 8, 16, 23, 35, 41, 7, 19, 28, 33, 44, 45],
        expandedLines: 924,
      },
    ],
    drawCount: 5,
    linesPerDraw: 924,
    amountPerDraw: 9_240_000,
    totalAmount: 46_200_000,
    status: "paid",
    createdAt: "2026-02-25 09:45",
    entries: [
      { drawId: "2026-02-25-T3", drawDate: "25/02", schedule: "T3", status: "settled", amount: 9_240_000, winAmount: 1_200_000 },
      { drawId: "2026-02-27-T5", drawDate: "27/02", schedule: "T5", status: "settled", amount: 9_240_000, winAmount: 0 },
      { drawId: "2026-03-01-T7", drawDate: "01/03", schedule: "T7", status: "scheduled", amount: 9_240_000, winAmount: 0 },
      { drawId: "2026-03-04-T3", drawDate: "04/03", schedule: "T3", status: "scheduled", amount: 9_240_000, winAmount: 0 },
      { drawId: "2026-03-06-T5", drawDate: "06/03", schedule: "T5", status: "scheduled", amount: 9_240_000, winAmount: 0 },
    ],
    progress: { total: 5, settled: 2, remaining: 3 },
  },
  {
    ticketNo: "M645-20260301-00089",
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    playerId: "P004",
    playerName: "Phạm Thị D",
    boards: [
      {
        boardNo: "A",
        playType: "quickPick",
        numbers: [1, 9, 18, 26, 34, 42],
        expandedLines: 1,
      },
    ],
    drawCount: 7,
    linesPerDraw: 1,
    amountPerDraw: 10_000,
    totalAmount: 70_000,
    status: "paid",
    createdAt: "2026-03-01 10:20",
    entries: [
      { drawId: "2026-03-01-T7", drawDate: "01/03", schedule: "T7", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-04-T3", drawDate: "04/03", schedule: "T3", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-06-T5", drawDate: "06/03", schedule: "T5", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-08-T7", drawDate: "08/03", schedule: "T7", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-11-T3", drawDate: "11/03", schedule: "T3", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-13-T5", drawDate: "13/03", schedule: "T5", status: "scheduled", amount: 10_000, winAmount: 0 },
      { drawId: "2026-03-15-T7", drawDate: "15/03", schedule: "T7", status: "scheduled", amount: 10_000, winAmount: 0 },
    ],
    progress: { total: 7, settled: 0, remaining: 7 },
  },
  {
    ticketNo: "M645-20260223-00034",
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    playerId: "P005",
    playerName: "Hoàng Văn E",
    boards: [
      {
        boardNo: "A",
        playType: "bao7",
        numbers: [2, 6, 13, 19, 24, 30, 38],
        expandedLines: 7,
      },
    ],
    drawCount: 3,
    linesPerDraw: 7,
    amountPerDraw: 70_000,
    totalAmount: 210_000,
    status: "completed",
    createdAt: "2026-02-23 16:05",
    entries: [
      { drawId: "2026-02-23-T7", drawDate: "23/02", schedule: "T7", status: "settled", amount: 70_000, winAmount: 250_000 },
      { drawId: "2026-02-25-T3", drawDate: "25/02", schedule: "T3", status: "settled", amount: 70_000, winAmount: 0 },
      { drawId: "2026-02-27-T5", drawDate: "27/02", schedule: "T5", status: "settled", amount: 70_000, winAmount: 0 },
    ],
    progress: { total: 3, settled: 3, remaining: 0 },
  },
];

type TicketData = (typeof MOCK_TICKETS)[number];

export default function Mega645TicketsPage() {
  const [ticketDetail, setTicketDetail] = useState<TicketData | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTickets = MOCK_TICKETS.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (tenantFilter !== "all" && t.tenantId !== tenantFilter) return false;
    if (
      searchQuery &&
      !t.ticketNo.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !t.playerName.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  const totalTickets = filteredTickets.length;
  const totalAmount = filteredTickets.reduce((s, t) => s + t.totalAmount, 0);
  const multiDrawCount = filteredTickets.filter((t) => t.drawCount > 1).length;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-orange-500 to-amber-600 shadow-sm">
          <Ticket className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Mega 6/45 — Quản lý vé
          </h1>
          <p className="text-xs text-muted-foreground">
            Tra cứu, theo dõi tất cả vé đã bán – trạng thái entries và chi tiết
            người chơi.
          </p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng vé"
          value={totalTickets.toLocaleString("vi-VN")}
          description="Trong kết quả lọc"
          icon={Ticket}
        />
        <StatCard
          title="Tổng tiền cược"
          value={fmtVND(totalAmount)}
          description="Tất cả kỳ"
          icon={CircleDollarSign}
        />
        <StatCard
          title="Vé nhiều kỳ"
          value={multiDrawCount.toLocaleString("vi-VN")}
          description="drawCount > 1"
          icon={Layers}
        />
        <StatCard
          title="Đại lý"
          value={String(new Set(filteredTickets.map((t) => t.tenantId)).size)}
          description="Có vé trong lọc"
          icon={Building2}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Mã vé hoặc tên người chơi..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Đại lý" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả đại lý</SelectItem>
              <SelectItem value="T001">Đại lý Sài Gòn</SelectItem>
              <SelectItem value="T002">Đại lý Hà Nội</SelectItem>
              <SelectItem value="T003">Đại lý Đà Nẵng</SelectItem>
              <SelectItem value="T004">Đại lý Cần Thơ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="paid">Đã thanh toán</SelectItem>
              <SelectItem value="completed">Hoàn tất</SelectItem>
              <SelectItem value="cancelled">Đã huỷ</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" defaultValue="2026-02-23" />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input type="date" className="w-40" defaultValue="2026-03-01" />
          <Button variant="outline" size="sm">
            <Filter className="mr-1 size-3.5" />
            Lọc
          </Button>
        </CardContent>
      </Card>

      {/* Ticket Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách vé</CardTitle>
          <CardDescription>
            {filteredTickets.length} vé · Tổng {fmtVND(totalAmount)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead>Đại lý</TableHead>
                  <TableHead>Người chơi</TableHead>
                  <TableHead className="text-center">Boards</TableHead>
                  <TableHead className="text-center">Lines/kỳ</TableHead>
                  <TableHead className="text-center">Kỳ</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className="text-center">Tiến trình</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((t) => (
                  <TableRow key={t.ticketNo}>
                    <TableCell className="font-mono text-sm">
                      {t.ticketNo}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{t.tenantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.tenantId}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{t.playerName}</TableCell>
                    <TableCell className="text-center">
                      {t.boards.length}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {t.linesPerDraw}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{t.drawCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {t.totalAmount.toLocaleString("vi-VN")} ₫
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${(t.progress.settled / t.progress.total) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {t.progress.settled}/{t.progress.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TicketStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setTicketDetail(t)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTickets.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Không tìm thấy vé nào phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog
        open={!!ticketDetail}
        onOpenChange={(open) => !open && setTicketDetail(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết vé – {ticketDetail?.ticketNo}</DialogTitle>
            <DialogDescription>
              {ticketDetail?.playerName} · {ticketDetail?.tenantName} ·{" "}
              {ticketDetail?.drawCount} kỳ ·{" "}
              {ticketDetail && fmtVND(ticketDetail.totalAmount)}
            </DialogDescription>
          </DialogHeader>
          {ticketDetail && (
            <div className="space-y-5">
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    label: "Lines/kỳ",
                    val: String(ticketDetail.linesPerDraw),
                  },
                  {
                    label: "Tiền/kỳ",
                    val:
                      ticketDetail.amountPerDraw.toLocaleString("vi-VN") + " ₫",
                  },
                  {
                    label: "Đã settle",
                    val: `${ticketDetail.progress.settled}/${ticketDetail.progress.total}`,
                  },
                  {
                    label: "Tổng thắng",
                    val: fmtVND(
                      ticketDetail.entries.reduce(
                        (s, e) => s + e.winAmount,
                        0
                      )
                    ),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg bg-muted/50 p-3 text-center"
                  >
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="text-base font-bold tabular-nums">
                      {item.val}
                    </p>
                  </div>
                ))}
              </div>

              {/* Boards */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Boards</h4>
                {ticketDetail.boards.map((b) => (
                  <div
                    key={b.boardNo}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                  >
                    <Badge variant="outline" className="font-mono">
                      {b.boardNo}
                    </Badge>
                    <Badge variant="secondary">
                      {PLAY_TYPE_LABELS[b.playType] ?? b.playType}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1">
                      {b.numbers.map((n, idx) => (
                        <MegaNumberBall
                          key={`${n}-${idx}`}
                          number={n}
                          size="sm"
                        />
                      ))}
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {b.expandedLines} lines
                    </span>
                  </div>
                ))}
              </div>

              {/* Entry timeline */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Lịch sử các kỳ</h4>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kỳ quay</TableHead>
                        <TableHead>Ngày</TableHead>
                        <TableHead>Lịch</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Cược</TableHead>
                        <TableHead className="text-right">Thắng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketDetail.entries.map((e) => (
                        <TableRow key={e.drawId}>
                          <TableCell className="font-mono text-sm">
                            {e.drawId}
                          </TableCell>
                          <TableCell>{e.drawDate}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{e.schedule}</Badge>
                          </TableCell>
                          <TableCell>
                            <EntryStatusBadge status={e.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {e.amount.toLocaleString("vi-VN")} ₫
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {e.status === "settled" && e.winAmount > 0 ? (
                              <span className="font-medium text-green-600 dark:text-green-400">
                                {e.winAmount.toLocaleString("vi-VN")} ₫
                              </span>
                            ) : e.status === "settled" ? (
                              <span className="text-muted-foreground">
                                0 ₫
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
