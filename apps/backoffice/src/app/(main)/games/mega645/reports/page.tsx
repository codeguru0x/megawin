import { ChartBar, Construction } from "lucide-react";

export default function Mega645ReportsPage() {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-teal-500 to-teal-600 shadow-sm">
          <ChartBar className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Mega 6/45 — Báo cáo
          </h1>
          <p className="text-xs text-muted-foreground">
            Thống kê tài chính, doanh thu và lợi nhuận theo kỳ quay.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 p-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Construction className="size-6 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Tính năng đang phát triển
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Trang báo cáo Mega 6/45 sẽ sớm ra mắt.
          </p>
        </div>
      </div>
    </div>
  );
}
