"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Filter,
  Layers,
  Search,
  Ticket,
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
import { StatCard } from "@/components/games/lotto535/stat-card";
import { TicketStatusBadge } from "@/components/games/lotto535/ticket-status-badge";
import { EntryStatusBadge } from "@/components/games/lotto535/entry-status-badge";
import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";

const PLAY_TYPE_LABELS: Record<string, string> = {
  standard: "Thường",
  mainCover4: "Bao 4",
  mainCover: "Bao chính",
  specialCover: "Bao ĐB",
  quickPick: "Tự chọn",
};

function fmtVND(n: number) {
  if (n >= 1_000_000_000)
    return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ";
  if (n >= 1_000_000)
    return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
  return n.toLocaleString("vi-VN") + " ₫";
}

const MOCK_TENANT_MULTI = [
  {
    tenantId: "T001",
    tenantName: "Đại lý Sài Gòn",
    multiTickets: 124,
    totalAmount: 74_400_000,
    avgDrawCount: 3.8,
    playerCount: 67,
  },
  {
    tenantId: "T002",
    tenantName: "Đại lý Hà Nội",
    multiTickets: 89,
    totalAmount: 45_200_000,
    avgDrawCount: 3.2,
    playerCount: 43,
  },
  {
    tenantId: "T003",
    tenantName: "Đại lý Đà Nẵng",
    multiTickets: 56,
    totalAmount: 28_800_000,
    avgDrawCount: 4.1,
    playerCount: 31,
  },
  {
    tenantId: "T004",
    tenantName: "Đại lý Cần Thơ",
    multiTickets: 32,
    totalAmount: 12_600_000,
    avgDrawCount: 2.9,
    playerCount: 19,
  },
];

const MOCK_MULTI_TICKETS = [
  {
    ticketNo: "L535-20260220-00003",
    playerId: "P003",
    playerName: "Lê Văn C",
    boards: [
      {
        boardNo: "A",
        playType: "specialCover",
        mainNumbers: ["02", "08", "16", "23", "35"],
        specialNumbers: ["01", "04", "07", "10"],
        expandedLines: 4,
      },
      {
        boardNo: "B",
        playType: "standard",
        mainNumbers: ["07", "14", "21", "28", "33"],
        specialNumbers: ["06"],
        expandedLines: 1,
      },
    ],
    drawCount: 6,
    linesPerDraw: 5,
    amountPerDraw: 50_000,
    totalAmount: 300_000,
    status: "paid",
    startDrawId: "2026-02-20-001",
    progress: { total: 6, settled: 3, remaining: 3, nextDrawId: "2026-02-22-002" },
    entries: [
      {
        drawId: "2026-02-20-001",
        drawDate: "20/02",
        drawTime: "13:00",
        status: "settled",
        amount: 50_000,
        winAmount: 30_000,
      },
      {
        drawId: "2026-02-20-002",
        drawDate: "20/02",
        drawTime: "21:00",
        status: "settled",
        amount: 50_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-21-001",
        drawDate: "21/02",
        drawTime: "13:00",
        status: "settled",
        amount: 50_000,
        winAmount: 100_000,
      },
      {
        drawId: "2026-02-21-002",
        drawDate: "21/02",
        drawTime: "21:00",
        status: "scheduled",
        amount: 50_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-22-001",
        drawDate: "22/02",
        drawTime: "13:00",
        status: "scheduled",
        amount: 50_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-22-002",
        drawDate: "22/02",
        drawTime: "21:00",
        status: "scheduled",
        amount: 50_000,
        winAmount: 0,
      },
    ],
  },
  {
    ticketNo: "L535-20260221-00014",
    playerId: "P005",
    playerName: "Hoàng Văn E",
    boards: [
      {
        boardNo: "A",
        playType: "standard",
        mainNumbers: ["01", "09", "18", "26", "34"],
        specialNumbers: ["12"],
        expandedLines: 1,
      },
    ],
    drawCount: 3,
    linesPerDraw: 1,
    amountPerDraw: 10_000,
    totalAmount: 30_000,
    status: "paid",
    startDrawId: "2026-02-21-002",
    progress: { total: 3, settled: 1, remaining: 2, nextDrawId: "2026-02-22-001" },
    entries: [
      {
        drawId: "2026-02-21-002",
        drawDate: "21/02",
        drawTime: "21:00",
        status: "settled",
        amount: 10_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-22-001",
        drawDate: "22/02",
        drawTime: "13:00",
        status: "scheduled",
        amount: 10_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-22-002",
        drawDate: "22/02",
        drawTime: "21:00",
        status: "scheduled",
        amount: 10_000,
        winAmount: 0,
      },
    ],
  },
  {
    ticketNo: "L535-20260222-00003",
    playerId: "P003",
    playerName: "Lê Văn C",
    boards: [
      {
        boardNo: "A",
        playType: "mainCover4",
        mainNumbers: ["03", "11", "19", "27"],
        specialNumbers: ["09"],
        expandedLines: 31,
      },
    ],
    drawCount: 4,
    linesPerDraw: 31,
    amountPerDraw: 310_000,
    totalAmount: 1_240_000,
    status: "paid",
    startDrawId: "2026-02-22-001",
    progress: { total: 4, settled: 1, remaining: 3, nextDrawId: "2026-02-22-002" },
    entries: [
      {
        drawId: "2026-02-22-001",
        drawDate: "22/02",
        drawTime: "13:00",
        status: "settled",
        amount: 310_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-22-002",
        drawDate: "22/02",
        drawTime: "21:00",
        status: "scheduled",
        amount: 310_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-23-001",
        drawDate: "23/02",
        drawTime: "13:00",
        status: "scheduled",
        amount: 310_000,
        winAmount: 0,
      },
      {
        drawId: "2026-02-23-002",
        drawDate: "23/02",
        drawTime: "21:00",
        status: "scheduled",
        amount: 310_000,
        winAmount: 0,
      },
    ],
  },
];

type TicketData = (typeof MOCK_MULTI_TICKETS)[number];

export default function MultiDrawTicketsPage() {
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketData | null>(null);

  const selectedTenantData = MOCK_TENANT_MULTI.find((t) => t.tenantId === selectedTenant);
  const totalMulti = MOCK_TENANT_MULTI.reduce((s, t) => s + t.multiTickets, 0);
  const totalAmt = MOCK_TENANT_MULTI.reduce((s, t) => s + t.totalAmount, 0);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-sm">
          <Layers className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Lotto 5/35 — Vé nhiều kỳ
          </h1>
          <p className="text-xs text-muted-foreground">
            Theo dõi vé tham gia nhiều kỳ liên tiếp, tiến trình và trạng thái từng kỳ.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tổng vé nhiều kỳ"
          value={totalMulti.toLocaleString("vi-VN")}
          description="Đang hoạt động"
          icon={Layers}
        />
        <StatCard
          title="Tổng tiền cược"
          value={fmtVND(totalAmt)}
          description="Across all draws"
          icon={CircleDollarSign}
        />
        <StatCard
          title="Đại lý"
          value={String(MOCK_TENANT_MULTI.length)}
          description="Có vé nhiều kỳ"
          icon={Building2}
        />
        <StatCard title="TB kỳ/vé" value="3.5" description="Trung bình drawCount" icon={Ticket} />
      </div>

      {/* LEVEL 1: Tenant list */}
      {!selectedTenant && (
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ theo đại lý</CardTitle>
            <CardDescription>Chọn đại lý để xem chi tiết từng vé nhiều kỳ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Đại lý</TableHead>
                    <TableHead className="text-right">Vé nhiều kỳ</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead className="text-right">TB kỳ/vé</TableHead>
                    <TableHead className="text-right">Người chơi</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_TENANT_MULTI.map((t) => (
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
                        {t.multiTickets}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtVND(t.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.avgDrawCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.playerCount}</TableCell>
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

      {/* LEVEL 2: Ticket list per tenant */}
      {selectedTenant && selectedTenantData && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setSelectedTenant(null)}
          >
            <ArrowLeft className="mr-1 size-4" />
            Quay lại danh sách đại lý
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Vé nhiều kỳ – {selectedTenantData.tenantName}</CardTitle>
              <CardDescription>{selectedTenantData.multiTickets} vé đang hoạt động</CardDescription>
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
                    <SelectItem value="paid">Đang chơi</SelectItem>
                    <SelectItem value="completed">Hoàn tất</SelectItem>
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
                      <TableHead className="text-center">Lines/kỳ</TableHead>
                      <TableHead className="text-right">Tiền/kỳ</TableHead>
                      <TableHead className="text-right">Tổng tiền</TableHead>
                      <TableHead className="text-center">Tiến trình</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MOCK_MULTI_TICKETS.map((t) => (
                      <TableRow key={t.ticketNo}>
                        <TableCell className="font-mono text-sm">{t.ticketNo}</TableCell>
                        <TableCell>{t.playerName}</TableCell>
                        <TableCell className="text-center">{t.boards.length}</TableCell>
                        <TableCell className="text-center tabular-nums">{t.linesPerDraw}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.amountPerDraw.toLocaleString("vi-VN")} ₫
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
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* TICKET DETAIL DIALOG */}
      <Dialog open={!!ticketDetail} onOpenChange={(open) => !open && setTicketDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vé nhiều kỳ – {ticketDetail?.ticketNo}</DialogTitle>
            <DialogDescription>
              {ticketDetail?.playerName} · {ticketDetail?.drawCount} kỳ ·{" "}
              {ticketDetail && fmtVND(ticketDetail.totalAmount)}
            </DialogDescription>
          </DialogHeader>
          {ticketDetail && (
            <div className="space-y-5">
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Lines/kỳ", val: String(ticketDetail.linesPerDraw) },
                  {
                    label: "Tiền/kỳ",
                    val: ticketDetail.amountPerDraw.toLocaleString("vi-VN") + " ₫",
                  },
                  {
                    label: "Đã settle",
                    val: `${ticketDetail.progress.settled}/${ticketDetail.progress.total}`,
                  },
                  {
                    label: "Tổng thắng",
                    val: fmtVND(ticketDetail.entries.reduce((s, e) => s + e.winAmount, 0)),
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-base font-bold tabular-nums">{item.val}</p>
                  </div>
                ))}
              </div>

              {/* Boards */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Boards</h4>
                {ticketDetail.boards.map((b) => (
                  <div key={b.boardNo} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <Badge variant="outline" className="font-mono">
                      {b.boardNo}
                    </Badge>
                    <Badge variant="secondary">{PLAY_TYPE_LABELS[b.playType] ?? b.playType}</Badge>
                    <div className="flex flex-wrap items-center gap-1">
                      {b.mainNumbers.map((n) => (
                        <LottoNumberBall key={n} number={n} size="sm" />
                      ))}
                      <span className="mx-0.5 text-muted-foreground">+</span>
                      {b.specialNumbers.map((n) => (
                        <LottoNumberBall key={n} number={n} variant="special" size="sm" />
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
                        <TableHead>Giờ</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Cược</TableHead>
                        <TableHead className="text-right">Thắng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketDetail.entries.map((e) => (
                        <TableRow key={e.drawId}>
                          <TableCell className="font-mono text-sm">{e.drawId}</TableCell>
                          <TableCell>{e.drawDate}</TableCell>
                          <TableCell>{e.drawTime}</TableCell>
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
                              <span className="text-muted-foreground">0 ₫</span>
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
