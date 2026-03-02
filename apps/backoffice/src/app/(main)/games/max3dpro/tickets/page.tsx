"use client";

import { useState } from "react";
import {
  CircleDollarSign,
  Eye,
  Filter,
  Search,
  Ticket,
  CheckCircle2,
  Activity,
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
import { TicketStatusBadge } from "@/components/games/max3dpro/ticket-status-badge";
import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";

function fmtVND(n: number) {
  if (n >= 1_000_000_000)
    return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  if (n >= 1_000_000)
    return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  return n.toLocaleString("vi-VN") + " ₫";
}

const PLAY_TYPE_LABELS: Record<string, string> = {
  multiNumber: "Bao số",
  multiDigit: "Bao chữ số",
  pair: "Cặp số",
};

const MOCK_TICKETS = [
  {
    ticketId: "TK50001",
    ticketNo: "M3DP-20260222-00045",
    playerId: "P001",
    playerName: "Nguyễn Văn A",
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    totalAmount: 320_000,
    totalBoards: 3,
    totalLines: 14,
    drawCount: 2,
    status: "active",
    createdAt: "2026-02-22 09:15:30",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["123", "456", "789"], expandedLines: 3 },
      { boardNo: "B", playType: "pair", triplets: ["112", "334"], expandedLines: 6 },
      { boardNo: "C", playType: "multiNumber", triplets: ["001", "999", "555", "777", "888"], expandedLines: 5 },
    ],
  },
  {
    ticketId: "TK50002",
    ticketNo: "M3DP-20260222-00046",
    playerId: "P002",
    playerName: "Trần Thị B",
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    totalAmount: 40_000,
    totalBoards: 1,
    totalLines: 2,
    drawCount: 1,
    status: "active",
    createdAt: "2026-02-22 10:02:15",
    boards: [
      { boardNo: "A", playType: "pair", triplets: ["246", "135"], expandedLines: 2 },
    ],
  },
  {
    ticketId: "TK50003",
    ticketNo: "M3DP-20260221-00012",
    playerId: "P003",
    playerName: "Lê Văn C",
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    totalAmount: 840_000,
    totalBoards: 4,
    totalLines: 42,
    drawCount: 4,
    status: "completed",
    createdAt: "2026-02-21 08:30:00",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["123", "456", "789"], expandedLines: 18 },
      { boardNo: "B", playType: "pair", triplets: ["001", "555"], expandedLines: 2 },
      { boardNo: "C", playType: "multiNumber", triplets: ["333", "666", "999"], expandedLines: 3 },
      { boardNo: "D", playType: "multiDigit", triplets: ["112", "334", "556", "778", "990"], expandedLines: 15 },
    ],
  },
  {
    ticketId: "TK50004",
    ticketNo: "M3DP-20260221-00013",
    playerId: "P004",
    playerName: "Phạm Thị D",
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    totalAmount: 60_000,
    totalBoards: 1,
    totalLines: 3,
    drawCount: 1,
    status: "completed",
    createdAt: "2026-02-21 11:45:00",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["007", "070", "700"], expandedLines: 3 },
    ],
  },
  {
    ticketId: "TK50005",
    ticketNo: "M3DP-20260222-00047",
    playerId: "P005",
    playerName: "Hoàng Văn E",
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    totalAmount: 600_000,
    totalBoards: 2,
    totalLines: 30,
    drawCount: 3,
    status: "active",
    createdAt: "2026-02-22 07:00:00",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["123", "456", "789", "012"], expandedLines: 24 },
      { boardNo: "B", playType: "pair", triplets: ["555", "888", "111"], expandedLines: 3 },
    ],
  },
  {
    ticketId: "TK50006",
    ticketNo: "M3DP-20260220-00008",
    playerId: "P006",
    playerName: "Vũ Minh F",
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    totalAmount: 100_000,
    totalBoards: 1,
    totalLines: 5,
    drawCount: 1,
    status: "cancelled",
    createdAt: "2026-02-20 14:20:00",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["111", "222", "333", "444", "555"], expandedLines: 5 },
    ],
  },
  {
    ticketId: "TK50007",
    ticketNo: "M3DP-20260222-00048",
    playerId: "P007",
    playerName: "Đỗ Thị G",
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    totalAmount: 200_000,
    totalBoards: 2,
    totalLines: 10,
    drawCount: 2,
    status: "active",
    createdAt: "2026-02-22 12:30:00",
    boards: [
      { boardNo: "A", playType: "multiDigit", triplets: ["223", "445", "667"], expandedLines: 9 },
      { boardNo: "B", playType: "pair", triplets: ["000"], expandedLines: 1 },
    ],
  },
  {
    ticketId: "TK50008",
    ticketNo: "M3DP-20260219-00003",
    playerId: "P008",
    playerName: "Bùi Văn H",
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    totalAmount: 160_000,
    totalBoards: 2,
    totalLines: 8,
    drawCount: 2,
    status: "completed",
    createdAt: "2026-02-19 16:00:00",
    boards: [
      { boardNo: "A", playType: "multiNumber", triplets: ["369", "147", "258", "036"], expandedLines: 4 },
      { boardNo: "B", playType: "pair", triplets: ["999", "888", "777", "666"], expandedLines: 4 },
    ],
  },
];

type TicketData = (typeof MOCK_TICKETS)[number];

export default function TicketsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ticketDetail, setTicketDetail] = useState<TicketData | null>(null);
  const [currentPage] = useState(1);

  const filtered = MOCK_TICKETS.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketNo.toLowerCase().includes(q) ||
        t.playerName.toLowerCase().includes(q) ||
        t.tenantName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalTickets = MOCK_TICKETS.length;
  const totalAmount = MOCK_TICKETS.reduce((s, t) => s + t.totalAmount, 0);
  const activeCount = MOCK_TICKETS.filter((t) => t.status === "active").length;
  const completedCount = MOCK_TICKETS.filter((t) => t.status === "completed").length;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-red-500 to-orange-600 shadow-sm">
          <Ticket className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Max 3D Pro — Quản lý vé
          </h1>
          <p className="text-xs text-muted-foreground">
            Tra cứu và quản lý tất cả vé Max 3D Pro theo trạng thái, đại lý, người chơi.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng vé" value={totalTickets.toLocaleString("vi-VN")} description="Tất cả trạng thái" icon={Ticket} />
        <StatCard title="Tổng tiền" value={fmtVND(totalAmount)} description="Giá trị toàn bộ vé" icon={CircleDollarSign} />
        <StatCard title="Vé hoạt động" value={activeCount.toLocaleString("vi-VN")} description="Đang tham gia kỳ quay" icon={Activity} />
        <StatCard title="Vé hoàn tất" value={completedCount.toLocaleString("vi-VN")} description="Đã settle xong" icon={CheckCircle2} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input placeholder="Mã vé, người chơi, đại lý..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="pending">Chờ xử lý</SelectItem>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="completed">Hoàn tất</SelectItem>
              <SelectItem value="cancelled">Đã huỷ</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm"><Filter className="mr-1 size-3.5" />Lọc</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vé</CardTitle>
          <CardDescription>Hiển thị {filtered.length} / {totalTickets} vé · Trang {currentPage}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead>Người chơi</TableHead>
                  <TableHead>Đại lý</TableHead>
                  <TableHead className="text-center">Boards</TableHead>
                  <TableHead className="text-center">Lines</TableHead>
                  <TableHead className="text-center">Kỳ</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ticket) => (
                  <TableRow key={ticket.ticketId}>
                    <TableCell>
                      <div>
                        <p className="font-mono text-sm">{ticket.ticketNo}</p>
                        <p className="text-xs text-muted-foreground">{ticket.ticketId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{ticket.playerName}</p>
                        <p className="text-xs text-muted-foreground">{ticket.playerId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{ticket.tenantName}</p>
                        <p className="text-xs text-muted-foreground">{ticket.tenantId}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{ticket.totalBoards}</TableCell>
                    <TableCell className="text-center tabular-nums">{ticket.totalLines}</TableCell>
                    <TableCell className="text-center"><Badge variant="outline">{ticket.drawCount}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{ticket.totalAmount.toLocaleString("vi-VN")} ₫</TableCell>
                    <TableCell><TicketStatusBadge status={ticket.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{ticket.createdAt}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => setTicketDetail(ticket)}>
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Không tìm thấy vé phù hợp.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Hiển thị {filtered.length} kết quả</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>Trước</Button>
              <Badge variant="secondary">1</Badge>
              <Button variant="outline" size="sm" disabled>Sau</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!ticketDetail} onOpenChange={(open) => !open && setTicketDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết vé – {ticketDetail?.ticketNo}</DialogTitle>
            <DialogDescription>Người chơi: {ticketDetail?.playerName} · {ticketDetail?.tenantName}</DialogDescription>
          </DialogHeader>
          {ticketDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Mã vé", val: ticketDetail.ticketId },
                  { label: "Số kỳ", val: String(ticketDetail.drawCount) },
                  { label: "Boards", val: String(ticketDetail.totalBoards) },
                  { label: "Lines", val: String(ticketDetail.totalLines) },
                  { label: "Tổng tiền", val: ticketDetail.totalAmount.toLocaleString("vi-VN") + " ₫" },
                  { label: "Ngày tạo", val: ticketDetail.createdAt },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-bold tabular-nums">{item.val}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Trạng thái</span>
                <TicketStatusBadge status={ticketDetail.status} />
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Boards</h4>
                {ticketDetail.boards.map((board) => (
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
