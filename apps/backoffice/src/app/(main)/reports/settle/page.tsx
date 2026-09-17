"use client";

import { Suspense } from "react";

import { BarChart3, Building2, CalendarDays, Gamepad2 } from "lucide-react";

import { FinancialDateRangePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { ByGameTab } from "./_lib/tabs/by-game";
import { ByTenantTab } from "./_lib/tabs/by-tenant";
import { DailyOverviewTab } from "./_lib/tabs/daily-overview";
import { useSystemReportFilters } from "./_lib/use-report-filters";

function SystemFinancialReportsContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useSystemReportFilters();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <BarChart3 className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-foreground text-lg font-semibold tracking-tight">Báo cáo tài chính hệ thống</h1>
            <p className="text-muted-foreground text-xs">Tổng hợp doanh thu, trả thưởng, lợi nhuận toàn hệ thống</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FinancialDateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "daily" | "by-game" | "by-tenant");
        }}
      >
        <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
          <TabsTrigger value="daily" className="gap-1.5">
            <CalendarDays className="text-info size-4" />
            Tổng quan ngày
          </TabsTrigger>
          <TabsTrigger value="by-game" className="gap-1.5">
            <Gamepad2 className="text-profit size-4" />
            Theo game
          </TabsTrigger>
          <TabsTrigger value="by-tenant" className="gap-1.5">
            <Building2 className="text-info size-4" />
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
