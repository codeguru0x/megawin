"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock,
  Edit3,
  Eye,
  Filter,
  Loader2,
  Lock,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Square,
  Ticket,
  Timer,
  Unlock,
  Users,
  XCircle,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import {
  JackpotDisplay,
  formatVND,
} from "@/components/games/lotto535/jackpot-display";
import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";
import { StatCard } from "@/components/games/lotto535/stat-card";

const ACTIVE_DRAW = {
  drawId: "2026-02-22-002",
  drawDate: "2026-02-22",
  drawNo: 2,
  drawTime: "21:00",
  salesOpenAt: "2026-02-22T14:00:00",
  salesCloseAt: "2026-02-22T20:30:00",
  status: "salesOpen" as const,
  jackpotAmount: 3_450_000_000,
  ticketEntryCount: 8320,
  totalRevenue: 166_400_000,
  result: null as { winningMain: number[]; winningSpecial: number } | null,
  maxTickets: 50_000,
};

const COMPLETED_DRAWS = [
  {
    drawId: "2026-02-22-001",
    drawDate: "2026-02-22",
    drawNo: 1,
    drawTime: "13:00",
    status: "settled",
    jackpotAmount: 3_200_000_000,
    ticketEntryCount: 12_450,
    totalRevenue: 248_500_000,
    result: {
      winningMain: [3, 12, 17, 24, 31] as const,
      winningSpecial: 7,
    },
  },
  {
    drawId: "2026-02-21-002",
    drawDate: "2026-02-21",
    drawNo: 2,
    drawTime: "21:00",
    status: "settled",
    jackpotAmount: 3_000_000_000,
    ticketEntryCount: 13_800,
    totalRevenue: 276_000_000,
    result: {
      winningMain: [1, 14, 19, 27, 33] as const,
      winningSpecial: 4,
    },
  },
  {
    drawId: "2026-02-21-001",
    drawDate: "2026-02-21",
    drawNo: 1,
    drawTime: "13:00",
    status: "settled",
    jackpotAmount: 2_800_000_000,
    ticketEntryCount: 11_200,
    totalRevenue: 224_000_000,
    result: {
      winningMain: [5, 9, 22, 28, 35] as const,
      winningSpecial: 11,
    },
  },
  {
    drawId: "2026-02-20-002",
    drawDate: "2026-02-20",
    drawNo: 2,
    drawTime: "21:00",
    status: "settled",
    jackpotAmount: 2_600_000_000,
    ticketEntryCount: 10_500,
    totalRevenue: 210_000_000,
    result: {
      winningMain: [2, 8, 15, 23, 30] as const,
      winningSpecial: 18,
    },
  },
  {
    drawId: "2026-02-20-001",
    drawDate: "2026-02-20",
    drawNo: 1,
    drawTime: "13:00",
    status: "settled",
    jackpotAmount: 2_400_000_000,
    ticketEntryCount: 9_800,
    totalRevenue: 196_000_000,
    result: {
      winningMain: [6, 11, 20, 29, 34] as const,
      winningSpecial: 13,
    },
  },
  {
    drawId: "2026-02-19-002",
    drawDate: "2026-02-19",
    drawNo: 2,
    drawTime: "21:00",
    status: "void",
    jackpotAmount: 2_200_000_000,
    ticketEntryCount: 0,
    totalRevenue: 0,
    result: null,
  },
];

function ActiveDrawCard({ draw }: { draw: typeof ACTIVE_DRAW }) {
  const [editOpen, setEditOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [mainNumbers, setMainNumbers] = useState(["", "", "", "", ""]);
  const [specialNumber, setSpecialNumber] = useState("");
  const [editSalesOpen, setEditSalesOpen] = useState(
    draw.salesOpenAt.slice(11, 16)
  );
  const [editSalesClose, setEditSalesClose] = useState(
    draw.salesCloseAt.slice(11, 16)
  );

  const now = new Date();
  const closeAt = new Date(draw.salesCloseAt);
  const remainMs = Math.max(0, closeAt.getTime() - now.getTime());
  const remainMinutes = Math.floor(remainMs / 60_000);
  const remainHours = Math.floor(remainMinutes / 60);
  const remainMins = remainMinutes % 60;
  const progressPct = Math.round(
    (draw.ticketEntryCount / draw.maxTickets) * 100
  );

  return (
    <Card className="relative overflow-hidden border-green-200 dark:border-green-800">
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-green-500 via-emerald-500 to-teal-500" />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <Radio className="size-5 text-green-600 dark:text-green-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                Kỳ đang bán
                <DrawStatusBadge status={draw.status} />
              </CardTitle>
              <CardDescription className="font-mono">
                {draw.drawId} &middot; Kỳ {draw.drawNo} &middot; {draw.drawDate}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              <Timer className="size-3.5" />
              Còn {remainHours > 0 ? `${remainHours}h ` : ""}
              {remainMins}m
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Metrics grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900">
              <CircleDollarSign className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Jackpot</p>
              <JackpotDisplay amount={draw.jackpotAmount} size="sm" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900">
              <Ticket className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vé đã bán</p>
              <p className="text-sm font-bold tabular-nums">
                {draw.ticketEntryCount.toLocaleString("vi-VN")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900">
              <CircleDollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Doanh thu</p>
              <p className="text-sm font-bold tabular-nums">
                {formatVND(draw.totalRevenue)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900">
              <Users className="size-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tiến độ bán</p>
              <div className="flex items-center gap-2">
                <Progress value={progressPct} className="h-2 w-16" />
                <span className="text-sm font-bold tabular-nums">
                  {progressPct}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Unlock className="size-4 text-green-600" />
            <span className="text-muted-foreground">Mở bán:</span>
            <span className="font-mono font-medium">
              {draw.salesOpenAt.slice(11, 16)}
            </span>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-red-600" />
            <span className="text-muted-foreground">Đóng bán:</span>
            <span className="font-mono font-medium">
              {draw.salesCloseAt.slice(11, 16)}
            </span>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-blue-600" />
            <span className="text-muted-foreground">Quay số:</span>
            <span className="font-mono font-medium">{draw.drawTime}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Update result */}
          <Dialog open={resultOpen} onOpenChange={setResultOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <Send className="mr-2 size-4" />
                Cập nhật kết quả
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cập nhật kết quả kỳ {draw.drawId}</DialogTitle>
                <DialogDescription>
                  Nhập 5 số chính (1–35) và 1 số đặc biệt (1–35).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>5 số chính</Label>
                  <div className="flex gap-2">
                    {mainNumbers.map((val, idx) => (
                      <Input
                        key={idx}
                        type="number"
                        min={1}
                        max={35}
                        value={val}
                        onChange={(e) => {
                          const next = [...mainNumbers];
                          next[idx] = e.target.value;
                          setMainNumbers(next);
                        }}
                        className="w-16 text-center tabular-nums"
                        placeholder={`#${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Số đặc biệt</Label>
                  <Input
                    type="number"
                    min={1}
                    max={35}
                    value={specialNumber}
                    onChange={(e) => setSpecialNumber(e.target.value)}
                    className="w-16 text-center tabular-nums"
                    placeholder="#"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResultOpen(false)}
                >
                  Huỷ
                </Button>
                <Button onClick={() => setResultOpen(false)}>
                  <Check className="mr-2 size-4" />
                  Xác nhận
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Close sales */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Square className="mr-2 size-4" />
                Đóng bán
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận đóng bán?</AlertDialogTitle>
                <AlertDialogDescription>
                  Kỳ <strong>{draw.drawId}</strong> sẽ ngừng nhận vé. Thao tác
                  này sẽ ghi đè thời gian đóng tự động của hệ thống.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction>Đóng bán ngay</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Re-open sales */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Play className="mr-2 size-4" />
                Mở lại bán
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mở lại bán vé?</AlertDialogTitle>
                <AlertDialogDescription>
                  Kỳ <strong>{draw.drawId}</strong> sẽ được mở bán lại. Thao
                  tác này sẽ ghi đè trạng thái đóng.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction>Mở bán</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit schedule */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Edit3 className="mr-2 size-4" />
                Sửa lịch
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Sửa lịch kỳ {draw.drawId}</DialogTitle>
                <DialogDescription>
                  Thay đổi giờ mở/đóng bán cho kỳ này (ghi đè cấu hình hệ
                  thống).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Giờ mở bán</Label>
                  <Input
                    type="time"
                    value={editSalesOpen}
                    onChange={(e) => setEditSalesOpen(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Giờ đóng bán</Label>
                  <Input
                    type="time"
                    value={editSalesClose}
                    onChange={(e) => setEditSalesClose(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Huỷ
                </Button>
                <Button onClick={() => setEditOpen(false)}>
                  <Check className="mr-2 size-4" />
                  Lưu
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* Settle */}
          <Button variant="secondary" size="sm">
            <ShieldCheck className="mr-2 size-4" />
            Settle
          </Button>

          {/* Void */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                <XCircle className="mr-2 size-4" />
                Huỷ kỳ
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Huỷ kỳ quay?</AlertDialogTitle>
                <AlertDialogDescription>
                  Kỳ <strong>{draw.drawId}</strong> sẽ bị huỷ vĩnh viễn. Tất
                  cả vé đã bán sẽ được hoàn lại. Không thể phục hồi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Quay lại</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Xác nhận huỷ
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDrawsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Lotto 5/35 – Quản lý kỳ quay
          </h1>
          <p className="text-sm text-muted-foreground">
            Tạo kỳ quay, mở/đóng bán vé, công bố kết quả và settle.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          Tạo kỳ quay
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Jackpot hiện tại"
          value="3,45 tỷ"
          description="Tích luỹ 14 kỳ"
          icon={CircleDollarSign}
          trend={{ value: 8.2, isPositive: true }}
        />
        <StatCard
          title="Kỳ đang mở bán"
          value="1"
          description="2026-02-22 Kỳ 2"
          icon={Play}
        />
        <StatCard
          title="Tổng vé hôm nay"
          value="20,770"
          description="12,450 + 8,320"
          icon={Ticket}
          trend={{ value: 12.5, isPositive: true }}
        />
        <StatCard
          title="Doanh thu hôm nay"
          value="414,9 tr"
          description="248,5tr + 166,4tr"
          icon={CalendarClock}
          trend={{ value: 5.3, isPositive: true }}
        />
      </div>

      {/* Active Draw Card */}
      <ActiveDrawCard draw={ACTIVE_DRAW} />

      {/* Completed Draws Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử kỳ quay</CardTitle>
          <CardDescription>
            Các kỳ quay đã hoàn thành, sắp xếp mới nhất trước.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Tìm drawId..." className="w-48" />
            <Select defaultValue="all">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="settled">Hoàn tất</SelectItem>
                <SelectItem value="published">Đã công bố</SelectItem>
                <SelectItem value="void">Đã huỷ</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" defaultValue="2026-02-19" />
            <Input type="date" className="w-40" defaultValue="2026-02-22" />
            <Button variant="outline" size="sm">
              <Filter className="mr-1 size-3.5" />
              Lọc
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Draw ID</TableHead>
                  <TableHead className="w-20">Kỳ</TableHead>
                  <TableHead className="w-20">Giờ</TableHead>
                  <TableHead className="w-28">Trạng thái</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="w-32 text-right">Jackpot</TableHead>
                  <TableHead className="w-24 text-right">Vé</TableHead>
                  <TableHead className="w-32 text-right">Doanh thu</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPLETED_DRAWS.map((draw) => (
                  <TableRow key={draw.drawId}>
                    <TableCell className="font-mono text-sm">
                      {draw.drawId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Kỳ {draw.drawNo}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {draw.drawTime}
                    </TableCell>
                    <TableCell>
                      <DrawStatusBadge status={draw.status} />
                    </TableCell>
                    <TableCell>
                      {draw.result ? (
                        <div className="flex items-center gap-1">
                          {draw.result.winningMain.map((n) => (
                            <LottoNumberBall
                              key={n}
                              number={n}
                              size="sm"
                            />
                          ))}
                          <span className="mx-1 text-muted-foreground">+</span>
                          <LottoNumberBall
                            number={draw.result.winningSpecial}
                            variant="special"
                            size="sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <JackpotDisplay
                        amount={draw.jackpotAmount}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {draw.ticketEntryCount > 0
                        ? draw.ticketEntryCount.toLocaleString("vi-VN")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {draw.totalRevenue > 0
                        ? formatVND(draw.totalRevenue)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="mr-2 size-4" />
                            Xem chi tiết
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <XCircle className="mr-2 size-4" />
                            Void kỳ quay
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
