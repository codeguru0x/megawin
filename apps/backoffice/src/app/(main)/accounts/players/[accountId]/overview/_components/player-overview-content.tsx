"use client";

import { todayVN } from "@megawin/shared/utils";
import { LayoutDashboard } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";

import { FinancialDateRangePicker } from "@/components/date-picker";

import { GameBreakdownTable } from "../../_components/game-breakdown-table";
import { PlayerKpiStrip } from "../../_components/player-kpi-strip";
import { usePlayerOverview } from "../../_shared/queries";

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

interface PlayerOverviewContentProps {
  accountId: string;
}

/**
 * Nội dung tab "Tổng quan" — Client Component.
 *
 * Layout logic từ trên xuống:
 *  1. Date filter — chọn khoảng thời gian báo cáo.
 *  2. KPI strip — 5 chỉ số tài chính tổng hợp của date range.
 *  3. Game breakdown table — chi tiết theo từng game.
 *
 * Profile identity hiển thị ở sidebar (PlayerSidebarProfile) — không lặp lại ở đây.
 * Tách ra file riêng để page.tsx có thể là Server Component async.
 */
export function PlayerOverviewContent({ accountId }: PlayerOverviewContentProps) {
  const today = todayVN();
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(defaultFrom()));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));

  const {
    data: overviewData,
    isLoading: overviewLoading,
    isError: overviewError,
  } = usePlayerOverview(accountId, from, to);

  return (
    <div className="flex flex-col gap-5">
      {/* Section header: label trái — date filter phải (pattern justify-between chuẩn backoffice) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Tổng quan hoạt động</span>
        </div>
        <FinancialDateRangePicker
          from={from}
          to={to}
          onChange={(f, t) => {
            void setFrom(f);
            void setTo(t);
          }}
        />
      </div>

      {/* 2. KPI strip — full width, 5 card, dữ liệu phụ thuộc date range */}
      <div className="flex flex-col gap-2">
        <PlayerKpiStrip data={overviewData} isLoading={overviewLoading} />
        {overviewError && <p className="text-xs text-destructive">Không thể tải dữ liệu thống kê.</p>}
      </div>

      {/* 3. Game breakdown table */}
      <GameBreakdownTable data={overviewData} isLoading={overviewLoading} isError={overviewError} />
    </div>
  );
}
