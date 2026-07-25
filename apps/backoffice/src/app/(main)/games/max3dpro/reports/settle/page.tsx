"use client";

import { Suspense } from "react";

import { Building2, CalendarRange, CircleDollarSign } from "lucide-react";

import { FinancialDateRangePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ByDrawTab } from "./_lib/tabs/by-draw";
import { ByTenantTab } from "./_lib/tabs/by-tenant";
import { useMax3dproReportFilters } from "./_lib/use-report-filters";

function Max3dproFinancialContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useMax3dproReportFilters();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-sm">
            <CircleDollarSign className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Max 3D Pro — Báo cáo tài chính</h1>
            <p className="text-xs text-muted-foreground">Doanh thu, trả thưởng, hoa hồng · T3, T5, T7</p>
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
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => void setTab(v as "draws" | "tenants")}>
        <TabsList variant="line" className="w-full justify-start gap-0 border-b px-0">
          <TabsTrigger value="draws" className="gap-1.5">
            <CalendarRange className="size-4 text-pink-500" />
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

export default function FinancialReportsPage() {
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
      <Max3dproFinancialContent />
    </Suspense>
  );
}
