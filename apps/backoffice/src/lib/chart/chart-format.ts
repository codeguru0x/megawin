/**
 * Format số/nhãn cho chart, đúng style backoffice (K/M/B, dd/MM, truncate, từ điển nhãn).
 *
 * CHỈ bọc formatter SẴN CÓ của `@megawin/shared/utils` (DRY, `code-quality-standards.mdc` §5) —
 * giống nguyên tắc `tool-renderers/format-cell.ts`. Không viết lại logic format số ở đây.
 *
 * Sống ở `src/lib/chart/` để MỌI trang backoffice (không riêng AI Chat) dùng lại được — vd 1
 * dashboard tự vẽ recharts muốn tick trục Y compact K/M/B giống chart AI, import thẳng từ đây
 * thay vì copy công thức. Dùng ở `components/ai-chat/chart/chart-body.tsx` (tick trục, tooltip) và
 * `chart-tool-view.tsx` (legend, tiêu đề series).
 */

import { formatCurrency, formatNumber, formatPercent, formatVND } from "@megawin/shared/utils";

import { ChartFieldType } from "./chart-catalog";
import { DRAW_ID_PATTERN, ISO_DATE_PATTERN, ISO_MONTH_PATTERN } from "./chart-inference";

/** Số ký tự tối đa cho nhãn category trên trục X trước khi truncate + `…` (xem bảng §3.2 kế hoạch). */
const CATEGORY_TICK_MAX_LENGTH = 12;

/** Tên tháng ngắn tiếng Việt — index 0 = tháng 1. Dùng cho tick trục X khi dữ liệu gộp theo tháng. */
const MONTH_SHORT_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"] as const;

/**
 * Từ điển nhãn tiếng Việt cho các key dữ liệu THƯỜNG GẶP trong output tool AI chưa có trong
 * `REPORT_COLUMN_LABELS` (`@megawin/game-core/labels`) — vd field nhóm/category không phải cột báo
 * cáo tài chính. `REPORT_COLUMN_LABELS` là nguồn chân lý CHÍNH (đã dùng toàn hệ thống báo cáo);
 * dictionary này chỉ BỔ SUNG, tránh định nghĩa lại field đã có ở đó.
 */
const CHART_LABEL_OVERRIDES: Record<string, string> = {
  gameProduct: "Game",
  prizeTier: "Hạng giải",
  tier: "Hạng",
  cycleId: "Chu kỳ",
  date: "Ngày",
  count: "Số lượng",
  revenue: "Doanh thu",
  payoutRatio: "Tỷ lệ trả thưởng",
  winnerCount: "Số người trúng",
  ticketCount: "Số vé",
};

/**
 * `totalRevenue` → `Total revenue`, `doanhThu` → `Doanh thu` — fallback khi key không có trong từ
 * điển nào. Áp dụng SAU KHI đã tra `REPORT_COLUMN_LABELS` + `CHART_LABEL_OVERRIDES`.
 *
 * **Sentence case, KHÔNG Title Case** (`Doanh Thu`): key trong `rows` do model tự đặt thường là
 * tiếng Việt camelCase (`doanhThu`, `lợiNhuận` — nó đặt theo đúng từ người hỏi dùng), mà tiếng Việt
 * chỉ hoa chữ đầu câu. Title Case cho ra `Doanh Thu`/`Lợi Nhuận` — sai chính tả và lệch hẳn với
 * nhãn cột ở báo cáo backoffice (feedback 24/08). Với key tiếng Anh, `Total revenue` cũng đúng
 * convention nhãn cột của hệ thống.
 *
 * Từ viết TOÀN HOA giữ nguyên (`totalGGR` → `Total GGR`) — đó là từ viết tắt nghiệp vụ (GGR, NGR,
 * RTP), hạ về `Ggr` là làm sai nghĩa.
 */
function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((word) => word !== "");
  if (words.length === 0) {
    return key;
  }
  const [first, ...rest] = words;
  const head = (first ?? "").charAt(0).toUpperCase() + (first ?? "").slice(1);
  const tail = rest.map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()));
  return [head, ...tail].join(" ");
}

/**
 * Nhãn hiển thị cho 1 field key — tra theo thứ tự: `REPORT_COLUMN_LABELS` (nguồn chân lý báo cáo)
 * → `CHART_LABEL_OVERRIDES` (bổ sung riêng cho chart) → humanize key (fallback cuối).
 *
 * `reportLabels` được truyền vào thay vì import cứng `@megawin/game-core/labels` ở đây để giữ file
 * này KHÔNG phụ thuộc package domain game — caller (`chart-body.tsx`) tự import và truyền xuống.
 */
export function prettifyLabel(key: string, reportLabels?: Readonly<Record<string, string>>): string {
  const fromReport = reportLabels?.[key];
  if (fromReport !== undefined) {
    return fromReport;
  }
  const fromOverride = CHART_LABEL_OVERRIDES[key];
  if (fromOverride !== undefined) {
    return fromOverride;
  }
  return humanizeKey(key);
}

/** Cắt nhãn category dài trên trục X: `"Công ty Cổ phần ABC"` → `"Công ty Cổ …"` (tooltip hiện full). */
export function truncateLabel(label: string, maxLength: number = CATEGORY_TICK_MAX_LENGTH): string {
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, maxLength).trimEnd()}…`;
}

/** `"2026-08-16"` hoặc `"2026-08-16T07:12:00.000Z"` → `[2026, 8, 16]`. Trả `null` nếu không parse được. */
function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) {
    return null;
  }
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/**
 * Tick trục X cho field `time`:
 * - tháng `YYYY-MM` → `T3` (năm hiện tại) hoặc `T3/25` (năm khác) — feedback 23/08: trục X in
 *   nguyên `"2026-03"` vừa dài vừa lặp lại năm ở mọi tick.
 * - ISO date → `dd/MM` (năm hiện tại) hoặc `dd/MM/yy` (năm khác — hiếm khi so nhiều năm nhưng vẫn
 *   cần rõ nghĩa).
 * - drawId `YYYY-MM-DD.NNN` → `#NNN`.
 *
 * Giá trị không parse được (hiếm, dữ liệu lạ) → trả nguyên giá trị.
 */
export function formatTimeAxisTick(value: string, now: Date = new Date()): string {
  if (DRAW_ID_PATTERN.test(value)) {
    const seq = value.slice(value.indexOf(".") + 1);
    return `#${seq}`;
  }
  if (ISO_MONTH_PATTERN.test(value)) {
    const year = Number(value.slice(0, 4));
    const monthIndex = Number(value.slice(5, 7)) - 1;
    const short = MONTH_SHORT_LABELS[monthIndex] ?? value;
    return year === now.getFullYear() ? short : `${short}/${String(year).slice(-2)}`;
  }
  if (!ISO_DATE_PATTERN.test(value)) {
    return value;
  }
  const parts = parseIsoDateParts(value);
  if (parts === null) {
    return value;
  }
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  if (parts.year !== now.getFullYear()) {
    return `${dd}/${mm}/${String(parts.year).slice(-2)}`;
  }
  return `${dd}/${mm}`;
}

/**
 * Tooltip cho field `time`: hiện đầy đủ hơn tick — `"16/08/2026"` (date), `"Tháng 3/2026"` (tháng),
 * `"Kỳ 2026-08-16.095"` (drawId).
 */
export function formatTimeTooltip(value: string): string {
  if (DRAW_ID_PATTERN.test(value)) {
    return `Kỳ ${value}`;
  }
  if (ISO_MONTH_PATTERN.test(value)) {
    return `Tháng ${Number(value.slice(5, 7))}/${value.slice(0, 4)}`;
  }
  const parts = parseIsoDateParts(value);
  if (parts === null) {
    return value;
  }
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  return `${dd}/${mm}/${parts.year}`;
}

/**
 * Tick trục Y/giá trị compact — LUÔN K/M/B/T, không bao giờ hiện số đầy đủ (tránh vỡ layout panel
 * hẹp). `currency` và `number` dùng cùng logic compact; `percent` dùng `formatPercent` (đã ngắn).
 */
export function formatAxisTick(value: number, type: ChartFieldType): string {
  if (type === ChartFieldType.Percent) {
    return formatPercent(value, 0);
  }
  return formatCurrency(value);
}

/**
 * Giá trị ĐẦY ĐỦ cho tooltip — `currency` dùng `formatVND` (kèm `₫`), `number` dùng `formatNumber`
 * (grouped, không đơn vị), `percent` dùng `formatPercent` 1 chữ số thập phân.
 */
export function formatTooltipValue(value: number, type: ChartFieldType): string {
  switch (type) {
    case ChartFieldType.Currency:
      return formatVND(value);
    case ChartFieldType.Percent:
      return formatPercent(value, 1);
    default:
      return formatNumber(value);
  }
}

/**
 * Tick trục X tổng hợp theo `ChartFieldType` — dispatch cho `chart-body.tsx` gọi 1 chỗ, không phải
 * tự rẽ nhánh `time`/`category` ở nhiều nơi.
 *
 * Nhánh SỐ (thêm 23/08) dùng cho trục X là mốc số — vd histogram `records,invocations` staff dán
 * vào (xem `pickXAxis`): nếu để rơi xuống `truncateLabel` thì `1500` in ra `"1500"` thay vì `"1,5K"`,
 * và mốc lớn sẽ chồng nhãn lên nhau.
 */
export function formatXAxisTick(value: unknown, type: ChartFieldType, now: Date = new Date()): string {
  if (type === ChartFieldType.Time) {
    return formatTimeAxisTick(String(value ?? ""), now);
  }
  if (type === ChartFieldType.Number || type === ChartFieldType.Currency || type === ChartFieldType.Percent) {
    return formatAxisTick(Number(value ?? 0), type);
  }
  return truncateLabel(String(value ?? ""));
}

/**
 * Nhãn ĐẦY ĐỦ (không truncate) cho 1 giá trị trục X — dùng ở tooltip, legend và tab Bảng.
 *
 * Tách khỏi {@link formatXAxisTick} vì tick phải ngắn để không chồng nhau, còn tooltip/legend có chỗ
 * hiện trọn nghĩa. Trước 23/08 legend pie/donut dùng thẳng giá trị thô ⇒ hiện `"2026-03"` thay vì
 * `"Tháng 3/2026"`, và nhãn category dài bị `…` cả ở chỗ không cần cắt.
 */
export function formatXAxisFullLabel(value: unknown, type: ChartFieldType): string {
  const text = String(value ?? "");
  if (type === ChartFieldType.Time) {
    return formatTimeTooltip(text);
  }
  if (type === ChartFieldType.Number || type === ChartFieldType.Currency || type === ChartFieldType.Percent) {
    return formatTooltipValue(Number(value ?? 0), type);
  }
  return text;
}

/**
 * Tỷ trọng 1 lát trên tổng — `0.283` → `"28%"`. Dùng cho nhãn trực tiếp trên pie/donut và dòng phụ
 * trong tooltip, vì "phần trên tổng" là thông tin CHÍNH của các dạng đó (số tuyệt đối chỉ là phụ).
 */
export function formatShare(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return "";
  }
  return `${Math.round(ratio * 100)}%`;
}
