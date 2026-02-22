"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Info,
  Percent,
  Save,
  Settings2,
  Shield,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Prize table data (will be fetched from API)
// ─────────────────────────────────────────────

const PICK_LABELS: Array<{ pick: number; matchCounts: number[] }> = [
  { pick: 1, matchCounts: [1] },
  { pick: 2, matchCounts: [2] },
  { pick: 3, matchCounts: [3, 2] },
  { pick: 4, matchCounts: [4, 3, 2] },
  { pick: 5, matchCounts: [5, 4, 3, 2] },
  { pick: 6, matchCounts: [6, 5, 4, 3] },
  { pick: 7, matchCounts: [7, 6, 5, 4, 3] },
  { pick: 8, matchCounts: [8, 7, 6, 5, 4, 3, 0] },
  { pick: 9, matchCounts: [9, 8, 7, 6, 5, 4, 0] },
  { pick: 10, matchCounts: [10, 9, 8, 7, 6, 5, 0] },
];

const DEFAULT_PRIZES: Record<string, Record<number, string>> = {
  pick1: { 1: "20,000" },
  pick2: { 2: "90,000" },
  pick3: { 3: "200,000", 2: "20,000" },
  pick4: { 4: "400,000", 3: "50,000", 2: "10,000" },
  pick5: { 5: "4,400,000", 4: "150,000", 3: "10,000", 2: "10,000" },
  pick6: { 6: "12,500,000", 5: "450,000", 4: "40,000", 3: "10,000" },
  pick7: { 7: "40,000,000", 6: "1,200,000", 5: "100,000", 4: "20,000", 3: "10,000" },
  pick8: { 8: "200,000,000", 7: "5,000,000", 6: "500,000", 5: "50,000", 4: "10,000", 3: "10,000", 0: "10,000" },
  pick9: { 9: "800,000,000", 8: "12,000,000", 7: "1,500,000", 6: "150,000", 5: "30,000", 4: "10,000", 0: "10,000" },
  pick10: { 10: "2,000,000,000", 9: "150,000,000", 8: "8,000,000", 7: "710,000", 6: "80,000", 5: "20,000", 0: "10,000" },
};

function isCapped(pick: number, match: number): boolean {
  return (pick === 10 && match === 10) || (pick === 9 && match === 9) || (pick === 8 && match === 8);
}

// ─────────────────────────────────────────────
// Pick group component (accordion for each bậc)
// ─────────────────────────────────────────────

function PickPrizeGroup({ pick, matchCounts }: { pick: number; matchCounts: number[] }) {
  const [open, setOpen] = useState(pick >= 8);
  const prizes = DEFAULT_PRIZES[`pick${pick}`]!;
  const hasCap = matchCounts.some((m) => isCapped(pick, m));

  const badgeColor =
    pick >= 9 ? "bg-red-500" :
    pick >= 7 ? "bg-orange-500" :
    pick >= 5 ? "bg-amber-500" :
    "bg-slate-500";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
            open && "bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2">
            <Badge variant="default" className={cn("text-white text-xs", badgeColor)}>
              Bậc {pick}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Chọn {pick} số &middot; {matchCounts.length} mức thưởng
            </span>
            {hasCap && (
              <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 dark:text-red-400">
                Có giới hạn
              </Badge>
            )}
          </div>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 pl-1">
          {matchCounts.map((match) => {
            const value = prizes[match] ?? "";
            const capped = isCapped(pick, match);
            return (
              <div
                key={match}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-1.5",
                  capped && "bg-red-50 dark:bg-red-950/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded bg-muted text-xs font-bold tabular-nums">
                    {match}
                  </span>
                  <Label className="text-xs">
                    Trùng {match}/{pick} số
                    {match === 0 && " (không trúng)"}
                  </Label>
                  {capped && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Shield className="size-3.5 text-red-500 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          Giải này có giới hạn trả thưởng mỗi kỳ (xem mục Giới hạn)
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <Input
                  type="text"
                  defaultValue={value}
                  className={cn(
                    "w-36 text-right tabular-nums text-sm",
                    capped && "border-red-300 dark:border-red-700"
                  )}
                />
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function KenoConfigPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Keno – Cấu hình game
        </h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình toàn cục cho game Keno. Chỉ admin MegaWin được chỉnh sửa.
        </p>
      </div>

      {/* Row 1: Financial Rates + Play Rules */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Percent className="size-5 text-blue-500" />
              <CardTitle>Tỷ lệ tài chính</CardTitle>
            </div>
            <CardDescription>
              Hoa hồng đại lý và tỷ lệ thu công ty
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultCommission">Hoa hồng mặc định (%)</Label>
              <Input id="defaultCommission" type="number" defaultValue="20" step="0.1" />
              <p className="text-xs text-muted-foreground">
                Áp dụng cho tenant chưa có override riêng
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minCommission">Hoa hồng tối thiểu (%)</Label>
              <Input id="minCommission" type="number" defaultValue="10" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyRate">Tỷ lệ công ty (%)</Label>
              <Input id="companyRate" type="number" defaultValue="15" step="0.1" />
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu tỷ lệ
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="size-5 text-violet-500" />
              <CardTitle>Luật chơi</CardTitle>
            </div>
            <CardDescription>
              Cấu hình mệnh giá, lịch quay và giới hạn
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Mệnh giá (VND)</Label>
                <Input type="text" defaultValue="10,000" />
              </div>
              <div className="space-y-2">
                <Label>Đơn vị tiền</Label>
                <Input type="text" defaultValue="VND" disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Max panels / vé</Label>
                <Input type="number" defaultValue="2" />
              </div>
              <div className="space-y-2">
                <Label>Max kỳ liên tiếp</Label>
                <Input type="number" defaultValue="20" />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Khoảng cách kỳ (phút)</Label>
                <Input type="number" defaultValue="10" />
              </div>
              <div className="space-y-2">
                <Label>Đóng bán trước (phút)</Label>
                <Input type="number" defaultValue="5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kỳ đầu tiên</Label>
                <Input type="text" defaultValue="06:00" className="w-24" />
              </div>
              <div className="space-y-2">
                <Label>Kỳ cuối cùng</Label>
                <Input type="text" defaultValue="21:55" className="w-24" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input type="text" defaultValue="Asia/Ho_Chi_Minh" disabled />
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu luật chơi
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Row 2: Basic Prize Table – full width */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            <CardTitle>Giải thưởng cơ bản – Chọn số</CardTitle>
          </div>
          <CardDescription>
            Cấu hình giá trị giải thưởng cho từng bậc (1-10 số) theo số lượng số trùng.
            Mỗi bậc có thể mở rộng để chỉnh sửa. Giá trị tính trên mệnh giá 10.000đ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Quick-view table (read-only summary) */}
          <div className="mb-4 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm w-20">
                    <div className="text-xs">
                      <div className="font-bold">Trùng ↓</div>
                      <div className="text-muted-foreground">Chọn →</div>
                    </div>
                  </TableHead>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((pick) => (
                    <TableHead key={pick} className="text-center w-[88px] px-1">
                      <Badge variant="outline" className="font-bold text-[10px]">
                        {pick}
                      </Badge>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((match) => (
                  <TableRow key={match}>
                    <TableCell className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm font-bold tabular-nums text-xs">
                      {match}
                    </TableCell>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((pick) => {
                      const value = DEFAULT_PRIZES[`pick${pick}`]?.[match];
                      const capped = isCapped(pick, match);
                      return (
                        <TableCell
                          key={`${pick}-${match}`}
                          className={cn(
                            "text-center tabular-nums text-[11px] px-1",
                            value && "text-foreground",
                            !value && "text-muted-foreground/20",
                            capped && "bg-red-50 dark:bg-red-950/20"
                          )}
                        >
                          {value ? (
                            <span>
                              {value}
                              {capped && <span className="text-red-500">*</span>}
                            </span>
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

          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-red-500 font-bold">*</span> Giải có giới hạn trả thưởng mỗi kỳ
            (cấu hình ở mục <strong>Giới hạn trả thưởng</strong> bên dưới).
            Mở từng bậc để chỉnh sửa giá trị:
          </p>

          {/* Editable accordion per pick */}
          <div className="grid gap-2 lg:grid-cols-2">
            {/* Bậc cao (10-6) bên trái */}
            <div className="space-y-2">
              {PICK_LABELS.filter((p) => p.pick >= 6)
                .sort((a, b) => b.pick - a.pick)
                .map((p) => (
                  <PickPrizeGroup key={p.pick} pick={p.pick} matchCounts={p.matchCounts} />
                ))}
            </div>
            {/* Bậc thấp (5-1) bên phải */}
            <div className="space-y-2">
              {PICK_LABELS.filter((p) => p.pick < 6)
                .sort((a, b) => b.pick - a.pick)
                .map((p) => (
                  <PickPrizeGroup key={p.pick} pick={p.pick} matchCounts={p.matchCounts} />
                ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t">
          <Button>
            <Save className="mr-2 size-4" />
            Lưu giải thưởng cơ bản
          </Button>
        </CardFooter>
      </Card>

      {/* Row 3: Payout Caps + Side Bet Prizes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payout Caps */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-red-500" />
              <CardTitle>Giới hạn trả thưởng</CardTitle>
            </div>
            <CardDescription>
              Giới hạn tổng giải thưởng mỗi kỳ cho bậc cao (8, 9, 10)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Quy định:</strong> Nếu số bộ trúng vượt ngưỡng, tổng giải tối đa / kỳ
                sẽ được chia đều cho số bộ trúng thay vì trả giải cố định.
              </p>
            </div>

            <div className="space-y-3">
              {([
                { pick: 10, badge: "bg-red-500", fixedPrize: "2 tỷ", maxSets: 5, maxPerDraw: "10,000,000,000" },
                { pick: 9, badge: "bg-orange-500", fixedPrize: "800 tr", maxSets: 12, maxPerDraw: "10,000,000,000" },
                { pick: 8, badge: "bg-amber-500", fixedPrize: "200 tr", maxSets: 50, maxPerDraw: "10,000,000,000" },
              ] as const).map((cap) => (
                <div key={cap.pick} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className={cn("text-white", cap.badge)}>
                      Bậc {cap.pick}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Trùng {cap.pick}/{cap.pick} số
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tổng giải tối đa / kỳ (VND)</Label>
                      <Input type="text" defaultValue={cap.maxPerDraw} className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ngưỡng số bộ trả cố định</Label>
                      <Input type="number" defaultValue={cap.maxSets} className="text-sm" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ≤{cap.maxSets} bộ: {cap.fixedPrize}/bộ &middot;
                    &gt;{cap.maxSets} bộ: tổng giải tối đa ÷ số bộ trúng
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu giới hạn
            </Button>
          </CardFooter>
        </Card>

        {/* Side Bet Prizes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="size-5 text-emerald-500" />
              <CardTitle>Giải thưởng bổ sung</CardTitle>
            </div>
            <CardDescription>
              Giải thưởng cho cách chơi Lớn/Nhỏ và Chẵn/Lẻ (Panel C)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Big/Small */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-sm font-semibold">Cược Lớn/Nhỏ</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p>
                        Dựa vào 20 số quay: đếm số lượng số &quot;lớn&quot; (41-80) và &quot;nhỏ&quot; (1-40).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Lớn (≥13 số 41-80)", key: "big13Plus", value: "26,000" },
                  { label: "Lớn (11-12 số 41-80)", key: "big1112", value: "10,000" },
                  { label: "Hoà (10+10)", key: "bsDraw", value: "26,000" },
                  { label: "Nhỏ (11-12 số 1-40)", key: "small1112", value: "10,000" },
                  { label: "Nhỏ (≥13 số 1-40)", key: "small13Plus", value: "26,000" },
                ].map((p) => (
                  <div key={p.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <Label className="text-xs">{p.label}</Label>
                    <Input type="text" defaultValue={p.value} className="w-28 text-right tabular-nums text-sm" />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Even/Odd */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Label className="text-sm font-semibold">Cược Chẵn/Lẻ</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p>
                        Dựa vào 20 số quay: đếm số chẵn và số lẻ trong 20 số.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Chẵn (≥15 số chẵn)", key: "even15", value: "200,000" },
                  { label: "Chẵn (13-14 số chẵn)", key: "even1314", value: "40,000" },
                  { label: "Chẵn 11-12", key: "even1112", value: "20,000" },
                  { label: "Hoà (10+10)", key: "eoDraw", value: "20,000" },
                  { label: "Lẻ 11-12", key: "odd1112", value: "20,000" },
                  { label: "Lẻ (13-14 số lẻ)", key: "odd1314", value: "40,000" },
                  { label: "Lẻ (≥15 số lẻ)", key: "odd15", value: "200,000" },
                ].map((p) => (
                  <div key={p.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <Label className="text-xs">{p.label}</Label>
                    <Input type="text" defaultValue={p.value} className="w-28 text-right tabular-nums text-sm" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu giải thưởng bổ sung
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
