/**
 * Chart catalog: NGUỒN CHÂN LÝ DUY NHẤT cho danh sách loại chart hỗ trợ trong backoffice.
 *
 * File này được dùng ở CẢ HAI phía:
 * 1. Frontend (`chart-inference.ts`, `components/ai-chat/chart/chart-tool-view.tsx`) — tên hiển
 *    thị, icon, allowedKinds.
 * 2. Agent instructions (`agent/instructions/55-charts.md`) — bảng quyết định default kind, chép
 *    tay nội dung `CHART_CATALOG` xuống dạng markdown cho model đọc (không import được vào
 *    instructions .md, nên PHẢI đồng bộ tay khi sửa file này — xem cảnh báo ở cuối file).
 *
 * Sống ở `src/lib/chart/` (không phải `components/ai-chat/chart/`) vì thuần suy luận, KHÔNG gắn
 * với UX riêng của AI Chat — trang backoffice khác cũng import được (xem JSDoc `index.ts`).
 *
 * KHÔNG thêm `ChartKind` mới mà không cập nhật đủ 3 chỗ: `CHART_CATALOG`, `chart-inference.ts`
 * (nhánh chọn default), và `55-charts.md` (bảng cho model).
 */

/**
 * 10 loại chart hỗ trợ — const object, KHÔNG string literal trần (code-quality-standards.mdc §5.3).
 */
export const ChartKind = {
  Line: "line",
  Area: "area",
  Bar: "bar",
  HBar: "hbar",
  Pie: "pie",
  Donut: "donut",
  Radar: "radar",
  RadialBar: "radialBar",
  Scatter: "scatter",
  Composed: "composed",
} as const;
export type ChartKind = (typeof ChartKind)[keyof typeof ChartKind];

/** Mọi giá trị `ChartKind`, dùng cho zod `z.enum(...)` ở `agent/tools/renderChart.ts`. */
export const CHART_KIND_VALUES = Object.values(ChartKind) as [ChartKind, ...ChartKind[]];

/** Kiểu dữ liệu 1 field được suy luận — dùng để chọn trục X/series và cách format. */
export const ChartFieldType = {
  /** Chuỗi thời gian sort được: ISO date/datetime, hoặc `drawId` dạng `YYYY-MM-DD.NNN`. */
  Time: "time",
  /** Tiền VND — tick/tooltip dùng `formatCurrency`/`formatVND`. */
  Currency: "currency",
  /** Tỷ lệ phần trăm — tick/tooltip dùng `formatPercent`. */
  Percent: "percent",
  /** Số đếm thông thường (vé, kỳ, player). */
  Number: "number",
  /** Chuỗi phân loại rời rạc (game, tier, tenant). */
  Category: "category",
} as const;
export type ChartFieldType = (typeof ChartFieldType)[keyof typeof ChartFieldType];

/** Một entry catalog: mô tả CHO NGƯỜI (tên hiển thị) + CHO MODEL (dùng khi nào). */
export interface ChartCatalogEntry {
  kind: ChartKind;
  /** Tên tiếng Việt hiển thị trên toggle/tooltip UI. */
  label: string;
  /** Tên icon `lucide-react` — tra bằng `chart-icon.tsx` (tránh import trực tiếp ở đây, file này PURE). */
  icon: ChartIconName;
  /** Câu ngắn "dùng khi nào" — hiện trong tooltip UI VÀ chép sang bảng markdown cho model. */
  useCase: string;
  /** Điều kiện GẦN ĐÚNG để xét loại này có "phù hợp" với 1 `ChartModel` đã suy luận (§ chart-inference). */
  suitability: ChartSuitability;
}

/** Tên icon lucide-react dùng cho từng loại chart — tách khỏi entry để giữ file catalog PURE (không import React). */
export type ChartIconName =
  | "LineChart"
  | "AreaChart"
  | "BarChart3"
  | "BarChart2"
  | "PieChart"
  | "CircleDot"
  | "Radar"
  | "Gauge"
  | "ScatterChart"
  | "Combine";

/**
 * Điều kiện phù hợp — hàm PURE nhận số liệu tóm tắt của `ChartModel` (không phải rows đầy đủ)
 * để catalog không phụ thuộc `chart-inference.ts` (tránh circular import: inference IMPORT
 * catalog để lấy allowedKinds, catalog KHÔNG được import ngược lại inference).
 *
 * ⚠️ SIẾT MẠNH 23/08 (feedback ảnh 4-5): bản đầu chỉ xét `xType`/`pointCount`/`seriesCount` nên cho
 * phép cả những dạng KHÔNG ĐỌC ĐƯỢC với dữ liệu thật — radar 1 series ra hình lục giác xám vô nghĩa,
 * pie/donut cho chuỗi tháng ra 2 mảng xanh dính nhau, radialBar cho tiền tuyệt đối (vốn chỉ dành cho
 * % tiến độ), composed cho 4 series cùng đơn vị (vẽ 1 cột + 1 đường, im lặng bỏ 2 series còn lại).
 * Vì vậy input GIỜ mang thêm KIỂU của từng series, dấu âm và độ dài nhãn — thiếu chúng thì không thể
 * phân biệt "vẽ được" với "vẽ ra thứ gây hiểu sai".
 */
export interface ChartSuitabilityInput {
  /** Loại field trục X đã chọn. */
  xType: ChartFieldType;
  /** Số điểm dữ liệu (rows) sau khi tỉa. */
  pointCount: number;
  /** Số series (cột số/tiền/%) sẽ vẽ. */
  seriesCount: number;
  /**
   * Kiểu của TỪNG series theo thứ tự vẽ (`seriesTypes[0]` là series chính, dùng cho pie/donut/
   * radialBar). Cần để loại các dạng đòi đơn vị cụ thể (radialBar/radar chỉ hợp %) và các dạng đòi
   * NHIỀU đơn vị (composed).
   */
  seriesTypes: readonly ChartFieldType[];
  /**
   * Series chính có giá trị âm — chart tỷ trọng (pie/donut/radialBar) KHÔNG được phép lúc đó:
   * "phần trên tổng" với số âm là vô nghĩa (vd `netProfit` lỗ ở vài game).
   */
  primaryHasNegative: boolean;
  /** Độ dài nhãn trục X DÀI NHẤT — nhãn dài đọc tốt hơn ở cột ngang (hbar) so với cột dọc. */
  maxXLabelLength: number;
}

export type ChartSuitability = (input: ChartSuitabilityInput) => boolean;

/** Nhãn category dài quá ngưỡng này thì cột dọc sẽ chồng chữ ⇒ ưu tiên cột ngang. */
const LONG_LABEL_THRESHOLD = 12;

/**
 * Số mục tối đa còn đọc được trên 1 biểu đồ tỷ trọng (pie/donut/radialBar) — quá số này lát quá
 * mỏng, không đọc nổi nhãn. `chart-body.tsx` dùng CÙNG hằng này để gộp phần dư thành lát "Khác",
 * nên hai bên không bao giờ lệch nhau.
 */
export const MAX_PROPORTION_SLICES = 7;

const isTimeAxis: ChartSuitability = ({ xType }) => xType === ChartFieldType.Time;
const isCategoryAxis: ChartSuitability = ({ xType }) => xType === ChartFieldType.Category;
const hasMultiSeries: ChartSuitability = ({ seriesCount }) => seriesCount >= 2;

/**
 * Trục X là SỐ (không phải thời gian/phân loại) — dữ liệu phân bố theo bucket số, vd histogram
 * `records,invocations` staff dán vào (bug 23/08: dạng này trước đây không vẽ được, xem `pickXAxis`).
 *
 * Về mặt đọc hiểu, trục số hành xử như trục thời gian: có THỨ TỰ và khoảng cách ⇒ hợp cột/đường/miền,
 * KHÔNG hợp các dạng tỷ trọng (mỗi bucket không phải "một phần của tổng" theo nghĩa nghiệp vụ).
 */
const isOrdinalNumberAxis: ChartSuitability = ({ xType }) => xType === ChartFieldType.Number;

/** Trục có THỨ TỰ (thời gian hoặc số) — điều kiện chung của cột/đường/miền. */
const isOrderedAxis: ChartSuitability = (input) => isTimeAxis(input) || isOrdinalNumberAxis(input);

/**
 * Vẽ được dạng "phần trên tổng" (pie/donut): trục phân loại, ĐÚNG 1 series, 2–7 mục, series chính
 * không âm và KHÔNG phải `%` (cộng dồn nhiều % lại thành 1 vòng tròn là sai nghiệp vụ).
 *
 * ⚠️ `!hasMultiSeries` là điều kiện BẮT BUỘC, không phải kỹ tính: một vòng tròn chỉ biểu diễn được
 * MỘT tổng, nên `<Pie>` chỉ vẽ `series[0]` và **bỏ im lặng** mọi series còn lại. Sự cố 24/08: biểu
 * đồ tiêu đề _"Doanh thu Keno và Power 6/55 theo tháng"_ vẽ vành khuyên với 82% / 15% — đó là tỷ
 * trọng CHỈ CỦA KENO, Power 6/55 (26,18 triệu tháng 6) biến mất hoàn toàn khỏi hình mà không có
 * cảnh báo nào. Muốn so 2 chỉ số thì phải là cột/đường, không phải tròn.
 */
const isProportionable: ChartSuitability = (input) =>
  isCategoryAxis(input) &&
  !hasMultiSeries(input) &&
  input.pointCount >= 2 &&
  input.pointCount <= MAX_PROPORTION_SLICES &&
  !input.primaryHasNegative &&
  input.seriesTypes[0] !== ChartFieldType.Percent;

/** MỌI series đều là `%` — điều kiện của radar/radialBar (các trục phải cùng thang 0-100 mới so được). */
const allPercentSeries: ChartSuitability = ({ seriesTypes }) =>
  seriesTypes.length > 0 && seriesTypes.every((type) => type === ChartFieldType.Percent);

/** Có ≥ 2 ĐƠN VỊ khác nhau trong series (vd tiền + %) — điều kiện thực của biểu đồ kết hợp. */
const hasMixedUnits: ChartSuitability = ({ seriesTypes }) => new Set(seriesTypes).size >= 2;

/**
 * Catalog đầy đủ — thứ tự ở đây là thứ tự hiển thị trên toggle UI và trong bảng cho model.
 *
 * `suitability` chỉ là điều kiện THÔ dùng cho allowedKinds mặc định — override per-tool
 * (`ChartOverride.allowedKinds`) luôn thắng khi có khai báo riêng.
 */
export const CHART_CATALOG: readonly ChartCatalogEntry[] = [
  {
    kind: ChartKind.Line,
    label: "Đường",
    icon: "LineChart",
    useCase: "Xu hướng theo trục có thứ tự (thời gian, hoặc mốc số) — ≥ 3 mốc, 1 hay nhiều chỉ số cùng đơn vị",
    suitability: (input) => isOrderedAxis(input) && input.pointCount >= 3,
  },
  {
    kind: ChartKind.Area,
    label: "Miền",
    icon: "AreaChart",
    useCase: "Xu hướng ĐÚNG 1 chỉ số theo trục có thứ tự, nhấn độ lớn vùng dưới đường",
    suitability: (input) => isOrderedAxis(input) && input.pointCount >= 3 && !hasMultiSeries(input),
  },
  {
    kind: ChartKind.Bar,
    label: "Cột",
    icon: "BarChart3",
    useCase: "So sánh giữa các nhóm (2–12 mục), chuỗi thời gian ngắn (≤ 15 mốc), hoặc phân bố theo mốc số",
    suitability: (input) =>
      (isCategoryAxis(input) && input.pointCount >= 2 && input.pointCount <= 12) ||
      (isTimeAxis(input) && input.pointCount >= 2 && input.pointCount <= 15) ||
      (isOrdinalNumberAxis(input) && input.pointCount >= 2 && input.pointCount <= 20),
  },
  {
    kind: ChartKind.HBar,
    label: "Cột ngang",
    icon: "BarChart2",
    useCase: "Nhiều mục (≥ 6) hoặc nhãn dài (tên đại lý, tên player) — xếp hạng top",
    suitability: (input) =>
      isCategoryAxis(input) &&
      input.pointCount >= 3 &&
      (input.pointCount >= 6 || input.maxXLabelLength > LONG_LABEL_THRESHOLD),
  },
  {
    kind: ChartKind.Pie,
    label: "Tròn",
    icon: "PieChart",
    useCase: "Tỷ trọng phần-trên-tổng theo nhóm (2–7 mục), MỘT chỉ số duy nhất, giá trị không âm",
    suitability: isProportionable,
  },
  {
    kind: ChartKind.Donut,
    label: "Vành khuyên",
    icon: "CircleDot",
    useCase: "Tỷ trọng phần-trên-tổng, có số TỔNG ở giữa (2–7 mục), MỘT chỉ số duy nhất, không âm",
    suitability: isProportionable,
  },
  {
    kind: ChartKind.Radar,
    label: "Radar",
    icon: "Radar",
    useCase: "So sánh hồ sơ đa chiều 3–8 trục, cần ≥ 2 chỉ số CÙNG thang % (vd tỷ lệ theo tier)",
    suitability: (input) =>
      isCategoryAxis(input) &&
      input.pointCount >= 3 &&
      input.pointCount <= 8 &&
      hasMultiSeries(input) &&
      allPercentSeries(input),
  },
  {
    kind: ChartKind.RadialBar,
    label: "Vòng tiến độ",
    icon: "Gauge",
    useCase: "Phần trăm hoàn thành so với mục tiêu — CHỈ dùng cho chỉ số %, tối đa 5 mục",
    suitability: (input) => isCategoryAxis(input) && input.pointCount <= 5 && allPercentSeries(input),
  },
  {
    kind: ChartKind.Scatter,
    label: "Phân tán",
    icon: "ScatterChart",
    useCase:
      "Tương quan giữa 2 chỉ số số học (≥ 8 điểm) — vd tiền cược vs tiền thắng; hoặc phân bố theo mốc số ở trục X",
    suitability: (input) => (hasMultiSeries(input) || isOrdinalNumberAxis(input)) && input.pointCount >= 8,
  },
  {
    kind: ChartKind.Composed,
    label: "Kết hợp",
    icon: "Combine",
    useCase: "2 ĐƠN VỊ khác nhau theo thời gian — cột tiền + đường % (doanh thu + tỷ lệ trả thưởng)",
    suitability: (input) => isTimeAxis(input) && hasMultiSeries(input) && hasMixedUnits(input) && input.pointCount >= 3,
  },
];

const CATALOG_BY_KIND: Record<ChartKind, ChartCatalogEntry> = CHART_CATALOG.reduce(
  (acc, entry) => {
    acc[entry.kind] = entry;
    return acc;
  },
  {} as Record<ChartKind, ChartCatalogEntry>,
);

/**
 * Chiều cao Tailwind cho từng `kind` — dùng CHUNG bởi `chart-body.tsx` (chart thật) VÀ
 * `chart-skeleton.tsx` (skeleton khi đang tải chunk recharts qua `next/dynamic`).
 *
 * Đặt ở ĐÂY (file pure, không import recharts) — KHÔNG đặt trong `chart-body.tsx`, vì
 * `chart-skeleton.tsx` cần hiển thị TRƯỚC khi chunk recharts tải xong; nếu import từ
 * `chart-body.tsx` thì Next.js sẽ kéo cả recharts vào bundle chính, phá code-splitting.
 *
 * CAO HƠN BẢN ĐẦU (23/08, feedback ảnh 3): `h-48` (192px) cho chart cartesian là quá thấp — trục Y
 * 5 tick + legend chiếm gần nửa chiều cao, phần vẽ còn ~90px nên mọi biểu đồ đều "dẹt" và khó đọc.
 * `aspect-square max-h-56` cho pie/donut cũng ép hình tròn nhỏ lại trên panel hẹp.
 *
 * ⚠️ KHÔNG dùng `aspect-*` cho chart cartesian: tỷ lệ theo bề rộng khiến chart trong panel 360px
 * lùn hơn hẳn cùng chart đó ở `/ai` (rộng ~900px) — cùng một dữ liệu mà hai nơi cao khác nhau. Chiều
 * cao CỐ ĐỊNH theo `kind` là thứ giữ hai chỗ nhất quán (và `hbar` còn cộng thêm theo số dòng ở
 * `chart-body.tsx`, xem `hbarHeightPx`).
 */
export const CHART_HEIGHT_CLASS: Record<ChartKind, string> = {
  [ChartKind.Line]: "h-64",
  [ChartKind.Area]: "h-64",
  [ChartKind.Bar]: "h-64",
  [ChartKind.HBar]: "h-72",
  [ChartKind.Pie]: "h-72",
  [ChartKind.Donut]: "h-72",
  [ChartKind.Radar]: "h-72",
  [ChartKind.RadialBar]: "h-72",
  [ChartKind.Scatter]: "h-64",
  [ChartKind.Composed]: "h-64",
};

/**
 * Palette series mặc định — 8 màu KHÁC HUE rõ rệt, đủ tương phản trên cả light và dark mode.
 *
 * ⚠️ KHÔNG dùng `var(--chart-1..5)` của theme (bug 23/08, ảnh 4): 5 biến đó trong theme mặc định
 * (`globals.css`) cùng MỘT hue xanh, chỉ khác lightness — pie/donut vẽ ra "hai mảng xanh dính nhau",
 * staff không phân biệt được lát nào là game nào. Palette chart cần khác hue theo TỪNG series, còn
 * `--chart-N` được thiết kế cho gradient một tông. Đây là giá trị hex TRỰC TIẾP (không qua CSS var)
 * vì chúng phải giống nhau ở mọi theme preset — biểu đồ đọc sai màu là lỗi dữ liệu, không phải lỗi
 * thẩm mỹ, nên không để preset ghi đè.
 *
 * Cùng họ màu với `GAME_COLORS` (`src/lib/game-colors.ts`) để chart AI và dashboard nhìn cùng một
 * hệ — nhưng KHÔNG import từ đó: file này pure và không thuộc domain game.
 */
export const CHART_SERIES_PALETTE: readonly string[] = [
  "#2563eb", // blue-600
  "#0d9488", // teal-600
  "#d97706", // amber-600
  "#c026d3", // fuchsia-600
  "#dc2626", // red-600
  "#65a30d", // lime-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
];

/** Màu series thứ `index` — tuần hoàn khi vượt số màu trong {@link CHART_SERIES_PALETTE}. */
export function chartSeriesColor(index: number): string {
  const palette = CHART_SERIES_PALETTE;
  return palette[index % palette.length] ?? "#2563eb";
}

/** Tra 1 entry catalog theo kind — dùng ở toggle UI (nhãn + icon + tooltip). */
export function getChartCatalogEntry(kind: ChartKind): ChartCatalogEntry {
  return CATALOG_BY_KIND[kind];
}

/** Nhãn tiếng Việt của 1 kind — shorthand hay dùng. */
export function getChartLabel(kind: ChartKind): string {
  return CATALOG_BY_KIND[kind].label;
}

/**
 * Danh sách kind PHÙ HỢP với 1 `ChartModel` đã suy luận, theo thứ tự catalog.
 *
 * Dùng ở `chart-inference.ts` để tính `allowedKinds` mặc định (trước khi áp override per-tool).
 * Luôn trả về ÍT NHẤT 1 kind — nếu không kind nào khớp `suitability`, caller (chart-inference)
 * phải tự chọn fallback (mặc định `bar`), KHÔNG phải trách nhiệm của hàm này.
 */
export function suitableChartKinds(input: ChartSuitabilityInput): ChartKind[] {
  return CHART_CATALOG.filter((entry) => entry.suitability(input)).map((entry) => entry.kind);
}
