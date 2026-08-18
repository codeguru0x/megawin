/**
 * AI Chat — format `ConfigItem.value` theo `unit` (p1-02 §3.6).
 *
 * `ConfigItem` không phải cột bảng bình thường: mỗi DÒNG mang `unit` riêng (vnd/ratio/count/…),
 * còn `ColumnSpec.format` trong `view-spec.ts` cố định CHO CẢ CỘT — không mô tả được "định dạng
 * khác nhau theo từng dòng". Theo đúng ranh giới đã ghi ở đầu `view-spec.ts` ("cần logic điều
 * kiện theo dữ liệu ⇒ xử lý trong `select`, không nới DSL"), format theo `unit` được làm ở ĐÂY —
 * trong hàm map thuần (`select` của `defineToolView`) — rồi cột hiển thị `displayValue` (đã là
 * string) với `CellFormat.Text`. Bảng vẫn là tầng 1 (khai báo), không cần TSX bespoke.
 */

import { formatNumber, formatPercent, formatVND } from "@megawin/shared/utils";

import type { ConfigItem, ConfigUnit } from "@/server/ai";

const FLAG_LABELS = { true: "Có", false: "Không" } as const;

type ValueFormatter = (value: ConfigItem["value"]) => string;

/**
 * Dispatch theo `ConfigUnit` bằng `Record` (không `switch`) — `switch` trên union string literal
 * dẫn xuất từ `as const` khiến Biome `noUnnecessaryConditions` báo nhầm "unreachable" (không
 * resolve được type qua alias cross-module, giống ghi chú `useAwaitThenable` trong
 * `biome-lint-conventions.mdc` §d). `Record<ConfigUnit, ValueFormatter>` vẫn giữ compiler bắt
 * thiếu key khi `ConfigUnit` thêm member mới, mà không đụng rule đó.
 */
const FORMATTERS: Record<ConfigUnit, ValueFormatter> = {
  vnd: (value) => (typeof value === "number" ? formatVND(value) : String(value)),
  // ConfigUnit.Ratio lưu thang 0..1 — nhân 100 trước khi đưa vào formatPercent (thang %).
  ratio: (value) => (typeof value === "number" ? formatPercent(value * 100) : String(value)),
  count: (value) => (typeof value === "number" ? formatNumber(value) : String(value)),
  minutes: (value) => `${value} phút`,
  seconds: (value) => `${value} giây`,
  time: (value) => String(value),
  timezone: (value) => String(value),
  text: (value) => String(value),
  flag: (value) => (typeof value === "boolean" ? FLAG_LABELS[String(value) as "true" | "false"] : String(value)),
};

function formatByUnit(value: ConfigItem["value"], unit: ConfigUnit): string {
  return FORMATTERS[unit](value);
}

/** `ConfigItem` → dòng hiển thị đã format sẵn `value` theo `unit`, `note` mặc định `"—"`. */
export function toConfigItemDisplayRow(item: ConfigItem): { label: string; displayValue: string; note: string } {
  return {
    label: item.label,
    displayValue: formatByUnit(item.value, item.unit),
    note: item.note ?? "—",
  };
}
