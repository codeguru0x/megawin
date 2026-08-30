"use client";

/**
 * AI Chat — renderer CHUNG dựng UI từ `ToolViewSpec` (tầng 1, xem `view-spec.ts`).
 *
 * Gánh toàn bộ boilerplate mà trước đây mỗi tool card phải tự viết lại:
 *   - unwrap `AppResult` (mọi tool đều trả `safeRun()` nên shape này là chuẩn chung)
 *   - hiển thị lỗi nghiệp vụ
 *   - empty state
 *   - cộng tổng trên TOÀN BỘ dòng (không chỉ dòng đang hiện)
 *   - cắt số dòng + dòng "+N khác"
 *   - format số/tiền/ngày, tô màu giá trị âm
 *   - deep-link về trang đích (nhãn do spec nêu, xem `DeepLinkSpec`)
 *   - tiêu đề động theo dữ liệu (`titleFrom`, xem `TitleFrom`)
 *   - thu bảng về MỘT DÒNG gạch đầu ({@link ToolResultLine}), mở ra mới thấy số
 *
 * Thêm tool mới chỉ cần khai spec — KHÔNG chạm file này. Chỉ sửa đây khi thêm primitive
 * (`kind`) mới, và trước khi thêm phải đọc ranh giới cứng ở đầu `view-spec.ts`.
 */

import type { ReactNode } from "react";

import Link from "next/link";

import { isAppError } from "@megawin/shared/errors";
import { AlertTriangleIcon, ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import type { Route } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { CellFormat, formatCell } from "./format-cell";
import { type ColumnSpec, DEFAULT_MAX_ROWS, type KpiSpec, type ToolView, type ToolViewSpec } from "./view-spec";

const DEFAULT_EMPTY_TEXT = "Không có dữ liệu cho yêu cầu này.";

/** Format số ⇒ căn phải mặc định; `alignRight` tường minh luôn thắng. */
const NUMERIC_FORMATS: ReadonlySet<CellFormat> = new Set([
  CellFormat.Number,
  CellFormat.Percent,
  CellFormat.Vnd,
  CellFormat.VndCompact,
]);

function isAlignedRight<Row>(column: ColumnSpec<Row>): boolean {
  return column.alignRight ?? NUMERIC_FORMATS.has(column.format ?? CellFormat.Text);
}

/** Giá trị âm ở cột `signed` tô destructive — staff nhìn thấy lỗ ngay, không phải đọc dấu trừ. */
function signedClassName(value: unknown, signed: boolean | undefined): string | undefined {
  if (signed !== true || typeof value !== "number") {
    return undefined;
  }
  return value < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400";
}

/** Export — dùng lại ở renderer bespoke (Tier 2, VD `daily-ops-cards.tsx`) để giữ cùng khung card. */
export function CardShell({ children }: { children: React.ReactNode }) {
  return <Card className="w-full max-w-full gap-2 py-3">{children}</Card>;
}

/**
 * MỘT DÒNG gạch đầu tóm tắt kết quả tra cứu; bấm mới bung bảng số.
 *
 * VÌ SAO (chốt với user 17/08): card luôn-mở là mô hình sai cho backoffice. Câu hỏi so sánh
 * cross-game khiến model gọi tool 1 lần/game ⇒ 7 card ~550px đẩy câu trả lời khỏi màn hình
 * (ảnh bug 17/08). Gộp vào một mục đóng chung đã đỡ, nhưng mở mục ra thì vẫn là 7 card xếp dọc.
 * Dòng gạch giải quyết tận gốc: mỗi lần tra tốn ~20px, N lần tra vẫn đọc được trong một màn hình,
 * và mỗi dòng vẫn mở riêng ra được để đối soát số.
 *
 * TIÊU ĐỀ LÀ THÔNG TIN, KHÔNG PHẢI TRANG TRÍ: dòng phải nói rõ tra CÁI GÌ ("Cấu hình Keno"),
 * vì đóng lại thì nhãn là thứ duy nhất còn thấy. Nhãn trùng nhau (7 dòng "Cấu hình game") biến
 * danh sách thành vô dụng — đó là lý do `titleFrom` tồn tại (xem `TitleFrom`).
 *
 * KHÔNG mở sẵn theo bất kỳ điều kiện dữ liệu nào (số lớn, có alert…): layout nhảy theo dữ liệu
 * làm staff không đoán được chiều cao hội thoại, và "quan trọng" là việc của model diễn đạt bằng
 * lời — model đã có số trong tay để nói.
 *
 * Export — renderer bespoke (Tier 2) bọc bằng chính component này để mọi tool cùng một hình thái.
 */
export function ToolResultLine({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Collapsible className="not-prose w-full">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-left text-muted-foreground/80 text-xs transition-colors hover:text-foreground">
        <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="truncate">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 mt-1.5 data-[state=closed]:animate-out data-[state=open]:animate-in">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Export — dùng lại ở renderer bespoke khi cần báo lỗi ngoài luồng `resolveToolViewData`. */
export function ToolErrorCard({ message }: { message: string }) {
  return (
    <Card className="w-full max-w-full gap-2 border-destructive/30 py-3">
      <CardContent className="flex items-start gap-2 px-3 text-destructive text-sm">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        {message}
      </CardContent>
    </Card>
  );
}

/** Export — dùng lại ở renderer bespoke khi 1 nguồn dữ liệu trong card rỗng. */
export function EmptyCard({ text }: { text: string }) {
  return (
    <CardShell>
      <CardContent className="px-3 text-muted-foreground text-sm">{text}</CardContent>
    </CardShell>
  );
}

/** Export — dùng lại ở renderer bespoke cho ô KPI đơn lẻ ngoài `KpiGrid`. */
export function KpiTile({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("font-semibold text-sm tabular-nums", valueClassName)}>{value}</p>
    </div>
  );
}

/**
 * Deep-link về trang thật. Nhãn do spec quyết định — renderer KHÔNG tự đặt tên đích.
 *
 * Nhãn từng bị hardcode "Mở trong báo cáo" ở đây, khiến card cấu hình game (dẫn tới trang cấu
 * hình) và card jackpot (dẫn tới dashboard) đều nói sai đích. Xem `DeepLinkSpec`.
 *
 * Export — dùng lại ở renderer bespoke (Tier 2) cho cùng kiểu link, không viết lại `<Link>` thô.
 */
export function DeepLink({ href, label }: { href: string; label: string }) {
  return (
    // `href` dựng động từ `DeepLinkSpec.href(rows)` — không qua nav-registry (khác `navigateTo`
    // tool card), nhưng luôn trỏ về path tĩnh đã biết trong `app/`. Cast an toàn.
    <Link className="inline-flex items-center gap-1 text-primary text-xs hover:underline" href={href as Route}>
      {label}
      <ArrowRightIcon className="size-3" />
    </Link>
  );
}

/**
 * Cộng tổng 1 field trên TOÀN BỘ dòng. Field không phải số bị bỏ qua (trả 0) — spec khai
 * `totals` trên cột chữ là lỗi của người viết spec, không phải trường hợp cần xử lý mềm.
 */
function sumField<Row>(rows: readonly Row[], key: Extract<keyof Row, string>): number {
  let total = 0;
  for (const row of rows) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
}

function KpiGrid<Row>({ items, rows }: { items: readonly KpiSpec<Row>[]; rows: readonly Row[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const total = sumField(rows, item.key);
        return (
          <KpiTile
            key={item.key}
            label={item.label}
            value={formatCell(total, item.format ?? CellFormat.VndCompact)}
            valueClassName={signedClassName(total, item.signed)}
          />
        );
      })}
    </div>
  );
}

/** Export — dùng lại ở renderer bespoke cho bảng con bên trong card (VD `getIntegrationHealth`). */
export function DataTable<Row>({ columns, rows }: { columns: readonly ColumnSpec<Row>[]; rows: readonly Row[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead className={cn("h-8 text-xs", isAlignedRight(column) && "text-right")} key={column.key}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            // Không có id ổn định chung cho mọi Row → dùng index. An toàn vì list này TĨNH
            // (render 1 lần từ output tool đã hoàn tất, không thêm/xoá/sắp lại dòng).
            // biome-ignore lint/suspicious/noArrayIndexKey: output tool bất biến, không reorder.
            <TableRow key={rowIndex}>
              {columns.map((column) => {
                const value = (row as Record<string, unknown>)[column.key];
                return (
                  <TableCell
                    className={cn(
                      "py-1 text-xs tabular-nums",
                      isAlignedRight(column) && "text-right",
                      signedClassName(value, column.signed),
                    )}
                    key={column.key}
                  >
                    {formatCell(value, column.format)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KeyValueList<Row>({ fields, row }: { fields: readonly ColumnSpec<Row>[]; row: Row }) {
  return (
    <dl className="divide-y rounded-md border">
      {fields.map((field) => {
        const value = (row as Record<string, unknown>)[field.key];
        return (
          <div className="flex items-baseline justify-between gap-3 px-2 py-1.5" key={field.key}>
            <dt className="text-muted-foreground text-xs">{field.label}</dt>
            <dd className={cn("text-right text-xs tabular-nums", signedClassName(value, field.signed))}>
              {formatCell(value, field.format)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ViewBody<Row>({ rows, view }: { rows: readonly Row[]; view: ToolView<Row> }) {
  const link = view.link;
  const linkNode = link === undefined ? null : <DeepLink href={link.href(rows)} label={link.label} />;

  if (view.kind === "kpi") {
    return (
      <CardContent className="space-y-2 px-3">
        <KpiGrid items={view.items} rows={rows} />
        {linkNode}
      </CardContent>
    );
  }

  if (view.kind === "keyValue") {
    const row = rows.at(0);
    if (row === undefined) {
      return null;
    }
    return (
      <CardContent className="space-y-2 px-3">
        <KeyValueList fields={view.fields} row={row} />
        {linkNode}
      </CardContent>
    );
  }

  const maxRows = view.maxRows ?? DEFAULT_MAX_ROWS;
  const visibleRows = rows.slice(0, maxRows);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <CardContent className="space-y-2 px-3">
      {view.totals !== undefined && view.totals.length > 0 && <KpiGrid items={view.totals} rows={rows} />}
      <DataTable columns={view.columns} rows={visibleRows} />
      {hiddenCount > 0 && <p className="text-muted-foreground text-xs">+{hiddenCount} dòng khác chưa hiện.</p>}
      {linkNode}
    </CardContent>
  );
}

/** Dữ liệu đã rút từ output, sẵn sàng render. `null` ⇒ spec không mô tả được output này. */
export type ToolViewData<Row> = { kind: "error"; message: string } | { kind: "rows"; rows: readonly Row[] };

/**
 * Rút dữ liệu render từ output tool — PURE, không JSX.
 *
 * Tách khỏi component có chủ đích: caller cần biết TRƯỚC khi render là spec có mô tả được
 * output này không, để fallback về `<Tool>` mặc định (JSON gập lại) thay vì hiện khoảng trắng.
 * Nếu nhét quyết định này vào component thì component trả `null` và caller không có cách nào
 * biết → staff mất luôn khả năng xem output thô.
 *
 * Trả `null` khi: output không phải `AppResult`, hoặc `select` trả `null`.
 */
export function resolveToolViewData<Output, Row>(
  spec: ToolViewSpec<Output, Row>,
  output: unknown,
): ToolViewData<Row> | null {
  // Mọi tool trong `agent/tools/` trả `safeRun()` ⇒ `AppResult<T>`. Kiểm tra shape thay vì tin
  // cast: output đi qua biên JSON durable của eve, không có type guarantee ở runtime.
  if (typeof output !== "object" || output === null || !("success" in output)) {
    return null;
  }

  const result = output as { success: boolean; data?: unknown; error?: unknown };

  if (!result.success) {
    return {
      kind: "error",
      message: isAppError(result.error) ? result.error.message : "Tool trả về lỗi không xác định.",
    };
  }

  const rows = spec.select(result.data as Output);
  return rows === null ? null : { kind: "rows", rows };
}

/**
 * Tiêu đề card — `titleFrom` khi có dòng, `title` tĩnh khi rỗng/lỗi.
 *
 * Export vì tiêu đề giờ nằm ở DÒNG GẠCH ({@link ToolResultLine}) do `registry.tsx` dựng, không
 * nằm trong thân card nữa — nên nơi dựng dòng phải tính được tiêu đề mà không cần render card.
 * Tách hàm (thay vì để `registry.tsx` tự viết `titleFrom?.(rows) ?? title`) để quy tắc chọn tiêu
 * đề chỉ có MỘT chỗ; hai chỗ tự suy sẽ lệch nhau khi thêm nhánh mới.
 */
export function toolViewTitle<Row>(view: ToolView<Row>, data: ToolViewData<Row>): string {
  if (data.kind === "error" || data.rows.length === 0) {
    return view.title;
  }
  return view.titleFrom?.(data.rows) ?? view.title;
}

/**
 * Dựng THÂN card từ dữ liệu đã resolve. Chỉ render — mọi quyết định đã xong ở `resolveToolViewData`.
 *
 * KHÔNG có tiêu đề: nó đã ở dòng gạch mà caller dựng ({@link toolViewTitle}). Để lại header ở đây
 * sẽ ra hai lần cùng một chữ, cách nhau 8px.
 */
export function ToolViewCard<Row>({ data, view }: { data: ToolViewData<Row>; view: ToolView<Row> }) {
  if (data.kind === "error") {
    return <ToolErrorCard message={data.message} />;
  }
  if (data.rows.length === 0) {
    return <EmptyCard text={view.empty ?? DEFAULT_EMPTY_TEXT} />;
  }

  return (
    <CardShell>
      <ViewBody rows={data.rows} view={view} />
    </CardShell>
  );
}
