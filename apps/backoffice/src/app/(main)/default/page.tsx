import dynamic from "next/dynamic";

import data from "./_components/data.json";
import { DataTableClient } from "./_components/data-table-client";
import { SectionCards } from "./_components/section-cards";

const ChartAreaInteractive = dynamic(
  () => import("./_components/chart-area-interactive").then((m) => ({ default: m.ChartAreaInteractive })),
  { ssr: true, loading: () => <div className="h-[320px] animate-pulse rounded-lg bg-muted" /> },
);

export default function Page() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <SectionCards />
      <ChartAreaInteractive />
      <DataTableClient data={data} />
    </div>
  );
}
