"use client";

import { Suspense } from "react";
import { CircleDollarSign, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialDateRangePicker } from "@/components/financial-date-range-picker";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useMega645ReportFilters } from "./_lib/use-report-filters";
import { ByDrawTab } from "./_lib/tabs/by-draw";
import { ByTenantTab } from "./_lib/tabs/by-tenant";

function Mega645FinancialContent() {
  const { tab, setTab, from, to, setFrom, setTo } = useMega645ReportFilters();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-sm">
            <CircleDollarSign className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Mega 6/45 — Báo cáo tài chính
            </h1>
            <p className="text-xs text-muted-foreground">
              Doanh thu, trả thưởng, hoa hồng theo kỳ quay và đại lý
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <Download className="mr-2 size-4" />
          Xuất Excel
        </Button>
      </div>

      <div className="rounded-lg border bg-card px-4 py-3">
        <FinancialDateRangePicker
          from={from}
          to={to}
          onChange={(f, t) => {
            void setFrom(f);
            void setTo(t);
          }}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => void setTab(v as "draws" | "tenants")}>
        <TabsList>
          <TabsTrigger value="draws">Theo kỳ quay</TabsTrigger>
          <TabsTrigger value="tenants">Theo đại lý</TabsTrigger>
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
      <Mega645FinancialContent />
    </Suspense>
  );
}
