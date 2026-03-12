"use client";

import { Trophy, RefreshCcw, AlertTriangle, ArrowUpDown, Dices, Shield, Info } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND, formatCurrency } from "@megawin/shared/utils/number";

import { useKenoGameConfig, type KenoGameConfig } from "../config/_lib/use-game-config";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PICK_COUNTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MATCH_COUNTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// formatPrize: dùng formatCurrency từ shared — compact: tỷ/triệu/k
function formatPrize(amount: number): string {
  return formatCurrency(amount, { billion: "tỷ", million: "tr", thousand: "k", decimals: 1 });
}

function getBasicPrize(config: KenoGameConfig, pick: number, match: number): number | undefined {
  return config.basicPrizes[`pick${pick}`]?.[match];
}

interface PayoutCapInfo {
  fixedPrize: number;
  maxPerDraw: number;
  maxSetsForFixed: number;
}

function getPayoutCap(config: KenoGameConfig, pick: number, match: number): PayoutCapInfo | null {
  const prize = config.basicPrizes[`pick${pick}`]?.[match];
  if (!prize) return null;

  if (pick === 10 && match === 10) {
    return {
      fixedPrize: prize,
      maxPerDraw: config.payoutCaps.pick10MaxPerDraw,
      maxSetsForFixed: config.payoutCaps.pick10MaxSetsForFixed,
    };
  }
  if (pick === 9 && match === 9) {
    return {
      fixedPrize: prize,
      maxPerDraw: config.payoutCaps.pick9MaxPerDraw,
      maxSetsForFixed: config.payoutCaps.pick9MaxSetsForFixed,
    };
  }
  if (pick === 8 && match === 8) {
    return {
      fixedPrize: prize,
      maxPerDraw: config.payoutCaps.pick8MaxPerDraw,
      maxSetsForFixed: config.payoutCaps.pick8MaxSetsForFixed,
    };
  }
  return null;
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function KenoPrizeTablePage() {
  const { data: config, isLoading, isError, error, refetch } = useKenoGameConfig();

  if (isLoading) return <PageSkeleton />;

  if (isError || !config) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Không thể tải cấu hình game</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Lỗi không xác định"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCcw className="mr-2 size-3.5" />
          Thử lại
        </Button>
      </div>
    );
  }

  const caps = [
    { pick: 10, match: 10, ...getPayoutCap(config, 10, 10)! },
    { pick: 9, match: 9, ...getPayoutCap(config, 9, 9)! },
    { pick: 8, match: 8, ...getPayoutCap(config, 8, 8)! },
  ];

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-amber-600 shadow-sm">
            <Trophy className="size-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Keno — Bảng giải thưởng
            </h1>
            <p className="text-xs text-muted-foreground">
              Dữ liệu trực tiếp từ cấu hình hệ thống · Mệnh giá {formatVND(config.play.unitPrice)}
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className="hidden shrink-0 gap-1.5 border-amber-200 bg-amber-100 font-mono text-[11px] text-amber-700 tabular-nums dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400 sm:flex"
        >
          v{config.version}
        </Badge>
      </div>

      {/* ── Basic Prize Table ── */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
              <ArrowUpDown className="size-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Cách chơi cơ bản — Chọn số</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Chọn 1–10 số từ 01–80. Quay 20 số mỗi kỳ. Giải thưởng theo số trùng.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="sticky left-0 z-10 w-20 bg-muted/80 backdrop-blur-sm">
                    <div className="text-[10px] uppercase tracking-wider">
                      <div className="font-bold text-foreground">Trùng</div>
                      <div className="text-muted-foreground">Chọn →</div>
                    </div>
                  </TableHead>
                  {PICK_COUNTS.map((pick) => (
                    <TableHead key={pick} className="w-24 text-center">
                      <Badge variant="outline" className="font-bold tabular-nums">
                        {pick}
                      </Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {MATCH_COUNTS.map((match) => (
                  <TableRow key={match} className="hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-muted/60 text-center font-bold tabular-nums backdrop-blur-sm">
                      {match}
                    </TableCell>
                    {PICK_COUNTS.map((pick) => {
                      const prize = getBasicPrize(config, pick, match);
                      const cap = getPayoutCap(config, pick, match);
                      return (
                        <TableCell
                          key={`${pick}-${match}`}
                          className={cn(
                            "text-center text-sm tabular-nums",
                            prize &&
                              prize >= 1_000_000_000 &&
                              "font-bold text-red-600 dark:text-red-400",
                            prize &&
                              prize >= 100_000_000 &&
                              prize < 1_000_000_000 &&
                              "font-bold text-orange-600 dark:text-orange-400",
                            prize &&
                              prize >= 1_000_000 &&
                              prize < 100_000_000 &&
                              "font-semibold text-amber-600 dark:text-amber-400",
                            !prize && "text-muted-foreground/30",
                          )}
                        >
                          {prize ? (
                            cap ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dashed underline-offset-2">
                                      {formatPrize(prize)}
                                      <span className="ml-0.5 text-red-500">*</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
                                    <p className="font-semibold">Giới hạn trả thưởng mỗi kỳ</p>
                                    <p>
                                      ≤{cap.maxSetsForFixed} bộ: {formatPrize(cap.fixedPrize)}/bộ
                                    </p>
                                    <p>
                                      &gt;{cap.maxSetsForFixed} bộ: {formatPrize(cap.maxPerDraw)} ÷
                                      số bộ trúng
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              formatPrize(prize)
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
          <div className="border-t px-6 py-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <span className="mr-1 font-bold text-red-500">*</span>
                  Giải có giới hạn trả thưởng mỗi kỳ quay
                </p>
                {caps.map((c) => (
                  <p
                    key={c.pick}
                    className="text-xs leading-relaxed text-amber-700 dark:text-amber-400"
                  >
                    <strong>
                      Bậc {c.pick} trùng {c.match}:
                    </strong>{" "}
                    ≤{c.maxSetsForFixed} bộ → {formatPrize(c.fixedPrize)}/bộ
                    {" · "}&gt;{c.maxSetsForFixed} bộ → {formatPrize(c.maxPerDraw)} ÷ số bộ trúng
                  </p>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Side Bet Prizes ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Big/Small */}
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Dices className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Lớn / Nhỏ</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Đếm số lớn (41–80) và nhỏ (1–40) trong 20 số quay
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-32 text-[10px] uppercase tracking-wider">Cược</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Xác định kết quả
                  </TableHead>
                  <TableHead className="w-32 text-right text-[10px] uppercase tracking-wider">
                    Giải thưởng
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    {
                      bet: "Lớn",
                      condition: "≥13 số từ 41–80",
                      amount: config.bigSmallPrizes.big13Plus,
                      rowSpan: 2,
                    },
                    {
                      bet: null,
                      condition: "11 hoặc 12 số từ 41–80",
                      amount: config.bigSmallPrizes.big1112,
                    },
                    {
                      bet: "Hoà",
                      condition: "10 số mỗi bên",
                      amount: config.bigSmallPrizes.draw,
                    },
                    {
                      bet: "Nhỏ",
                      condition: "11 hoặc 12 số từ 01–40",
                      amount: config.bigSmallPrizes.small1112,
                      rowSpan: 2,
                    },
                    {
                      bet: null,
                      condition: "≥13 số từ 01–40",
                      amount: config.bigSmallPrizes.small13Plus,
                    },
                  ] as const
                ).map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30">
                    {row.bet !== null && (
                      <TableCell
                        rowSpan={"rowSpan" in row ? row.rowSpan : undefined}
                        className="align-top font-medium"
                      >
                        {row.bet}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{row.condition}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.amount > config.play.unitPrice &&
                          "font-semibold text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {formatVND(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Even/Odd */}
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Shield className="size-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Chẵn / Lẻ</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Đếm số chẵn và lẻ trong 20 số quay
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-28 text-[10px] uppercase tracking-wider">Cược</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Xác định kết quả
                  </TableHead>
                  <TableHead className="w-32 text-right text-[10px] uppercase tracking-wider">
                    Giải thưởng
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    {
                      bet: "Chẵn",
                      condition: "≥15 số chẵn",
                      amount: config.evenOddPrizes.even15Plus,
                      rowSpan: 2,
                    },
                    {
                      bet: null,
                      condition: "13 hoặc 14 số chẵn",
                      amount: config.evenOddPrizes.even1314,
                    },
                    {
                      bet: "Chẵn 11-12",
                      condition: "11 hoặc 12 số chẵn",
                      amount: config.evenOddPrizes.even1112,
                    },
                    {
                      bet: "Hoà",
                      condition: "10 chẵn + 10 lẻ",
                      amount: config.evenOddPrizes.draw,
                    },
                    {
                      bet: "Lẻ 11-12",
                      condition: "11 hoặc 12 số lẻ",
                      amount: config.evenOddPrizes.odd1112,
                    },
                    {
                      bet: "Lẻ",
                      condition: "13 hoặc 14 số lẻ",
                      amount: config.evenOddPrizes.odd1314,
                      rowSpan: 2,
                    },
                    {
                      bet: null,
                      condition: "≥15 số lẻ",
                      amount: config.evenOddPrizes.odd15Plus,
                    },
                  ] as const
                ).map((row, idx) => (
                  <TableRow key={idx} className="hover:bg-muted/30">
                    {row.bet !== null && (
                      <TableCell
                        rowSpan={"rowSpan" in row ? row.rowSpan : undefined}
                        className="align-top font-medium"
                      >
                        {row.bet}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{row.condition}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.amount >= 200_000 && "font-bold text-amber-600 dark:text-amber-400",
                        row.amount >= 40_000 && row.amount < 200_000 && "font-semibold",
                      )}
                    >
                      {formatVND(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page Skeleton (layout-preserving)
// ─────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>

      {/* Basic Table Card */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2.5 border-b px-6 py-4">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="p-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-2 border-b px-4 py-2.5 last:border-0">
              <Skeleton className="h-5 w-10 shrink-0" />
              {Array.from({ length: 10 }).map((_, j) => (
                <Skeleton key={j} className="h-5 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Side Bet Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card">
            <div className="flex items-center gap-2.5 border-b px-6 py-4">
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="p-0">
              {Array.from({ length: 5 }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-center justify-between border-b px-6 py-3 last:border-0"
                >
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
