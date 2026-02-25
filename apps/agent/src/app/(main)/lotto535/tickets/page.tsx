"use client";

import {
  Eye,
  Filter,
  Search,
  Ticket,
  CircleDollarSign,
  Users,
  CalendarClock,
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
import { StatCard } from "@/components/games/lotto535/stat-card";

const TICKET_STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: "Đã thanh toán", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  completed: { label: "Hoàn tất", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  refunded: { label: "Hoàn tiền", className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  void: { label: "Vô hiệu", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const MOCK_TICKETS = [
  { ticketNo: "L535-20260222-00001", playerId: "P001", playerName: "Nguyễn Văn A", boards: 3, drawCount: 2, totalAmount: 120_000, status: "paid", createdAt: "2026-02-22 10:30", winAmount: 0 },
  { ticketNo: "L535-20260222-00002", playerId: "P002", playerName: "Trần Thị B", boards: 1, drawCount: 1, totalAmount: 10_000, status: "completed", createdAt: "2026-02-22 09:15", winAmount: 30_000 },
  { ticketNo: "L535-20260222-00003", playerId: "P003", playerName: "Lê Văn C", boards: 5, drawCount: 6, totalAmount: 1_800_000, status: "paid", createdAt: "2026-02-22 08:45", winAmount: 0 },
  { ticketNo: "L535-20260221-00015", playerId: "P004", playerName: "Phạm Thị D", boards: 2, drawCount: 1, totalAmount: 20_000, status: "completed", createdAt: "2026-02-21 20:10", winAmount: 100_000 },
  { ticketNo: "L535-20260221-00014", playerId: "P005", playerName: "Hoàng Văn E", boards: 1, drawCount: 3, totalAmount: 30_000, status: "paid", createdAt: "2026-02-21 19:50", winAmount: 0 },
];

export default function TenantTicketsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Lotto 5/35 – Quản lý vé
        </h1>
        <p className="text-sm text-muted-foreground">
          Xem và theo dõi vé của người chơi trong hệ thống đại lý.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng vé hôm nay" value="156" description="Tăng 23 so với hôm qua" icon={Ticket} trend={{ value: 17.3, isPositive: true }} />
        <StatCard title="Doanh thu hôm nay" value="15,6 tr" description="156 vé × trung bình 100k" icon={CircleDollarSign} trend={{ value: 12.1, isPositive: true }} />
        <StatCard title="Người chơi hoạt động" value="89" description="Trong 24h qua" icon={Users} />
        <StatCard title="Kỳ tiếp theo" value="21:00" description="2026-02-22 Kỳ 2" icon={CalendarClock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vé</CardTitle>
          <CardDescription>Tất cả vé Lotto 5/35 trong hệ thống đại lý</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Mã vé hoặc tên người chơi..." className="pl-8" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="paid">Đã TT</SelectItem>
                <SelectItem value="completed">Hoàn tất</SelectItem>
                <SelectItem value="refunded">Hoàn tiền</SelectItem>
                <SelectItem value="void">Vô hiệu</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" />
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
                  <TableHead className="text-center">Kỳ</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_TICKETS.map((t) => {
                  const st = TICKET_STATUS[t.status] ?? { label: t.status, className: "" };
                  return (
                    <TableRow key={t.ticketNo}>
                      <TableCell className="font-mono text-sm">{t.ticketNo}</TableCell>
                      <TableCell>{t.playerName}</TableCell>
                      <TableCell className="text-center">{t.boards}</TableCell>
                      <TableCell className="text-center">{t.drawCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.totalAmount.toLocaleString("vi-VN")} ₫</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.winAmount > 0 ? (
                          <span className="font-medium text-green-600 dark:text-green-400">{t.winAmount.toLocaleString("vi-VN")} ₫</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-0 ${st.className}`}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.createdAt}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-8">
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
