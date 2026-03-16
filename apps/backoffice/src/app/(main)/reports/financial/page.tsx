"use client";

import { Suspense } from "react";
import { BarChart3, CalendarDays, Download, Gamepad2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialDateRangePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemReportFilters } from "./_lib/use-report-filters";
import { DailyOverviewTab } from "./_lib/tabs/daily-overview";
import { ByGameTab } from "./_lib/tabs/by-game";
import { ByTenantTab } from "./_lib/tabs/by-tenant";

function SystemFinancialReportsContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useSystemReportFilters();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-violet-600 shadow-sm">
            <BarChart3 className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Báo cáo tài chính hệ thống
            </h1>
            <p className="text-xs text-muted-foreground">
              Tổng hợp doanh thu, trả thưởng, lợi nhuận toàn hệ thống
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
      <Tabs value={tab} onValueChange={(v) => void setTab(v as "daily" | "by-game" | "by-tenant")}>
        <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
          <TabsTrigger value="daily" className="gap-1.5">
            <CalendarDays className="size-4 text-violet-500" />
            Tổng quan ngày
          </TabsTrigger>
          <TabsTrigger value="by-game" className="gap-1.5">
            <Gamepad2 className="size-4 text-emerald-500" />
            Theo game
          </TabsTrigger>
          <TabsTrigger value="by-tenant" className="gap-1.5">
            <Building2 className="size-4 text-blue-500" />
            Theo đại lý
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <DailyOverviewTab />
        </TabsContent>

        <TabsContent value="by-game" className="mt-4">
          <ByGameTab />
        </TabsContent>

        <TabsContent value="by-tenant" className="mt-4">
          <ByTenantTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SystemFinancialReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <SystemFinancialReportsContent />
    </Suspense>
  );
}
