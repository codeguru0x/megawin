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
  Lock,
  MoreHorizontal,
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
import { KenoDrawStatusBadge } from "@/components/games/keno/draw-status-badge";
import { KenoNumberBall } from "@/components/games/keno/keno-number-ball";
import { KenoStatCard } from "@/components/games/keno/stat-card";
import { formatVND } from "@/components/games/keno/side-bet-badge";

const ACTIVE_DRAW = {
  drawId: "2026-02-22-055",
  drawDate: "2026-02-22",
  drawNo: 55,
  drawTime: "15:00",
  salesOpenAt: "2026-02-22T14:50:00",
  salesCloseAt: "2026-02-22T14:55:00",
  status: "salesOpen" as const,
  ticketEntryCount: 1240,
  totalRevenue: 24_800_000,
  result: null as { winningNumbers: number[] } | null,
  maxTickets: 10_000,
};

const COMPLETED_DRAWS = [
  {
    drawId: "2026-02-22-054",
    drawDate: "2026-02-22",
    drawNo: 54,
    drawTime: "14:50",
    status: "settled",
    ticketEntryCount: 1_580,
    totalRevenue: 31_600_000,
    result: {
      winningNumbers: [2, 5, 8, 11, 14, 19, 23, 27, 31, 35, 38, 42, 46, 51, 55, 60, 64, 69, 73, 78],
    },
  },
  {
    drawId: "2026-02-22-053",
    drawDate: "2026-02-22",
    drawNo: 53,
    drawTime: "14:40",
    status: "settled",
    ticketEntryCount: 1_320,
    totalRevenue: 26_400_000,
    result: {
      winningNumbers: [1, 7, 12, 16, 20, 24, 29, 33, 37, 41, 45, 50, 54, 58, 63, 67, 71, 75, 79, 80],
    },
  },
  {
    drawId: "2026-02-22-052",
    drawDate: "2026-02-22",
    drawNo: 52,
    drawTime: "14:30",
    status: "settled",
    ticketEntryCount: 1_450,
    totalRevenue: 29_000_000,
    result: {
      winningNumbers: [3, 9, 13, 18, 22, 26, 30, 34, 39, 43, 47, 52, 56, 61, 65, 68, 72, 76, 77, 80],
    },
  },
  {
    drawId: "2026-02-22-051",
    drawDate: "2026-02-22",
    drawNo: 51,
    drawTime: "14:20",
    status: "settled",
    ticketEntryCount: 1_180,
    totalRevenue: 23_600_000,
    result: {
      winningNumbers: [4, 6, 10, 15, 21, 25, 28, 32, 36, 40, 44, 48, 53, 57, 62, 66, 70, 74, 78, 80],
    },
  },
  {
    drawId: "2026-02-22-050",
    drawDate: "2026-02-22",
    drawNo: 50,
    drawTime: "14:10",
    status: "void",
    ticketEntryCount: 0,
    totalRevenue: 0,
    result: null,
  },
];

function ActiveDrawCard({ draw }: { draw: typeof ACTIVE_DRAW }) {
  const [resultOpen, setResultOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [numbers, setNumbers] = useState<string[]>(Array(20).fill(""));
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
  const progressPct = Math.round(
    (draw.ticketEntryCount / draw.maxTickets) * 100
  );

  return (
    <Card className="relative overflow-hidden border-green-200 dark:border-green-800">
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500" />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <Radio className="size-5 text-green-600 dark:text-green-400 animate-pulse" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                Kỳ đang bán
                <KenoDrawStatusBadge status={draw.status} />
              </CardTitle>
              <CardDescription className="font-mono">
                {draw.drawId} &middot; Kỳ {draw.drawNo} &middot; {draw.drawDate}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          >
            <Timer className="size-3.5" />
            Còn {remainMinutes}m
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={resultOpen} onOpenChange={setResultOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm">
                <Send className="mr-2 size-4" />
                Cập nhật kết quả
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Cập nhật kết quả kỳ {draw.drawId}</DialogTitle>
                <DialogDescription>
                  Nhập 20 số từ 01-80.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>20 số trúng thưởng</Label>
                  <div className="grid grid-cols-10 gap-1.5">
                    {numbers.map((val, idx) => (
                      <Input
                        key={idx}
                        type="number"
                        min={1}
                        max={80}
                        value={val}
                        onChange={(e) => {
                          const next = [...numbers];
                          next[idx] = e.target.value;
                          setNumbers(next);
                        }}
                        className="w-full text-center tabular-nums text-xs p-1 h-8"
                        placeholder={`${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResultOpen(false)}>
                  Huỷ
                </Button>
                <Button onClick={() => setResultOpen(false)}>
                  <Check className="mr-2 size-4" />
                  Xác nhận
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                  Kỳ <strong>{draw.drawId}</strong> sẽ ngừng nhận vé.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction>Đóng bán ngay</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                  Kỳ <strong>{draw.drawId}</strong> sẽ được mở bán lại.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction>Mở bán</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                  Thay đổi giờ mở/đóng bán cho kỳ này.
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

          <Button variant="secondary" size="sm">
            <ShieldCheck className="mr-2 size-4" />
            Settle
          </Button>

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
                  Kỳ <strong>{draw.drawId}</strong> sẽ bị huỷ vĩnh viễn. Tất cả
                  vé đã bán sẽ được hoàn lại.
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

export default function KenoDrawsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
            Keno – Quản lý kỳ quay
          </h1>
          <p className="text-sm text-muted-foreground">
            Quay mỗi 10 phút (06:00-21:55). Quản lý kỳ quay, cập nhật kết quả và settle.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          Tạo kỳ quay
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KenoStatCard
          title="Kỳ hôm nay"
          value="55 / 96"
          description="Kỳ tiếp theo: 15:00"
          icon={CalendarClock}
        />
        <KenoStatCard
          title="Kỳ đang bán"
          value="1"
          description={`Kỳ ${ACTIVE_DRAW.drawNo}`}
          icon={Play}
        />
        <KenoStatCard
          title="Tổng vé hôm nay"
          value="68,500"
          description="Trung bình 1,265/kỳ"
          icon={Ticket}
          trend={{ value: 8.2, isPositive: true }}
        />
        <KenoStatCard
          title="Doanh thu hôm nay"
          value="1,37 tỷ"
          description="TB 25,3 tr/kỳ"
          icon={CircleDollarSign}
          trend={{ value: 5.3, isPositive: true }}
        />
      </div>

      <ActiveDrawCard draw={ACTIVE_DRAW} />

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử kỳ quay</CardTitle>
          <CardDescription>
            Các kỳ quay gần đây, sắp xếp mới nhất trước.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <Input type="date" className="w-40" defaultValue="2026-02-22" />
            <Button variant="outline" size="sm">
              <Filter className="mr-1 size-3.5" />
              Lọc
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Draw ID</TableHead>
                  <TableHead className="w-20">Kỳ</TableHead>
                  <TableHead className="w-20">Giờ</TableHead>
                  <TableHead className="w-28">Trạng thái</TableHead>
                  <TableHead>Kết quả (20 số)</TableHead>
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
                      <KenoDrawStatusBadge status={draw.status} />
                    </TableCell>
                    <TableCell>
                      {draw.result ? (
                        <div className="flex flex-wrap items-center gap-0.5 max-w-md">
                          {draw.result.winningNumbers.map((n) => (
                            <KenoNumberBall
                              key={n}
                              number={n}
                              size="sm"
                              variant={n > 40 ? "big" : "small"}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
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
