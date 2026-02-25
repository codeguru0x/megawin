"use client";

import { Info } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Config state (sẽ được fetch từ API, đây là mock)
// ─────────────────────────────────────────────

const CONFIG = {
  play: {
    unitPrice: 10_000,
  },
  basicPrizes: {
    pick1: { 1: 20_000 },
    pick2: { 2: 90_000 },
    pick3: { 3: 200_000, 2: 20_000 },
    pick4: { 4: 400_000, 3: 50_000, 2: 10_000 },
    pick5: { 5: 4_400_000, 4: 150_000, 3: 10_000, 2: 10_000 },
    pick6: { 6: 12_500_000, 5: 450_000, 4: 40_000, 3: 10_000 },
    pick7: { 7: 40_000_000, 6: 1_200_000, 5: 100_000, 4: 20_000, 3: 10_000 },
    pick8: { 8: 200_000_000, 7: 5_000_000, 6: 500_000, 5: 50_000, 4: 10_000, 3: 10_000, 0: 10_000 },
    pick9: { 9: 800_000_000, 8: 12_000_000, 7: 1_500_000, 6: 150_000, 5: 30_000, 4: 10_000, 0: 10_000 },
    pick10: { 10: 2_000_000_000, 9: 150_000_000, 8: 8_000_000, 7: 710_000, 6: 80_000, 5: 20_000, 0: 10_000 },
  } as Record<string, Record<number, number>>,
  bigSmallPrizes: {
    big13Plus: 26_000,
    big1112: 10_000,
    draw: 26_000,
    small1112: 10_000,
    small13Plus: 26_000,
  },
  evenOddPrizes: {
    even15Plus: 200_000,
    even1314: 40_000,
    even1112: 20_000,
    draw: 20_000,
    odd1112: 20_000,
    odd1314: 40_000,
    odd15Plus: 200_000,
  },
  payoutCaps: {
    pick8MaxPerDraw: 10_000_000_000,
    pick8MaxSetsForFixed: 50,
    pick9MaxPerDraw: 10_000_000_000,
    pick9MaxSetsForFixed: 12,
    pick10MaxPerDraw: 10_000_000_000,
    pick10MaxSetsForFixed: 5,
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const PICK_COUNTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MATCH_COUNTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

function formatPrize(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(0)} Tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString("vi-VN")} tr`;
  if (amount >= 1_000) return amount.toLocaleString("vi-VN");
  return String(amount);
}

function formatVNDFull(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

function getBasicPrize(pick: number, match: number): number | undefined {
  return CONFIG.basicPrizes[`pick${pick}`]?.[match];
}

interface PayoutCapInfo {
  fixedPrize: number;
  maxPerDraw: number;
  maxSetsForFixed: number;
}

function getPayoutCap(pick: number, match: number): PayoutCapInfo | null {
  if (pick === 10 && match === 10) {
    return {
      fixedPrize: CONFIG.basicPrizes.pick10![10]!,
      maxPerDraw: CONFIG.payoutCaps.pick10MaxPerDraw,
      maxSetsForFixed: CONFIG.payoutCaps.pick10MaxSetsForFixed,
    };
  }
  if (pick === 9 && match === 9) {
    return {
      fixedPrize: CONFIG.basicPrizes.pick9![9]!,
      maxPerDraw: CONFIG.payoutCaps.pick9MaxPerDraw,
      maxSetsForFixed: CONFIG.payoutCaps.pick9MaxSetsForFixed,
    };
  }
  if (pick === 8 && match === 8) {
    return {
      fixedPrize: CONFIG.basicPrizes.pick8![8]!,
      maxPerDraw: CONFIG.payoutCaps.pick8MaxPerDraw,
      maxSetsForFixed: CONFIG.payoutCaps.pick8MaxSetsForFixed,
    };
  }
  return null;
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function KenoPrizeTablePage() {
  const caps = [
    { pick: 10, match: 10, ...getPayoutCap(10, 10)! },
    { pick: 9, match: 9, ...getPayoutCap(9, 9)! },
    { pick: 8, match: 8, ...getPayoutCap(8, 8)! },
  ];

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Keno – Bảng giải thưởng
        </h1>
        <p className="text-sm text-muted-foreground">
          Cơ cấu giải thưởng cho cách chơi cơ bản và bổ sung (mệnh giá{" "}
          {formatVNDFull(CONFIG.play.unitPrice)}).
          Giá trị đọc từ cấu hình hệ thống.
        </p>
      </div>

      {/* Basic Prize Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cách chơi cơ bản – Chọn số</CardTitle>
          <CardDescription>
            Người chơi chọn 1-10 số từ 01-80. Hệ thống quay 20 số. Giải thưởng tùy thuộc số lượng
            số chọn và số trùng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm w-28">
                    <div className="text-xs">
                      <div className="font-bold">Trùng ↓</div>
                      <div className="text-muted-foreground">Chọn →</div>
                    </div>
                  </TableHead>
                  {PICK_COUNTS.map((pick) => (
                    <TableHead key={pick} className="text-center w-24">
                      <Badge variant="outline" className="font-bold">
                        {pick}
                      </Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MATCH_COUNTS.map((match) => (
                  <TableRow key={match}>
                    <TableCell className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm font-bold tabular-nums">
                      {match}
                    </TableCell>
                    {PICK_COUNTS.map((pick) => {
                      const prize = getBasicPrize(pick, match);
                      const cap = getPayoutCap(pick, match);
                      return (
                        <TableCell
                          key={`${pick}-${match}`}
                          className={cn(
                            "text-center tabular-nums text-sm",
                            prize && prize >= 1_000_000_000 && "font-bold text-red-600 dark:text-red-400",
                            prize && prize >= 100_000_000 && prize < 1_000_000_000 && "font-bold text-orange-600 dark:text-orange-400",
                            prize && prize >= 1_000_000 && prize < 100_000_000 && "font-semibold text-amber-600 dark:text-amber-400",
                            !prize && "text-muted-foreground/30"
                          )}
                        >
                          {prize ? (
                            cap ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dashed underline-offset-2">
                                      {formatPrize(prize)}
                                      <span className="text-red-500 ml-0.5">*</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                                    <p className="font-semibold">Giới hạn trả thưởng mỗi kỳ</p>
                                    <p>
                                      ≤{cap.maxSetsForFixed} bộ: {formatPrize(cap.fixedPrize)}/bộ
                                    </p>
                                    <p>
                                      &gt;{cap.maxSetsForFixed} bộ: {formatPrize(cap.maxPerDraw)} ÷ số bộ trúng
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span>{formatPrize(prize)}</span>
                            )
                          ) : (
                            ""
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Payout caps legend */}
          <div className="mt-3 space-y-2">
            <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-red-500 font-bold text-sm">*</span>
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Giải có giới hạn trả thưởng mỗi kỳ quay (từ cấu hình hệ thống)
                </span>
              </div>
              <div className="space-y-1">
                {caps.map((c) => (
                  <p key={c.pick} className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    <strong>Bậc {c.pick} trùng {c.match}:</strong>{" "}
                    ≤{c.maxSetsForFixed} bộ → {formatPrize(c.fixedPrize)}/bộ
                    {" · "}
                    &gt;{c.maxSetsForFixed} bộ → {formatPrize(c.maxPerDraw)} ÷ số bộ trúng
                  </p>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side Bet Prizes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Big/Small */}
        <Card>
          <CardHeader>
            <CardTitle>Cách chơi bổ sung – Lớn/Nhỏ</CardTitle>
            <CardDescription>
              Dựa vào 20 số quay: đếm số &quot;lớn&quot; (41-80) và &quot;nhỏ&quot; (1-40).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Cược</TableHead>
                    <TableHead>Xác định kết quả</TableHead>
                    <TableHead className="w-36 text-right">Giải thưởng (đ)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([
                    { bet: "Lớn", condition: "Từ 13 số trở lên từ 41 đến 80", amount: CONFIG.bigSmallPrizes.big13Plus, rowSpan: 2 },
                    { bet: null, condition: "11 hoặc 12 số từ 41 đến 80", amount: CONFIG.bigSmallPrizes.big1112 },
                    { bet: "Hoà Lớn Nhỏ", condition: "10 số từ 01 đến 40 và 10 số từ 41 đến 80", amount: CONFIG.bigSmallPrizes.draw },
                    { bet: "Nhỏ", condition: "11 hoặc 12 số từ 01 đến 40", amount: CONFIG.bigSmallPrizes.small1112, rowSpan: 2 },
                    { bet: null, condition: "Từ 13 số trở lên từ 01 đến 40", amount: CONFIG.bigSmallPrizes.small13Plus },
                  ] as const).map((row, idx) => (
                    <TableRow key={idx}>
                      {row.bet !== null && (
                        <TableCell
                          rowSpan={"rowSpan" in row ? row.rowSpan : undefined}
                          className="font-medium align-top"
                        >
                          {row.bet}
                        </TableCell>
                      )}
                      <TableCell>{row.condition}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.amount > CONFIG.play.unitPrice && "font-semibold text-emerald-600"
                        )}
                      >
                        {row.amount.toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Even/Odd */}
        <Card>
          <CardHeader>
            <CardTitle>Cách chơi bổ sung – Chẵn/Lẻ</CardTitle>
            <CardDescription>
              Dựa vào 20 số quay: đếm số chẵn và lẻ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Cược</TableHead>
                    <TableHead>Xác định kết quả</TableHead>
                    <TableHead className="w-36 text-right">Giải thưởng (đ)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([
                    { bet: "Chẵn", condition: "Từ 15 số trở lên là số chẵn", amount: CONFIG.evenOddPrizes.even15Plus, rowSpan: 2 },
                    { bet: null, condition: "13 hoặc 14 số là số chẵn", amount: CONFIG.evenOddPrizes.even1314 },
                    { bet: "Chẵn 11-12", condition: "11 hoặc 12 số là số chẵn", amount: CONFIG.evenOddPrizes.even1112 },
                    { bet: "Hoà", condition: "10 số chẵn và 10 số lẻ", amount: CONFIG.evenOddPrizes.draw },
                    { bet: "Lẻ 11-12", condition: "11 hoặc 12 số là số lẻ", amount: CONFIG.evenOddPrizes.odd1112 },
                    { bet: "Lẻ", condition: "13 hoặc 14 số là số lẻ", amount: CONFIG.evenOddPrizes.odd1314, rowSpan: 2 },
                    { bet: null, condition: "Từ 15 số trở lên là số lẻ", amount: CONFIG.evenOddPrizes.odd15Plus },
                  ] as const).map((row, idx) => (
                    <TableRow key={idx}>
                      {row.bet !== null && (
                        <TableCell
                          rowSpan={'rowSpan' in row ? row.rowSpan : undefined}
                          className="font-medium align-top"
                        >
                          {row.bet}
                        </TableCell>
                      )}
                      <TableCell>{row.condition}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          row.amount >= 200_000 && "font-bold text-amber-600",
                          row.amount >= 40_000 && row.amount < 200_000 && "font-semibold",
                        )}
                      >
                        {row.amount.toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
