"use client";

import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Trophy,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import { JackpotDisplay } from "@/components/games/lotto535/jackpot-display";
import { LottoNumberBall } from "@/components/games/lotto535/lotto-number-ball";

const MOCK_RESULTS = [
  {
    drawId: "2026-02-22-001",
    drawDate: "22/02/2026",
    drawNo: 1,
    drawTime: "13:00",
    status: "settled",
    jackpotAmount: 3_200_000_000,
    result: { winningMain: [3, 12, 17, 24, 31] as const, winningSpecial: 7 },
    myTickets: 5,
    myWin: 60_000,
    prizes: [
      { tier: "Giải Năm", count: 2, amount: 60_000 },
    ],
  },
  {
    drawId: "2026-02-21-002",
    drawDate: "21/02/2026",
    drawNo: 2,
    drawTime: "21:00",
    status: "settled",
    jackpotAmount: 3_000_000_000,
    result: { winningMain: [1, 14, 19, 27, 33] as const, winningSpecial: 4 },
    myTickets: 3,
    myWin: 0,
    prizes: [],
  },
  {
    drawId: "2026-02-21-001",
    drawDate: "21/02/2026",
    drawNo: 1,
    drawTime: "13:00",
    status: "settled",
    jackpotAmount: 2_800_000_000,
    result: { winningMain: [5, 9, 22, 28, 35] as const, winningSpecial: 11 },
    myTickets: 8,
    myWin: 130_000,
    prizes: [
      { tier: "Giải Tư", count: 1, amount: 100_000 },
      { tier: "Giải Năm", count: 1, amount: 30_000 },
    ],
  },
];

export default function TenantResultsPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Lotto 5/35 – Kết quả
        </h1>
        <p className="text-sm text-muted-foreground">
          Xem kết quả các kỳ quay và đối soát vé trúng thưởng.
        </p>
      </div>

      {/* Current Jackpot Banner */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <CardContent className="flex flex-col items-center gap-2 py-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="size-8 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Jackpot hiện tại
              </p>
              <JackpotDisplay amount={3_450_000_000} size="lg" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4" />
            <span>Kỳ tiếp: 22/02/2026 – 21:00</span>
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select defaultValue="all">
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Lọc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả kỳ</SelectItem>
            <SelectItem value="won">Có trúng</SelectItem>
            <SelectItem value="lost">Không trúng</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-sm text-muted-foreground">Trang 1</span>
          <Button variant="outline" size="icon" className="size-8">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Result Cards */}
      <div className="space-y-4">
        {MOCK_RESULTS.map((draw) => (
          <Card key={draw.drawId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">
                    {draw.drawDate} – Kỳ {draw.drawNo} ({draw.drawTime})
                  </CardTitle>
                  <DrawStatusBadge status={draw.status} />
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Jackpot</p>
                  <JackpotDisplay amount={draw.jackpotAmount} size="sm" />
                </div>
              </div>
              <CardDescription className="font-mono text-xs">
                {draw.drawId}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Winning Numbers */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-2">
                  Kết quả:
                </span>
                {draw.result.winningMain.map((n) => (
                  <LottoNumberBall key={n} number={n} />
                ))}
                <span className="mx-1 text-lg text-muted-foreground">+</span>
                <LottoNumberBall
                  number={draw.result.winningSpecial}
                  variant="special"
                />
              </div>

              {/* My Performance */}
              <div className="flex items-center gap-6 rounded-lg bg-muted/50 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Số vé tham gia</p>
                  <p className="text-lg font-bold tabular-nums">{draw.myTickets}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tiền thắng</p>
                  <p className={`text-lg font-bold tabular-nums ${draw.myWin > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    {draw.myWin > 0
                      ? draw.myWin.toLocaleString("vi-VN") + " ₫"
                      : "—"}
                  </p>
                </div>
                {draw.prizes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {draw.prizes.map((p, i) => (
                      <Badge key={i} variant="secondary">
                        {p.tier}: {p.count} vé ({p.amount.toLocaleString("vi-VN")} ₫)
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
