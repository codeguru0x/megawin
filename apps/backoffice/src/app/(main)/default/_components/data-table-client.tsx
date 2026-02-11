"use client";

import dynamic from "next/dynamic";
import type { z } from "zod";

import type { sectionSchema } from "./schema";

const DataTable = dynamic(
  () => import("./data-table").then((m) => m.DataTable),
  {
    ssr: false,
    loading: () => <div className="h-[400px] animate-pulse rounded-lg bg-muted" />,
  },
);

export function DataTableClient({
  data,
}: {
  data: z.infer<typeof sectionSchema>[];
}) {
  return <DataTable data={data} />;
}
