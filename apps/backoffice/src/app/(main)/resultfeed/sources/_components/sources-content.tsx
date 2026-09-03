"use client";

import { useState } from "react";

import type { SourceEntity } from "@megawin/resultfeed/entities";

import { Card, CardContent } from "@/components/ui/card";

import { useSources } from "../../_lib/use-queries";
import { SourceEditDialog } from "./source-edit-dialog";
import { SourcesTable } from "./sources-table";

/** Trang chính "Nguồn dữ liệu" — bảng liệt kê + dialog sửa (confirm trước khi lưu). */
export function SourcesContent() {
  const query = useSources();
  const [editing, setEditing] = useState<SourceEntity | null>(null);

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pt-0 pb-0">
          <SourcesTable rows={rows} isLoading={query.isLoading} onEdit={setEditing} />
        </CardContent>
      </Card>

      <SourceEditDialog source={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
