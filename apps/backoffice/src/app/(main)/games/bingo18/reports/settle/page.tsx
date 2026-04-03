"use client";

import { Suspense } from "react";
import { Building2, CalendarRange, CircleDollarSign } from "lucide-react";
import { FinancialDateRangePicker } from "@/components/date-picker";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useBingo18ReportFilters } from "./_lib/use-report-filters";
import { ByDrawTab } from "./_lib/tabs/by-draw";
import { ByTenantTab } from "./_lib/tabs/by-tenant";

function Bingo18FinancialContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useBingo18ReportFilters();
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-green-500 to-green-600 shadow-sm">
            <CircleDollarSign className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Bingo 18 — Báo cáo tài chính
            </h1>
            <p className="text-xs text-muted-foreground">
              Doanh thu, trả thưởng, hoa hồng · ~160 kỳ/ngày
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
      <Bingo18FinancialContent />
    </Suspense>
  );
}
