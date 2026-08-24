/**
 * AI Chat — tra icon `lucide-react` theo `ChartIconName` (khai ở `chart-catalog.ts`).
 *
 * Tách khỏi `chart-catalog.ts` vì catalog PHẢI pure (không import React) để dùng lại được ở
 * unit test `chart-inference.test.ts` mà không kéo theo React/JSX runtime.
 */

import {
  AreaChart,
  BarChart2,
  BarChart3,
  CircleDot,
  Combine,
  Gauge,
  LineChart,
  PieChart,
  Radar,
  ScatterChart,
} from "lucide-react";

import type { ChartIconName } from "@/lib/chart";

const CHART_ICON_MAP: Record<ChartIconName, typeof LineChart> = {
  LineChart,
  AreaChart,
  BarChart3,
  BarChart2,
  PieChart,
  CircleDot,
  Radar,
  Gauge,
  ScatterChart,
  Combine,
};

export function ChartIcon({ name, className }: { name: ChartIconName; className?: string }) {
  const Icon = CHART_ICON_MAP[name];
  return <Icon className={className} />;
}
