"use client";

import { Building2, CalendarRange, CircleDollarSign, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FinancialDateRangePicker } from "@/components/date-picker";
import { ByDrawTab } from "./tabs/by-draw";
import { ByTenantTab } from "./tabs/by-tenant";
import { useMax3DProReportFilters } from "./use-report-filters";

export function FinancialReportsContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useMax3DProReportFilters();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-sm">
            <CircleDollarSign className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Max 3D Pro — Báo cáo Tài chính
            </h1>
            <p className="text-xs text-muted-foreground">
              T3, T5, T7 · ~2 kỳ/ngày · KHÔNG có Jackpot · Có cặp (lineCount). Drill-down: Kỳ quay →
              Đại lý → Player → Entries.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FinancialDateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => {
              void setFrom(f);
              void setTo(t);
            }}
          />
          <Button variant="outline" size="sm">
            <Download className="mr-2 size-4" />
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => void setTab(v as "draws" | "tenants")}>
        <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
          <TabsTrigger value="draws" className="gap-1.5">
            <CalendarRange className="size-4 text-red-500" />
            Theo kỳ quay
          </TabsTrigger>
          <TabsTrigger value="tenants" className="gap-1.5">
            <Building2 className="size-4 text-blue-500" />
            Theo đại lý
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draws" className="mt-4">
          <ByDrawTab />
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <ByTenantTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
