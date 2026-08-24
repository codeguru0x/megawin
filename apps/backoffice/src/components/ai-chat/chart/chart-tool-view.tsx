"use client";

/**
 * AI Chat — card chart hoàn chỉnh: tiêu đề + toggle đổi loại (icon), biểu đồ full width, số liệu
 * thô gập sẵn bên dưới.
 *
 * Nhận `ChartModel` ĐÃ SUY LUẬN SẴN (dựng ở nơi ghép part `renderChart` với tool output gần nhất —
 * xem `registry.tsx`) — component này CHỈ lo hiển thị, không tự gọi `buildChartModel`.
 *
 * `chart-body.tsx` (chứa recharts) tải qua `next/dynamic` + `Suspense` riêng — bundle chat không
 * kéo theo recharts cho tới khi card chart đầu tiên xuất hiện (§6 kế hoạch p1-05).
 *
 * ⚠️ BỎ tabs `Biểu đồ | Bảng` (23/08, feedback ảnh 3-5): tab làm biểu đồ và số liệu LOẠI TRỪ nhau
 * (xem cái này thì mất cái kia) trong khi chúng bổ trợ nhau, và thanh tab chiếm chỗ ngay phía trên
 * chart — vốn đã hẹp trong panel. Số liệu giờ nằm trong `<details>` gập sẵn dưới chart: staff cần
 * đối chiếu số thì mở, còn mặc định mắt đi thẳng vào biểu đồ (thứ vừa yêu cầu).
 *
 * ⚠️ BỎ note `rejectedKind` (24/08): `model.rejectedKind` chỉ nói "loại này không phù hợp", KHÔNG
 * phân biệt được loại đó do người hỏi nêu rõ hay do model đoán. Trường hợp người hỏi nêu rõ thì
 * hướng dẫn (`55-charts.md`) đã buộc Mira giải thích trong câu trả lời — note thành lặp lại. Trường
 * hợp model tự đoán sai thì đây là chuyện nội bộ, in ra chỉ làm người đọc nghi ngờ biểu đồ đang xem.
 */

import { Suspense, useState } from "react";

import dynamic from "next/dynamic";

import { CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChartFieldType,
  type ChartKind,
  type ChartModel,
  type ChartRow,
  getChartCatalogEntry,
  prettifyLabel,
} from "@/lib/chart";

import { CellFormat } from "../tool-renderers/format-cell";
import { CardShell, DataTable } from "../tool-renderers/generic-tool-view";
import type { ColumnSpec } from "../tool-renderers/view-spec";
import { ChartIcon } from "./chart-icon";
import { ChartSkeleton } from "./chart-skeleton";

/**
 * `ssr: false` — recharts dùng `ResizeObserver`/kích thước DOM thật, không render được ở server.
 * Không truyền `loading` ở đây: dùng `<Suspense>` riêng bên dưới để fallback có được `activeKind`
 * hiện tại (đúng chiều cao đang chọn), thứ `dynamic()`'s `loading` (không nhận prop) không làm được.
 */
const ChartBody = dynamic(() => import("./chart-body"), { ssr: false });

/** `ChartFieldType` suy luận → `CellFormat` cho bảng số liệu — cùng quy tắc format với trục/tooltip chart. */
function toCellFormat(type: ChartFieldType): CellFormat {
  switch (type) {
    case ChartFieldType.Currency:
      return CellFormat.VndCompact;
    case ChartFieldType.Percent:
      return CellFormat.Percent;
    case ChartFieldType.Number:
      return CellFormat.Number;
    case ChartFieldType.Time:
    case ChartFieldType.Category:
      return CellFormat.Text;
    default:
      return CellFormat.Text;
  }
}

/** Cột bảng số liệu = trục X + toàn bộ series đã suy luận — cùng field đang vẽ trên chart, không lệch số. */
function buildTableColumns(model: ChartModel, labelFor: (key: string) => string): ColumnSpec<ChartRow>[] {
  return [
    { key: model.x.dataKey, label: labelFor(model.x.dataKey), format: CellFormat.Text },
    ...model.series.map((s) => ({ key: s.dataKey, label: labelFor(s.dataKey), format: toCellFormat(s.type) })),
  ];
}

/**
 * Rows cho bảng số liệu — áp `model.xLabel` lên cột trục X (`power655` → `Power 6/55`).
 *
 * Đổi GIÁ TRỊ trong rows thay vì thêm `render` vào `ColumnSpec`: `ColumnSpec` là spec dùng chung cho
 * mọi card tool (`view-spec.ts`), thêm hook render vào đó chỉ vì 1 ca ở chart là mở cửa cho model/
 * renderer khác tự quyết cách vẽ ô — đúng thứ ranh giới `view-spec.ts` dựng lên để chặn.
 *
 * Cần vì chart đã hiện "Power 6/55" (qua `xValueFull`) mà bảng ngay dưới vẫn in `power655` — cùng một
 * dòng, hai cách gọi (feedback 24/08).
 */
function buildTableRows(model: ChartModel): ChartRow[] {
  if (model.xLabel === undefined) {
    return model.rows;
  }
  const key = model.x.dataKey;
  return model.rows.map((row) => ({ ...row, [key]: model.xLabel?.(String(row[key] ?? "")) ?? row[key] }));
}

/** Panel docked hẹp (~360px, xem `financial-report-ui.mdc`) — toggle icon-only vẫn giữ tooltip tên loại. */
function ChartKindToggle({
  allowedKinds,
  value,
  onChange,
}: {
  allowedKinds: readonly ChartKind[];
  value: ChartKind;
  onChange: (kind: ChartKind) => void;
}) {
  if (allowedKinds.length <= 1) {
    return null;
  }

  return (
    <ToggleGroup
      onValueChange={(next: string) => {
        if (next !== "") {
          onChange(next as ChartKind);
        }
      }}
      size="sm"
      type="single"
      value={value}
      variant="outline"
    >
      {allowedKinds.map((kind) => {
        const entry = getChartCatalogEntry(kind);
        return (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>
              <ToggleGroupItem aria-label={entry.label} value={kind}>
                <ChartIcon className="size-3.5" name={entry.icon} />
              </ToggleGroupItem>
            </TooltipTrigger>
            {/* CHỈ tên loại, KHÔNG kèm `useCase` (feedback 24/08): tooltip của nút icon là để biết
                nút này ra biểu đồ gì, không phải chỗ dạy khi nào nên dùng — câu `useCase` dài 1-2
                dòng bật lên che luôn chart phía dưới. Danh sách "loại nào dùng khi nào" thuộc câu
                trả lời của Mira (hướng dẫn `55-charts.md`), không thuộc tooltip. */}
            <TooltipContent>{entry.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

export interface ChartToolViewProps {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
  /**
   * Nguồn số liệu đang vẽ — tên báo cáo + khoảng thời gian của ĐÚNG lần gọi tool mà chart lấy dữ
   * liệu (vd `"Tài chính theo game · 01/06/2026 – 30/06/2026"`).
   *
   * Có vì lỗi 24/08: câu hỏi là "doanh thu 6 tháng đầu năm của Keno", biểu đồ vẽ ra là tài chính
   * tháng 6 của cả 6 game (output lần gọi cuối), và trên card KHÔNG có gì nói điều đó — tiêu đề chỉ
   * ghi "Tài chính theo game", đọc qua vẫn thấy hợp lý. Người xem tin vào hình, không đối chiếu lại
   * từng con số, nên chart lệch nguồn phải TỰ tố giác. Dòng này không sửa được nguyên nhân (hàng rào
   * chống gọi sai nằm ở instruction — xem JSDoc `agent/tools/renderChart.ts`), nhưng biến một lỗi âm
   * thầm thành lỗi nhìn thấy được.
   */
  sourceNote?: string;
}

/**
 * Export chính — hiện NGAY trong luồng chat, KHÔNG bọc `ToolResultLine` (xem `renderChartTool`).
 *
 * Đổi loại chart qua toggle CHỈ đổi state cục bộ (`activeKind`) — không gọi lại tool, không suy
 * luận lại `rows`/`series`; cùng bộ dữ liệu, chỉ đổi cách vẽ (đúng test 7.2.7 "không network mới").
 *
 * `w-full` + `min-w-0` ở mọi tầng: `ChartContainer` của recharts đo bề rộng cha, nên nếu một tầng
 * nào đó co theo nội dung (flex item mặc định `min-width:auto`) thì chart bị tính sai bề rộng và
 * hiện lệch/nhỏ hơn khung — đúng hiện tượng ở ảnh 3.
 */
export function ChartToolView({ model, reportLabels, sourceNote }: ChartToolViewProps) {
  const [activeKind, setActiveKind] = useState<ChartKind>(model.kind);
  const activeModel: ChartModel = activeKind === model.kind ? model : { ...model, kind: activeKind };
  // Cùng hàm nhãn mà chart dùng cho legend/tooltip (`prettifyLabel`) — bản trước chỉ tra
  // `reportLabels` rồi rơi về key thô, nên bảng in `doanhThu`/`lợiNhuận` trong khi chart bên trên
  // in "Doanh thu"/"Lợi nhuận" (feedback 24/08): cùng một cột, hai cách gọi.
  const labelFor = (key: string): string => prettifyLabel(key, reportLabels);
  const columns = buildTableColumns(model, labelFor);
  const tableRows = buildTableRows(model);

  return (
    <CardShell>
      <CardContent className="flex w-full min-w-0 flex-col gap-2 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <p className="min-w-0 truncate font-medium text-sm">{model.title}</p>
            {sourceNote === undefined ? null : (
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">{sourceNote}</p>
            )}
          </div>
          <ChartKindToggle allowedKinds={model.allowedKinds} onChange={setActiveKind} value={activeKind} />
        </div>
        <div className="w-full min-w-0">
          <Suspense fallback={<ChartSkeleton kind={activeKind} />}>
            <ChartBody model={activeModel} reportLabels={reportLabels} />
          </Suspense>
        </div>
        {/* `<details>` thuần thay vì Collapsible của Radix: không có state cần chia sẻ, không animation
            — thêm 1 component client chỉ để gập/mở là phí. Bảng cuộn NGANG khi nhiều cột (panel hẹp)
            thay vì đẩy cả card rộng ra. */}
        <details className="group w-full min-w-0">
          <summary className="cursor-pointer list-none text-muted-foreground text-xs hover:text-foreground">
            <span className="group-open:hidden">Xem số liệu ({model.rows.length} dòng)</span>
            <span className="hidden group-open:inline">Ẩn số liệu</span>
          </summary>
          <div className="mt-2 w-full min-w-0 overflow-x-auto">
            <DataTable columns={columns} rows={tableRows} />
          </div>
        </details>
      </CardContent>
    </CardShell>
  );
}
