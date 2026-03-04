"use client";

import { useState } from "react";
import { Activity, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentDraw } from "../draws/_lib/use-draws";
import { JackpotBanner } from "./_lib/jackpot-banner";
import { ActiveDrawsPanel } from "./_lib/active-draws-panel";
import { BettingOverview } from "./_lib/betting-overview";
import { NumberAnalytics } from "./_lib/number-analytics";
import type { OpsQueryParams } from "./_lib/use-operations";

function getTodayDate(): string {
  const now = new Date();
  const offset = 7 * 60;
  const vn = new Date(now.getTime() + offset * 60_000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Lotto535OperationsPage() {
  const [financialDate, setFinancialDate] = useState(getTodayDate);
  const [selectedDrawId, setSelectedDrawId] = useState<string>("all");
  const { data: currentDrawData } = useCurrentDraw();

  const drawOptions = currentDrawData?.activeDraws ?? [];

  const params: OpsQueryParams = {
    financialDate,
    ...(selectedDrawId !== "all" ? { drawId: selectedDrawId } : {}),
  };

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-indigo-600 shadow-sm">
            <Activity className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Vận hành Lotto 5/35
            </h1>
            <p className="text-xs text-muted-foreground">Tổng quan hoạt động game realtime</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="financial-date" className="text-xs whitespace-nowrap">
              <CalendarDays className="mr-1 inline size-3.5" />
              Ngày
            </Label>
            <Input
              id="financial-date"
              type="date"
              className="h-8 w-36 text-xs"
              value={financialDate}
              onChange={(e) => setFinancialDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Kỳ</Label>
            <Select value={selectedDrawId} onValueChange={setSelectedDrawId}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Tất cả kỳ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả kỳ</SelectItem>
                {drawOptions.map((d) => (
                  <SelectItem key={d.drawId} value={d.drawId}>
                    {d.drawId} (Kỳ {d.drawNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* [A] Jackpot Banner */}
      <JackpotBanner />

      {/* [B] Active Draws */}
      <ActiveDrawsPanel />

      {/* [C] Betting Overview (KPIs + Tenant Breakdown) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <Activity className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-sm font-semibold">Tổng quan cược</h2>
        </div>
        <BettingOverview params={params} />
      </div>

      {/* [D] Number Analytics */}
      <NumberAnalytics params={params} />
    </div>
  );
}
