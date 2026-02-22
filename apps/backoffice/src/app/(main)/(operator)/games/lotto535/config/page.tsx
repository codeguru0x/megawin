"use client";

import {
  Banknote,
  Clock,
  DollarSign,
  Info,
  Layers,
  Percent,
  Save,
  Settings2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminConfigPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Lotto 5/35 – Cấu hình game
        </h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình toàn cục cho game Lotto 5/35. Chỉ admin MegaWin được chỉnh
          sửa.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Jackpot Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              <CardTitle>Cấu hình Jackpot</CardTitle>
            </div>
            <CardDescription>
              Quản lý seed, ngưỡng chia và tỷ lệ chia Jackpot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seedAmount">Seed Amount (VND)</Label>
              <Input
                id="seedAmount"
                type="text"
                defaultValue="1,000,000,000"
                placeholder="1.000.000.000"
              />
              <p className="text-xs text-muted-foreground">
                Số tiền khởi điểm khi mở kỳ Jackpot mới
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="splitThreshold">Ngưỡng chia Jackpot (VND)</Label>
              <Input
                id="splitThreshold"
                type="text"
                defaultValue="12,000,000,000"
                placeholder="12.000.000.000"
              />
              <p className="text-xs text-muted-foreground">
                Khi Jackpot &ge; ngưỡng và không ai trúng → kỳ 21h hôm sau là kỳ
                chia giải
              </p>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">
                  Quy tắc chia Jackpot
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p>
                        Khi Jackpot vượt ngưỡng và không ai trúng Độc Đắc, phần
                        Jackpot được chia cho các giải từ Nhất đến Năm. Nếu hạng
                        nào không có người trúng, phần đó chia đều cho các hạng
                        còn lại (trừ Khuyến Khích).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Giải Nhất */}
              <div className="rounded-lg border bg-amber-50 p-3 dark:bg-amber-950/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-amber-500 text-white">
                      Giải Nhất
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Hạng cao nhất – nhận thêm phần dư làm tròn
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm whitespace-nowrap">
                    Phần chia = Jackpot ÷
                  </span>
                  <Input
                    id="tier1Divisor"
                    type="number"
                    defaultValue="3"
                    min="1"
                    className="h-8 w-20 text-center font-semibold"
                  />
                  <span className="text-sm whitespace-nowrap">÷ số giải</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Công thức: <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    (Jackpot / {"{tỷ lệ}"}) / số người trúng
                  </code>
                </p>
              </div>

              {/* Giải Nhì → Năm */}
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">Giải Nhì</Badge>
                  <Badge variant="secondary">Giải Ba</Badge>
                  <Badge variant="secondary">Giải Tư</Badge>
                  <Badge variant="secondary">Giải Năm</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm whitespace-nowrap">
                    Mỗi giải = Jackpot ÷
                  </span>
                  <Input
                    id="tier2to5Divisor"
                    type="number"
                    defaultValue="6"
                    min="1"
                    className="h-8 w-20 text-center font-semibold"
                    disabled
                  />
                  <span className="text-sm whitespace-nowrap">÷ số giải</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Công thức: <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    (Jackpot / 6) / số người trúng mỗi hạng
                  </code>
                  {" "}— làm tròn xuống đơn vị 5.000đ
                </p>
              </div>

              {/* Giải Khuyến Khích */}
              <div className="rounded-lg border border-dashed p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Khuyến Khích</Badge>
                  <span className="text-xs text-muted-foreground">
                    Không tham gia chia Jackpot
                  </span>
                </div>
              </div>

              <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950/20">
                <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                  <strong>Lưu ý:</strong> Giá trị chia Jackpot của các hạng giải
                  (Nhì→Năm) được làm tròn xuống đến đơn vị 5.000đ. Phần dư do
                  làm tròn được cộng dồn vào hạng Giải cao nhất có người trúng.
                  Nếu tất cả hạng (Nhất→Năm) đều không có người trúng, Jackpot
                  tích lũy sang kỳ tiếp theo.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roundingUnit">Đơn vị làm tròn (VND)</Label>
              <Input
                id="roundingUnit"
                type="text"
                defaultValue="5,000"
              />
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu Jackpot
            </Button>
          </CardFooter>
        </Card>

        {/* Financial Rates */}
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
              <Label htmlFor="defaultCommission">
                Hoa hồng mặc định (%)
              </Label>
              <Input
                id="defaultCommission"
                type="number"
                defaultValue="20"
                step="0.1"
              />
              <p className="text-xs text-muted-foreground">
                Áp dụng cho tenant chưa có override riêng
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyRate">Tỷ lệ công ty (%)</Label>
              <Input
                id="companyRate"
                type="number"
                defaultValue="15"
                step="0.1"
              />
              <p className="text-xs text-muted-foreground">
                Phần doanh thu công ty giữ lại
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu tỷ lệ
            </Button>
          </CardFooter>
        </Card>

        {/* Default Prizes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="size-5 text-emerald-500" />
              <CardTitle>Giải thưởng cố định</CardTitle>
            </div>
            <CardDescription>
              Giá trị giải thưởng mặc định cho từng hạng
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  label: "Giải Nhất (5 chính)",
                  key: "tier1",
                  value: "10,000,000",
                },
                {
                  label: "Giải Nhì (4 chính + ĐB)",
                  key: "tier2",
                  value: "5,000,000",
                },
                {
                  label: "Giải Ba (4 chính)",
                  key: "tier3",
                  value: "500,000",
                },
                {
                  label: "Giải Tư (3 chính + ĐB)",
                  key: "tier4",
                  value: "100,000",
                },
                {
                  label: "Giải Năm (3 chính)",
                  key: "tier5",
                  value: "30,000",
                },
                {
                  label: "Khuyến Khích (chỉ ĐB)",
                  key: "consolation",
                  value: "10,000",
                },
              ].map((prize) => (
                <div
                  key={prize.key}
                  className="grid grid-cols-[1fr_auto] items-center gap-3"
                >
                  <Label className="text-sm">{prize.label}</Label>
                  <Input
                    type="text"
                    defaultValue={prize.value}
                    className="w-40 text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="border-t">
            <Button>
              <Save className="mr-2 size-4" />
              Lưu giải thưởng
            </Button>
          </CardFooter>
        </Card>

        {/* Play Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="size-5 text-violet-500" />
              <CardTitle>Luật chơi</CardTitle>
            </div>
            <CardDescription>
              Cấu hình giá vé, lịch quay và giới hạn chơi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Giá 1 line (VND)</Label>
                <Input type="text" defaultValue="10,000" />
              </div>
              <div className="space-y-2">
                <Label>Đơn vị tiền</Label>
                <Input type="text" defaultValue="VND" disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Max boards / vé</Label>
                <Input type="number" defaultValue="5" />
              </div>
              <div className="space-y-2">
                <Label>Max kỳ liên tiếp</Label>
                <Input type="number" defaultValue="6" />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Số kỳ / ngày</Label>
                <Input type="number" defaultValue="2" />
              </div>
              <div className="space-y-2">
                <Label>Đóng bán trước (phút)</Label>
                <Input type="number" defaultValue="30" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Giờ quay (mỗi dòng 1 giờ)</Label>
              <div className="flex gap-2">
                <Input type="text" defaultValue="13:00" className="w-24" />
                <Input type="text" defaultValue="21:00" className="w-24" />
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
    </div>
  );
}
