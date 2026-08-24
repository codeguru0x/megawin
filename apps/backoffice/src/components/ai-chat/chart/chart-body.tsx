"use client";

/**
 * AI Chat — vẽ recharts thật theo `ChartModel` đã suy luận (`@/lib/chart/chart-inference.ts`).
 *
 * `next/dynamic` (ssr:false) chỉ load file này khi có card chart đầu tiên xuất hiện — bundle chat
 * không kéo theo recharts nếu hội thoại không ai yêu cầu vẽ biểu đồ (§6 kế hoạch p1-05).
 *
 * KHÔNG import file này trực tiếp từ nơi khác ngoài `chart-tool-view.tsx` — luôn qua
 * `next/dynamic` để giữ đúng code-splitting.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  type BarShapeProps,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  type PieSectorShapeProps,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Rectangle,
  Scatter,
  ScatterChart,
  Sector,
  usePlotArea,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CHART_HEIGHT_CLASS,
  ChartFieldType,
  ChartKind,
  type ChartModel,
  type ChartRow,
  type ChartSeries,
  chartSeriesColor,
  formatAxisTick,
  formatShare,
  formatTooltipValue,
  formatXAxisFullLabel,
  formatXAxisTick,
  MAX_PROPORTION_SLICES,
  prettifyLabel,
  scatterAxisPair,
  secondaryAxisKeys,
} from "@/lib/chart";
import { cn } from "@/lib/utils";

/** Nhãn lát gộp phần dư của pie/donut/radialBar khi vượt {@link MAX_PROPORTION_SLICES}. */
const OTHERS_LABEL = "Khác";

/** Bề rộng cột tối đa — ít điểm (3-4 tháng) mà để recharts tự chia thì cột phình ra như khối chữ nhật. */
const MAX_BAR_WIDTH = 56;

/** Từ số điểm này trở xuống thì vẽ dot trên đường — nhiều hơn thì dot dính nhau thành vệt. */
const MAX_POINTS_WITH_DOTS = 12;

/** Chiều cao 1 dòng của cột ngang (px) — `hbar` cao theo SỐ DÒNG, không dùng chiều cao cố định. */
const HBAR_ROW_HEIGHT = 30;

/** Chiều cao tối thiểu cột ngang (px) — 2-3 dòng vẫn phải đủ chỗ cho trục và nhãn. */
const HBAR_MIN_HEIGHT = 180;

/** Lát pie nhỏ hơn ngưỡng này KHÔNG in nhãn % lên hình (chữ sẽ chồng lên lát bên cạnh). */
const MIN_SHARE_FOR_INLINE_LABEL = 0.06;

/**
 * Màu của 1 dòng dữ liệu khi chart vẽ MỖI DÒNG 1 màu (bar 1-series, pie/donut, radialBar) — ưu
 * tiên `model.rowColor` (`ChartOverride.rowColor` khai ở `view-spec.ts`, vd `getGameHex`), fallback
 * palette `--chart-N` tuần hoàn theo vị trí. Xem `ChartModel.rowColor` (`chart-inference.ts`).
 *
 * Dùng qua prop `shape` (Bar/Pie) hoặc field `fill` gắn thẳng vào từng row (RadialBar) — KHÔNG
 * dùng `Cell` (đã `@deprecated` từ recharts, sẽ bị xoá ở Recharts 4.0, xem
 * https://recharts.github.io/en-US/guide/cell). `shape` nhận nguyên props hình học recharts đã
 * tính (x/y/width/height cho Bar, góc/bán kính cho Pie) — chỉ override `fill`, giữ nguyên phần còn
 * lại bằng spread `{...props}`.
 */
function rowFill(model: ChartModel, row: ChartRow, index: number): string {
  return model.rowColor?.(row) ?? chartSeriesColor(index);
}

/**
 * Dựng `ChartConfig` cho `ChartContainer` — label/color cho mỗi series, key = `dataKey`.
 *
 * `ChartContainer` biến config này thành CSS var `--color-<dataKey>` ở scope card, nên mọi chỗ dưới
 * đây chỉ cần `var(--color-...)` mà không phải truyền màu qua props.
 */
function buildChartConfig(
  series: readonly ChartSeries[],
  reportLabels?: Readonly<Record<string, string>>,
): ChartConfig {
  const config: ChartConfig = {};
  series.forEach((s, index) => {
    config[s.dataKey] = {
      label: prettifyLabel(s.dataKey, reportLabels),
      color: s.color ?? chartSeriesColor(index),
    };
  });
  return config;
}

/**
 * Config cho chart tỷ trọng (pie/donut/radialBar) — key là GIÁ TRỊ TỪNG DÒNG trên trục X, không
 * phải dataKey series.
 *
 * Cần thiết vì `ChartLegendContent`/`ChartTooltipContent` của shadcn tra nhãn theo `nameKey` trong
 * config; thiếu entry này legend pie in giá trị thô (`"2026-03"` thay vì `"Tháng 3/2026"`) và không
 * có nhãn.
 *
 * ⚠️ PHẢI nhận ĐÚNG mảng đã sort/gộp mà chart vẽ (`proportionRows`), KHÔNG phải `model.rows` gốc:
 * bug 23/08 (staff báo "label tháng không khớp màu chart") sinh ra vì config gán màu theo thứ tự
 * `model.rows` trong khi lát vẽ theo thứ tự đã sort giảm dần ⇒ lệch màu giữa legend và hình.
 */
function buildProportionConfig(
  model: ChartModel,
  rows: readonly ChartRow[],
  reportLabels?: Readonly<Record<string, string>>,
): ChartConfig {
  const config: ChartConfig = {};
  const valueKey = model.series[0]?.dataKey ?? "";
  config[valueKey] = { label: prettifyLabel(valueKey, reportLabels) };
  rows.forEach((row) => {
    const name = String(row[model.x.dataKey] ?? "");
    config[name] = {
      label: xValueFull(model, name),
      color: String(row.fill ?? ""),
    };
  });
  return config;
}

/**
 * Nhãn giá trị trục X dạng ĐẦY ĐỦ (tooltip/chú giải/config) — ưu tiên `model.xLabel` nếu tool khai.
 *
 * Gộp `xLabel` vào 2 hàm này (không rải ở từng call site) vì giá trị trục X xuất hiện ở 9 chỗ khác
 * nhau — tick, chú giải, tooltip, tâm donut, nhãn điểm phân tán. Bỏ sót một chỗ là cùng một game
 * hiện hai tên khác nhau trong cùng một card.
 */
function xValueFull(model: ChartModel, value: unknown): string {
  return model.xLabel?.(String(value ?? "")) ?? formatXAxisFullLabel(value, model.x.type);
}

/** Nhãn giá trị trục X dạng NGẮN (tick trục) — `xLabel` không rút gọn, nhãn game vốn đã ngắn. */
function xValueTick(model: ChartModel, value: unknown): string {
  return model.xLabel?.(String(value ?? "")) ?? formatXAxisTick(value, model.x.type);
}

function typeForSeries(model: ChartModel, dataKey: string): ChartFieldType {
  return model.series.find((s) => s.dataKey === dataKey)?.type ?? ChartFieldType.Number;
}

/** Tổng series chính trên toàn bộ rows — hiện ở tâm donut và dùng tính % từng lát. */
function sumSeries(rows: readonly ChartRow[], valueKey: string): number {
  return rows.reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0);
}

/**
 * Một dòng trong tooltip: ô màu + nhãn + giá trị, căn hai đầu.
 *
 * Bắt buộc phải tự render (không dùng mặc định của shadcn) vì cần format tiền/`%` theo
 * `ChartFieldType`, mà mặc định luôn `toLocaleString()`. Nhưng khi truyền `formatter`, shadcn render
 * NGUYÊN kết quả trả về — trả về mảng `[value, name]` thì hai chuỗi dán liền nhau, ra
 * `"11,030,000 ₫Tiền cược"` (bug 23/08). Vì vậy formatter phải trả về JSX có layout đầy đủ, kể cả ô
 * màu (mất `formatter` là mất luôn indicator mặc định).
 */
function TooltipItem({ color, label, value }: { color: string | undefined; label: string; value: string }) {
  return (
    <>
      {color !== undefined && (
        <span className="mt-0.5 size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      )}
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium font-mono text-foreground tabular-nums">{value}</span>
      </div>
    </>
  );
}

/** Màu của 1 item tooltip — recharts đặt ở `item.color` (cartesian) hoặc `payload.fill` (pie/radial). */
function tooltipItemColor(item: { color?: string; payload?: { fill?: string } }): string | undefined {
  return item.color ?? item.payload?.fill;
}

/**
 * Cartesian chart chung cho line/area/bar/composed — cùng khung trục X/Y/grid/tooltip/legend.
 *
 * Điểm cần giữ (feedback 23/08): trục Y `width` phải đủ cho nhãn compact dài nhất (`3,2 tỷ`), nếu
 * để mặc định recharts thì nhãn bị cắt; grid chỉ kẻ NGANG (đường dọc làm chart trông như bảng);
 * legend chỉ hiện khi ≥ 2 series (1 series thì tiêu đề card đã nói rõ đang xem chỉ số gì).
 *
 * TRỤC Y PHỤ (thêm 24/08): series khác ĐƠN VỊ với series đầu (tiền vs `%`) được vẽ trên trục bên
 * phải với thang riêng — xem `secondaryAxisKeys`. Không có nó thì đường `%` (0-1) đứng cạnh cột tiền
 * (tỷ) bị ép thành vạch phẳng ở đáy, đúng lỗi thấy trên biểu đồ "Kết hợp".
 */
function CartesianAxes({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const primarySeriesType = model.series[0]?.type ?? ChartFieldType.Number;
  const secondaryKeys = secondaryAxisKeys(model.series);
  const secondaryType = model.series.find((s) => s.dataKey === secondaryKeys[0])?.type;
  return (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.7} vertical={false} />
      <XAxis
        axisLine={false}
        dataKey={model.x.dataKey}
        interval="preserveStartEnd"
        minTickGap={16}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickFormatter={(value: unknown) => xValueTick(model, value)}
        tickLine={false}
        tickMargin={8}
      />
      <YAxis
        axisLine={false}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickFormatter={(value: number) => formatAxisTick(value, primarySeriesType)}
        tickLine={false}
        tickMargin={6}
        width={56}
        yAxisId={PRIMARY_AXIS_ID}
      />
      {secondaryType !== undefined && (
        <YAxis
          axisLine={false}
          orientation="right"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickFormatter={(value: number) => formatAxisTick(value, secondaryType)}
          tickLine={false}
          tickMargin={6}
          width={44}
          yAxisId={SECONDARY_AXIS_ID}
        />
      )}
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name, item) => (
              <TooltipItem
                color={tooltipItemColor(item)}
                label={prettifyLabel(String(name), reportLabels)}
                value={formatTooltipValue(Number(value), typeForSeries(model, String(name)))}
              />
            )}
            labelFormatter={(label) => xValueFull(model, label)}
          />
        }
        cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
      />
      {model.series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
    </>
  );
}

/**
 * Id trục Y — recharts đòi MỌI series khai `yAxisId` khớp với một `<YAxis>` khi có nhiều trục; khai
 * tường minh cả khi chỉ có 1 trục để không phải nhớ 2 quy ước khác nhau cho 2 trường hợp.
 */
const PRIMARY_AXIS_ID = "left";
const SECONDARY_AXIS_ID = "right";

/** Trục Y của 1 series — `right` nếu đơn vị khác series đầu (xem `secondaryAxisKeys`). */
function axisIdFor(secondaryKeys: readonly string[], dataKey: string): string {
  return secondaryKeys.includes(dataKey) ? SECONDARY_AXIS_ID : PRIMARY_AXIS_ID;
}

/** Margin chung cho chart cartesian — chừa chỗ cho nhãn tick cuối trục X và số cao nhất trục Y. */
const CARTESIAN_MARGIN = { top: 12, right: 12, bottom: 4, left: 4 } as const;

function LineChartBody({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  // Ít điểm ⇒ hiện dot để thấy rõ TỪNG mốc (3-6 tháng mà chỉ có đường trơn thì không biết mốc ở đâu).
  const showDots = model.rows.length <= MAX_POINTS_WITH_DOTS;
  const secondaryKeys = secondaryAxisKeys(model.series);
  return (
    <LineChart accessibilityLayer data={model.rows as Record<string, unknown>[]} margin={CARTESIAN_MARGIN}>
      <CartesianAxes model={model} reportLabels={reportLabels} />
      {model.series.map((s) => (
        <Line
          activeDot={{ r: 4, strokeWidth: 2 }}
          dataKey={s.dataKey}
          dot={showDots ? { r: 3, strokeWidth: 0, fill: `var(--color-${s.dataKey})` } : false}
          isAnimationActive={false}
          key={s.dataKey}
          stroke={`var(--color-${s.dataKey})`}
          strokeWidth={2}
          type="monotone"
          yAxisId={axisIdFor(secondaryKeys, s.dataKey)}
        />
      ))}
    </LineChart>
  );
}

function AreaChartBody({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const showDots = model.rows.length <= MAX_POINTS_WITH_DOTS;
  const secondaryKeys = secondaryAxisKeys(model.series);
  return (
    <AreaChart accessibilityLayer data={model.rows as Record<string, unknown>[]} margin={CARTESIAN_MARGIN}>
      {/* Gradient mờ dần thay vì màu phẳng opacity 0.2 — vùng dưới đường đọc rõ hơn khi có ≥ 2 series
          xếp lớp, và giống style area chart của dashboard. */}
      <defs>
        {model.series.map((s) => (
          <linearGradient id={`area-${s.dataKey}`} key={s.dataKey} x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={`var(--color-${s.dataKey})`} stopOpacity={0.35} />
            <stop offset="95%" stopColor={`var(--color-${s.dataKey})`} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      <CartesianAxes model={model} reportLabels={reportLabels} />
      {model.series.map((s) => (
        <Area
          activeDot={{ r: 4, strokeWidth: 2 }}
          dataKey={s.dataKey}
          dot={showDots ? { r: 3, strokeWidth: 0, fill: `var(--color-${s.dataKey})` } : false}
          fill={`url(#area-${s.dataKey})`}
          isAnimationActive={false}
          key={s.dataKey}
          stroke={`var(--color-${s.dataKey})`}
          strokeWidth={2}
          type="monotone"
          yAxisId={axisIdFor(secondaryKeys, s.dataKey)}
        />
      ))}
    </AreaChart>
  );
}

function BarChartBody({
  model,
  layout,
  reportLabels,
}: {
  model: ChartModel;
  layout: "horizontal" | "vertical";
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const isVertical = layout === "vertical";
  const valueType = model.series[0]?.type ?? ChartFieldType.Number;
  // Trục Y phụ CHỈ áp dụng cho cột dọc: cột ngang (`hbar`) đặt giá trị lên trục X, thêm trục X thứ
  // hai ở trên đầu là thứ gần như không ai đọc được. Cột ngang có nhiều đơn vị là ca cực hiếm
  // (catalog chỉ cho `hbar` khi trục là nhóm phân loại + xếp hạng theo 1 chỉ số).
  const secondaryKeys = isVertical ? [] : secondaryAxisKeys(model.series);
  const secondaryType = model.series.find((s) => s.dataKey === secondaryKeys[0])?.type;
  // Cột tô theo TỪNG DÒNG (1 series + `rowColor`) phải gắn `fill` vào chính data: prop `shape` chỉ
  // đổi màu HÌNH, còn tooltip đọc màu ở `item.color`/`payload.fill` ⇒ thiếu `fill` thì ô màu tooltip
  // biến mất trong khi cột có màu — cùng họ lỗi "legend lệch màu hình" đã sửa ở pie (23/08).
  const perRowColor = model.series.length === 1 && model.rowColor !== undefined;
  const data = perRowColor
    ? model.rows.map((row, index) => ({ ...row, fill: rowFill(model, row, index) }))
    : model.rows;
  return (
    <BarChart
      accessibilityLayer
      data={data as Record<string, unknown>[]}
      layout={layout}
      margin={isVertical ? { top: 4, right: 16, bottom: 4, left: 4 } : CARTESIAN_MARGIN}
    >
      <CartesianGrid
        horizontal={!isVertical}
        stroke="var(--border)"
        strokeDasharray="3 3"
        strokeOpacity={0.7}
        vertical={isVertical}
      />
      {isVertical ? (
        <>
          <XAxis
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisTick(value, valueType)}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey={model.x.dataKey}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: unknown) => xValueTick(model, value)}
            tickLine={false}
            tickMargin={6}
            type="category"
            width={104}
            yAxisId={PRIMARY_AXIS_ID}
          />
        </>
      ) : (
        <>
          <XAxis
            axisLine={false}
            dataKey={model.x.dataKey}
            interval="preserveStartEnd"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: unknown) => xValueTick(model, value)}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisTick(value, valueType)}
            tickLine={false}
            tickMargin={6}
            width={56}
            yAxisId={PRIMARY_AXIS_ID}
          />
          {secondaryType !== undefined && (
            <YAxis
              axisLine={false}
              orientation="right"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(value: number) => formatAxisTick(value, secondaryType)}
              tickLine={false}
              tickMargin={6}
              width={44}
              yAxisId={SECONDARY_AXIS_ID}
            />
          )}
        </>
      )}
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name, item) => (
              <TooltipItem
                color={tooltipItemColor(item)}
                label={prettifyLabel(String(name), reportLabels)}
                value={formatTooltipValue(Number(value), typeForSeries(model, String(name)))}
              />
            )}
            labelFormatter={(label) => xValueFull(model, label)}
          />
        }
        cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
      />
      {model.series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      {model.series.map((s) => {
        // Chỉ 1 series + có `rowColor` (vd so sánh doanh thu giữa các game) ⇒ tô MỖI CỘT theo màu
        // riêng của dòng đó qua prop `shape` (KHÔNG dùng `Cell`, đã deprecated — xem JSDoc `rowFill`),
        // thay vì 1 màu phẳng cho cả series — khớp màu brand game dùng ở dashboard/reports. Nhiều
        // series thì giữ 1 màu/series như cũ (đang so sánh series, không phải so sánh dòng).
        if (perRowColor) {
          return (
            <Bar
              barSize={isVertical ? undefined : MAX_BAR_WIDTH}
              dataKey={s.dataKey}
              isAnimationActive={false}
              key={s.dataKey}
              maxBarSize={MAX_BAR_WIDTH}
              shape={(shapeProps: BarShapeProps) => (
                <Rectangle
                  {...shapeProps}
                  fill={rowFill(model, shapeProps.payload as ChartRow, shapeProps.index)}
                  radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                />
              )}
              yAxisId={PRIMARY_AXIS_ID}
            />
          );
        }
        return (
          <Bar
            dataKey={s.dataKey}
            fill={`var(--color-${s.dataKey})`}
            isAnimationActive={false}
            key={s.dataKey}
            maxBarSize={MAX_BAR_WIDTH}
            radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            yAxisId={axisIdFor(secondaryKeys, s.dataKey)}
          />
        );
      })}
    </BarChart>
  );
}

/**
 * Dữ liệu cho chart tỷ trọng: sort giảm dần, gộp phần dư ngoài top {@link MAX_PROPORTION_SLICES}
 * thành lát "Khác", và **gắn sẵn `fill`** vào từng dòng.
 *
 * `fill` nằm TRONG data (không truyền qua prop `shape`) là điểm quan trọng: recharts đọc `fill` của
 * từng phần tử để tô lát VÀ để đặt màu ô vuông trong legend/tooltip. Bản trước tô màu bằng `shape`
 * — hình đúng màu nhưng legend không biết màu đó, nên ô vuông legend về màu mặc định và lệch hẳn
 * với hình (staff báo 23/08: "label tháng 1,2,3 không khớp màu chart"). Một nguồn màu duy nhất =
 * legend, tooltip và hình không thể lệch nhau.
 */
function buildProportionRows(model: ChartModel): ChartRow[] {
  const valueKey = model.series[0]?.dataKey ?? "";
  const labelKey = model.x.dataKey;
  const sorted = [...model.rows].sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0));

  const kept =
    sorted.length <= MAX_PROPORTION_SLICES
      ? sorted
      : [
          ...sorted.slice(0, MAX_PROPORTION_SLICES - 1),
          {
            [labelKey]: OTHERS_LABEL,
            [valueKey]: sorted
              .slice(MAX_PROPORTION_SLICES - 1)
              .reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0),
          },
        ];

  return kept.map((row, index) => ({ ...row, fill: rowFill(model, row, index) }));
}

/**
 * Nhãn `28%` in TRỰC TIẾP trên từng lát pie/donut.
 *
 * Đây là thứ đắt giá nhất của biểu đồ tỷ trọng và ảnh 4 thiếu hoàn toàn: không có nhãn nào, người
 * xem phải hover từng lát mới biết lát đó bao nhiêu. Lát quá mỏng (< {@link
 * MIN_SHARE_FOR_INLINE_LABEL}) thì bỏ nhãn để chữ không chồng lên nhau — hover vẫn xem được.
 *
 * ⚠️ Đặt nhãn theo `cx`/`cy` recharts đưa vào, KHÔNG dùng `"50%"`: `cx` là tâm THẬT của vòng (đã trừ
 * chỗ chú giải phía dưới), còn `50%` là giữa khung SVG. Hai giá trị đó lệch nhau đúng bằng nửa chiều
 * cao chú giải, nên bản cũ đẩy toàn bộ nhãn % xuống dưới tâm — feedback 24/08: "số ở mỗi peach bị
 * lệch". Cùng lý do với `TotalInCenter`.
 */
function renderShareLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}): React.ReactElement | null {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  if (percent < MIN_SHARE_FOR_INLINE_LABEL) {
    return null;
  }
  const radian = Math.PI / 180;
  // GIỮA dải vòng (0.5), không phải 0.6: với donut (`innerRadius` 52%, `outerRadius` 78%) dải chỉ dày
  // ~26% bán kính, lệch 0.1 đã đủ đẩy chữ 11px chạm viền ngoài — đúng hiện tượng "số ở mỗi lát bị
  // lệch" (24/08). Pie đặc (`innerRadius` 0) thì 0.5 rơi vào giữa bán kính, vẫn thoáng.
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * radian);
  const y = cy + radius * Math.sin(-midAngle * radian);
  return (
    <text dominantBaseline="central" fill="#fff" fontSize={11} fontWeight={600} textAnchor="middle" x={x} y={y}>
      {formatShare(percent)}
    </text>
  );
}

/**
 * Bán kính pie/donut — dùng CHUNG cho `<Pie>` và khối chữ giữa donut ({@link usePolarCenter}).
 *
 * Phải là MỘT nguồn: hai chỗ tự khai số riêng thì lỗ vòng và ô chữ ở giữa lệch nhau âm thầm, và chỉ
 * phát hiện được bằng mắt trên đúng bộ dữ liệu có nhãn dài.
 */
const DONUT_INNER_RADIUS_RATIO = 0.52;
const DONUT_INNER_RADIUS = `${DONUT_INNER_RADIUS_RATIO * 100}%`;
const PIE_OUTER_RADIUS = "78%";

function PieChartBody({
  model,
  isDonut,
  reportLabels,
}: {
  model: ChartModel;
  isDonut: boolean;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const valueKey = model.series[0]?.dataKey ?? "";
  const valueType = model.series[0]?.type ?? ChartFieldType.Number;
  const data = buildProportionRows(model);
  const total = sumSeries(data, valueKey);
  return (
    <PieChart accessibilityLayer margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name, item) => (
              <TooltipItem
                color={tooltipItemColor(item)}
                label={xValueFull(model, name)}
                // Tỷ trọng đứng TRƯỚC số tuyệt đối: câu hỏi của biểu đồ tròn luôn là "chiếm bao
                // nhiêu phần", số tiền chỉ là chi tiết bổ sung.
                value={`${formatShare(total === 0 ? 0 : Number(value) / total)} · ${formatTooltipValue(Number(value), valueType)}`}
              />
            )}
            hideLabel
          />
        }
      />
      <Pie
        data={data as Record<string, unknown>[]}
        dataKey={valueKey}
        innerRadius={isDonut ? DONUT_INNER_RADIUS : 0}
        isAnimationActive={false}
        label={renderShareLabel}
        labelLine={false}
        nameKey={model.x.dataKey}
        outerRadius={PIE_OUTER_RADIUS}
        paddingAngle={1}
        shape={(shapeProps: PieSectorShapeProps, index: number) => (
          <Sector
            {...shapeProps}
            fill={rowFill(model, shapeProps.payload as ChartRow, index)}
            stroke="var(--card)"
            strokeWidth={2}
          />
        )}
        strokeWidth={2}
      />
      {isDonut && (
        <DonutCenterTotal
          innerRadiusRatio={DONUT_INNER_RADIUS_RATIO}
          label={prettifyLabel(valueKey, reportLabels)}
          value={formatAxisTick(total, valueType)}
        />
      )}
      <ChartLegend content={<ChartLegendContent nameKey={model.x.dataKey} />} />
    </PieChart>
  );
}

/**
 * Tâm thật của vòng pie/donut, tính từ plot area recharts đang dùng.
 *
 * Lặp lại đúng công thức `parseCoordinateOfPie` của recharts (`es6/polar/Pie.js`) cho trường hợp
 * `cx`/`cy` để mặc định `"50%"`: tâm = giữa PLOT AREA (`x + width/2`, `y + height/2`), KHÔNG phải
 * giữa khung SVG — plot area đã trừ chỗ chú giải ở đáy nên hai điểm lệch nhau nửa chiều cao chú
 * giải. `usePlotArea` là hook public (recharts ≥ 3.1) trả về đúng vùng đó.
 *
 * `maxRadius` cũng theo recharts: `getMaxRadius` = min(width, height) / 2 (chart không có margin
 * bất đối xứng), nên bán kính trong của donut = `maxRadius × innerRadiusRatio`.
 */
function usePolarCenter(innerRadiusRatio: number): { cx: number; cy: number; innerRadius: number } | null {
  const plotArea = usePlotArea();
  if (plotArea === undefined) {
    return null;
  }
  const { x, y, width, height } = plotArea;
  const maxRadius = Math.min(width, height) / 2;
  return { cx: x + width / 2, cy: y + height / 2, innerRadius: maxRadius * innerRadiusRatio };
}

/**
 * Khối chữ giữa donut — tổng + tên chỉ số.
 *
 * ⚠️ KHÔNG dùng `<Label position="center">` (bản trước đã thử và MẤT HẲN chữ — feedback 24/08 lần
 * 3): recharts 3.8.1 `Label` có dòng
 * `resolvedViewBox = position === 'center' ? cartesianViewBox : polarViewBox ?? cartesianViewBox`
 * (`es6/component/Label.js:277`, kèm comment "I am not proud about this solution"). Với
 * `position="center"` nó ép dùng **cartesian** viewBox, mà `PieChart` không có trục nên viewBox đó
 * chỉ có `x/y/width/height` — `cx`/`cy` KHÔNG tồn tại. Hàm bóc toạ độ của ta yêu cầu cả hai là số
 * nên trả `null` ⇒ không render gì. Bỏ `position` thì nhánh polar chạy, nhưng khi đó recharts tự
 * đặt toạ độ theo `getAttrsOfPolarLabel` và ghi đè `x`/`y` của ta.
 *
 * Vì vậy component này KHÔNG qua `Label`: render `<text>` thẳng vào SVG của chart, toạ độ tự tính
 * bằng `usePlotArea` (xem {@link usePolarCenter}). Hết phụ thuộc vào cách `Label` chọn viewBox.
 */
function DonutCenterTotal({
  innerRadiusRatio,
  label,
  value,
}: {
  innerRadiusRatio: number;
  label: string;
  value: string;
}) {
  const center = usePolarCenter(innerRadiusRatio);
  if (center === null) {
    return null;
  }
  // Lỗ donut rộng `2 × innerRadius`; chừa 4px mỗi bên để chữ không chạm viền vòng. Số tiền dài
  // (`19,18 Tỷ`) ở donut nhỏ sẽ tràn ra ngoài lỗ — `textLength` co chữ lại thay vì để nó đè lên vòng.
  const maxTextWidth = Math.max(center.innerRadius * 2 - 8, 0);
  return (
    <text dominantBaseline="central" textAnchor="middle" x={center.cx} y={center.cy}>
      <tspan className="fill-foreground font-semibold text-lg" dy="-8" x={center.cx}>
        {value}
      </tspan>
      <tspan
        className="fill-muted-foreground text-xs"
        dy="18"
        lengthAdjust="spacingAndGlyphs"
        textLength={maxTextWidth === 0 ? undefined : maxTextWidth}
        x={center.cx}
      >
        {label}
      </tspan>
    </text>
  );
}

/**
 * Radar — chỉ dùng khi MỌI series cùng thang `%` (catalog `allPercentSeries`), nên trục bán kính
 * có thang đọc được là bắt buộc: bản cũ `tick={false}` biến mọi vòng thành hình không đơn vị, người
 * xem chỉ thấy "hình này to hơn hình kia" mà không biết 40% hay 90%.
 */
function RadarChartBody({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const valueType = model.series[0]?.type ?? ChartFieldType.Number;
  return (
    <RadarChart data={model.rows as Record<string, unknown>[]} outerRadius="72%">
      <PolarGrid stroke="var(--border)" strokeOpacity={0.8} />
      <PolarAngleAxis
        dataKey={model.x.dataKey}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickFormatter={(value: unknown) => xValueTick(model, value)}
      />
      <PolarRadiusAxis
        axisLine={false}
        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
        tickCount={4}
        tickFormatter={(value: number) => formatAxisTick(value, valueType)}
      />
      {model.series.map((s) => (
        <Radar
          dataKey={s.dataKey}
          fill={`var(--color-${s.dataKey})`}
          fillOpacity={0.2}
          isAnimationActive={false}
          key={s.dataKey}
          stroke={`var(--color-${s.dataKey})`}
          strokeWidth={2}
        />
      ))}
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name, item) => (
              <TooltipItem
                color={tooltipItemColor(item)}
                label={prettifyLabel(String(name), reportLabels)}
                value={formatTooltipValue(Number(value), typeForSeries(model, String(name)))}
              />
            )}
            labelFormatter={(label) => xValueFull(model, label)}
          />
        }
      />
      <ChartLegend content={<ChartLegendContent />} />
    </RadarChart>
  );
}

// `reportLabels` KHÔNG cần ở đây: radialBar tô theo TỪNG DÒNG nên nhãn lấy từ giá trị trục X
// (`formatXAxisFullLabel`), không phải tên field ⇒ không có gì để tra trong bảng nhãn báo cáo.
function RadialBarChartBody({ model }: { model: ChartModel }) {
  const valueKey = model.series[0]?.dataKey ?? "";
  const valueType = model.series[0]?.type ?? ChartFieldType.Number;
  const data = buildProportionRows(model);
  return (
    <RadialBarChart
      data={data as Record<string, unknown>[]}
      endAngle={-270}
      innerRadius="34%"
      outerRadius="92%"
      startAngle={90}
    >
      {/* Thang góc TƯỜNG MINH: mặc định recharts lấy max của data làm 1 vòng đầy ⇒ mục cao nhất (vd
          70%) luôn vẽ thành vòng KÍN, nhìn như đã đạt 100%. Đây là "vòng tiến độ", mốc so sánh phải
          là 100% cố định, không phải mục lớn nhất trong tập. */}
      <PolarAngleAxis domain={[0, radialDomainMax(data, valueKey, valueType)]} tick={false} type="number" />
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name, item) => (
              <TooltipItem
                color={tooltipItemColor(item)}
                label={xValueFull(model, name)}
                value={formatTooltipValue(Number(value), valueType)}
              />
            )}
            hideLabel
          />
        }
      />
      <RadialBar background={{ fill: "var(--muted)" }} cornerRadius={4} dataKey={valueKey} isAnimationActive={false} />
      <ChartLegend content={<ChartLegendContent nameKey={model.x.dataKey} />} />
    </RadialBarChart>
  );
}

/**
 * Mốc "1 vòng đầy" của vòng tiến độ: `%` luôn là 1 (100%), đơn vị khác thì lấy giá trị lớn nhất.
 *
 * Vòng lặp thay vì `Math.max(...values)` — spread mảng lớn có giới hạn engine (react-best-practices
 * §7.10), và ở đây không cần sort/copy gì.
 */
function radialDomainMax(rows: readonly ChartRow[], valueKey: string, valueType: ChartFieldType): number {
  if (valueType === ChartFieldType.Percent) {
    return 1;
  }
  let max = 0;
  for (const row of rows) {
    const value = Number(row[valueKey] ?? 0);
    if (value > max) {
      max = value;
    }
  }
  return max;
}

/**
 * Biểu đồ phân tán — 2 trục đều là SỐ, mỗi điểm là 1 dòng dữ liệu.
 *
 * Bốn thứ bản cũ thiếu (feedback 24/08, ảnh "Phân tán"):
 * 1. **Nhãn trục.** Prop `name` của `XAxis`/`YAxis` KHÔNG in gì lên hình (chỉ đi vào tooltip), nên
 *    người xem thấy hai trục số trần "0 · 50M · 100M" mà không biết trục nào là chỉ số nào — đây là
 *    biểu đồ duy nhất trong catalog mà CẢ HAI trục cần nhãn, vì cả hai đều là chỉ số. Giờ vẽ bằng
 *    `Label`.
 * 2. **Đơn vị trong tooltip.** Bản cũ đặt `name={prettifyLabel(...)}` rồi tra `typeForSeries(model,
 *    name)` — tra bằng NHÃN trong danh sách khoá theo `dataKey` ⇒ luôn miss ⇒ mọi giá trị rơi về
 *    `number`, tiền in ra số trần không có `₫`. Giờ bỏ `name` (recharts tự dùng `dataKey`) và tra
 *    kiểu từ `pair`.
 * 3. **Dòng nào?** Ở ca tương quan 2 chỉ số, field trục X của model (vd ngày) không nằm trên trục
 *    nào — không in nó ra thì hover 1 điểm chỉ biết "185tr cược / 13tr thắng" mà không biết ngày nào.
 * 4. **Chú giải.** Xem `ScatterLegend` — thiếu nó, người xem tưởng chỉ số nằm ở trục dọc bị "mất".
 *
 * Ô màu trong tooltip bị BỎ có chủ đích: ở phân tán màu không mã hoá series nào (chỉ có 1 tập điểm),
 * nên hai dòng x/y cùng màu là đúng bản chất — nhưng hiện 2 ô cùng màu cạnh 2 tên field khác nhau thì
 * người xem hiểu thành "hai field này cùng một nhóm" (đúng điều được báo 24/08). Không ô màu = không
 * suy diễn sai; phân biệt field bằng nhãn trục, thứ có thật trên hình.
 */
function ScatterChartBody({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const pair = scatterAxisPair(model);
  if (pair === null) {
    return null;
  }
  const typeOf = (dataKey: string): ChartFieldType =>
    dataKey === pair.x.dataKey ? pair.x.type : dataKey === pair.y.dataKey ? pair.y.type : ChartFieldType.Number;
  const scatterLegendText = scatterLegendLabel(pair.identityKey, reportLabels);
  return (
    <ScatterChart accessibilityLayer margin={{ top: 12, right: 16, bottom: 24, left: 4 }}>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.7} />
      <XAxis
        axisLine={false}
        dataKey={pair.x.dataKey}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickFormatter={(value: number) => formatAxisTick(value, pair.x.type)}
        tickLine={false}
        tickMargin={8}
        type="number"
      >
        <Label
          className="fill-muted-foreground text-[11px]"
          offset={-14}
          position="insideBottom"
          value={prettifyLabel(pair.x.dataKey, reportLabels)}
        />
      </XAxis>
      <YAxis
        axisLine={false}
        dataKey={pair.y.dataKey}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        tickFormatter={(value: number) => formatAxisTick(value, pair.y.type)}
        tickLine={false}
        tickMargin={6}
        type="number"
        width={56}
      >
        <Label
          angle={-90}
          className="fill-muted-foreground text-[11px]"
          position="insideLeft"
          style={{ textAnchor: "middle" }}
          value={prettifyLabel(pair.y.dataKey, reportLabels)}
        />
      </YAxis>
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value, name) => (
              <TooltipItem
                color={undefined}
                label={prettifyLabel(String(name), reportLabels)}
                value={formatTooltipValue(Number(value), typeOf(String(name)))}
              />
            )}
            hideLabel={pair.identityKey === undefined}
            labelFormatter={(_label, payload) => scatterPointLabel(model, payload, pair.identityKey)}
          />
        }
        cursor={{ strokeDasharray: "3 3" }}
      />
      <Scatter
        data={model.rows as Record<string, unknown>[]}
        fill={`var(--color-${pair.y.dataKey})`}
        // Điểm trùng nhau là chuyện thường ở phân tán (vd 3 tháng đều 0 nằm chồng ở gốc) — hơi trong
        // suốt để chỗ chồng đậm màu hơn, nhìn ra được "ở đây có nhiều điểm" thay vì tưởng chỉ 1.
        fillOpacity={0.8}
        isAnimationActive={false}
      />
      <ChartLegend content={<ScatterLegend color={`var(--color-${pair.y.dataKey})`} text={scatterLegendText} />} />
    </ScatterChart>
  );
}

/**
 * Chú giải của phân tán — GIẢI THÍCH ĐIỂM, không liệt kê series.
 *
 * Bản đầu không có chú giải nào, và điều đó gây hiểu sai thật (feedback 24/08: _"vì sao không thấy số
 * liệu Keno?"_ trong khi Keno CHÍNH LÀ trục dọc). Nguyên nhân: ở cột/đường, mỗi chỉ số là 1 series có
 * màu riêng ⇒ người xem học được luật "tra màu trong chú giải để biết chỉ số nào". Phân tán phá luật
 * đó — chỉ có MỘT tập điểm, chỉ số nằm trên TRỤC chứ không nằm ở màu ⇒ không có gì để tra màu, và sự
 * vắng mặt của chú giải bị đọc thành "chỉ số kia bị thiếu".
 *
 * Vì vậy không dùng `ChartLegendContent` (nó tra nhãn theo `dataKey` trong config — sai mô hình ở
 * đây): chú giải này nói thẳng 1 điểm nghĩa là gì.
 */
function ScatterLegend({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-3 text-muted-foreground text-xs">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {text}
    </div>
  );
}

/**
 * `"Mỗi điểm: 1 ngày tài chính"` — hạ chữ đầu của nhãn để câu đọc tự nhiên (`"1 Ngày tài chính"` sai
 * chính tả tiếng Việt giữa câu). Không có field nhận diện (trục X đã là số) thì nói "1 dòng dữ liệu".
 */
function scatterLegendLabel(identityKey: string | undefined, reportLabels?: Readonly<Record<string, string>>): string {
  if (identityKey === undefined) {
    return "Mỗi điểm: 1 dòng dữ liệu";
  }
  const label = prettifyLabel(identityKey, reportLabels);
  return `Mỗi điểm: 1 ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** Tiêu đề tooltip của 1 điểm phân tán = giá trị field nhận diện dòng (ngày/nhóm) của chính điểm đó. */
function scatterPointLabel(
  model: ChartModel,
  payload: readonly { payload?: ChartRow }[] | undefined,
  identityKey: string | undefined,
): string {
  if (identityKey === undefined) {
    return "";
  }
  return xValueFull(model, payload?.[0]?.payload?.[identityKey]);
}

/**
 * Biểu đồ kết hợp — cột cho MỌI series ở trục trái, đường cho MỌI series ở trục phải.
 *
 * Bản cũ vẽ đúng 2 series: cột = `series[0]`, đường = series khác nó ĐẦU TIÊN. Với 4 series
 * `[totalStake, ggr, netProfit, payoutRatio]` (3 tiền + 1 `%` — shape rất thường của báo cáo ngày),
 * đường rơi vào `ggr` (cùng đơn vị tiền, đáng lẽ là cột) còn `payoutRatio` — CHÍNH LÀ lý do tồn tại
 * của loại "kết hợp" — không được vẽ, dù legend vẫn liệt kê nó ⇒ chú giải có 4 mục mà hình có 2.
 * Giờ chia theo ĐƠN VỊ (`secondaryAxisKeys`): cùng đơn vị series đầu → cột (trục trái), đơn vị khác
 * → đường (trục phải). Mọi series trong legend đều có mặt trên hình.
 */
function ComposedChartBody({
  model,
  reportLabels,
}: {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}) {
  const secondaryKeys = secondaryAxisKeys(model.series);
  // Không có đơn vị thứ hai (chỉ xảy ra khi `ChartOverride` ép `composed` cho dữ liệu 1 đơn vị):
  // giữ hành vi cũ — series đầu là cột, phần còn lại là đường, để không mất series nào.
  const barKeys =
    secondaryKeys.length > 0
      ? model.series.filter((s) => !secondaryKeys.includes(s.dataKey))
      : model.series.slice(0, 1);
  const lineKeys = model.series.filter((s) => !barKeys.includes(s));
  return (
    <ComposedChart accessibilityLayer data={model.rows as Record<string, unknown>[]} margin={CARTESIAN_MARGIN}>
      <CartesianAxes model={model} reportLabels={reportLabels} />
      {barKeys.map((s) => (
        <Bar
          dataKey={s.dataKey}
          fill={`var(--color-${s.dataKey})`}
          isAnimationActive={false}
          key={s.dataKey}
          maxBarSize={MAX_BAR_WIDTH}
          radius={[4, 4, 0, 0]}
          yAxisId={PRIMARY_AXIS_ID}
        />
      ))}
      {lineKeys.map((s) => (
        <Line
          activeDot={{ r: 4, strokeWidth: 2 }}
          dataKey={s.dataKey}
          dot={false}
          isAnimationActive={false}
          key={s.dataKey}
          stroke={`var(--color-${s.dataKey})`}
          strokeWidth={2}
          type="monotone"
          yAxisId={axisIdFor(secondaryKeys, s.dataKey)}
        />
      ))}
    </ComposedChart>
  );
}

/**
 * Component chính — nhận `ChartModel` đã suy luận đầy đủ, tự chọn khung recharts đúng theo `kind`.
 *
 * `reportLabels` (từ `REPORT_COLUMN_LABELS`) được truyền TỪ NGOÀI (`chart-tool-view.tsx`) — file
 * này không import `@megawin/game-core/labels` trực tiếp để tránh phụ thuộc domain game ở tầng
 * render thuần recharts.
 */
export interface ChartBodyProps {
  model: ChartModel;
  reportLabels?: Readonly<Record<string, string>>;
}

/** pie/donut/radialBar tô màu theo TỪNG DÒNG ⇒ config phải khai theo giá trị trục X (xem `buildProportionConfig`). */
function isProportionKind(kind: ChartKind): boolean {
  return kind === ChartKind.Pie || kind === ChartKind.Donut || kind === ChartKind.RadialBar;
}

export default function ChartBody({ model, reportLabels }: ChartBodyProps) {
  const proportional = isProportionKind(model.kind);
  // Truyền ĐÚNG mảng đã sort/gộp mà pie/donut/radialBar thực sự vẽ — xem cảnh báo trong JSDoc
  // `buildProportionConfig` (dùng `model.rows` ở đây là nguyên nhân bug lệch màu legend 23/08).
  const config = proportional
    ? buildProportionConfig(model, buildProportionRows(model), reportLabels)
    : buildChartConfig(model.series, reportLabels);

  // `hbar` cao theo SỐ DÒNG: chiều cao cố định làm 12 dòng bị nén thành các vạch 6px dính nhau,
  // còn 3 dòng thì thừa nửa card trống. Các kind khác dùng chiều cao cố định (`CHART_HEIGHT_CLASS`)
  // để cùng dữ liệu trong panel và ở `/ai` nhìn giống nhau.
  const isHBar = model.kind === ChartKind.HBar;
  const hbarHeightPx = Math.max(HBAR_MIN_HEIGHT, model.rows.length * HBAR_ROW_HEIGHT + 48);

  return (
    <ChartContainer
      className={cn("w-full", isHBar ? undefined : CHART_HEIGHT_CLASS[model.kind])}
      config={config}
      style={isHBar ? { height: hbarHeightPx } : undefined}
    >
      {renderChartByKind(model, reportLabels)}
    </ChartContainer>
  );
}

function renderChartByKind(model: ChartModel, reportLabels?: Readonly<Record<string, string>>): React.ReactElement {
  switch (model.kind) {
    case ChartKind.Line:
      return <LineChartBody model={model} reportLabels={reportLabels} />;
    case ChartKind.Area:
      return <AreaChartBody model={model} reportLabels={reportLabels} />;
    case ChartKind.Bar:
      return <BarChartBody layout="horizontal" model={model} reportLabels={reportLabels} />;
    case ChartKind.HBar:
      return <BarChartBody layout="vertical" model={model} reportLabels={reportLabels} />;
    case ChartKind.Pie:
      return <PieChartBody isDonut={false} model={model} reportLabels={reportLabels} />;
    case ChartKind.Donut:
      return <PieChartBody isDonut model={model} reportLabels={reportLabels} />;
    case ChartKind.Radar:
      return <RadarChartBody model={model} reportLabels={reportLabels} />;
    case ChartKind.RadialBar:
      return <RadialBarChartBody model={model} />;
    case ChartKind.Scatter:
      // Không đủ 2 field số (chỉ xảy ra khi `ChartOverride.allowedKinds` ép `scatter` cho dữ liệu
      // 1 chỉ số) ⇒ vẽ cột thay vì trả `null` để lại một card trống không giải thích được.
      return scatterAxisPair(model) === null ? (
        <BarChartBody layout="horizontal" model={model} reportLabels={reportLabels} />
      ) : (
        <ScatterChartBody model={model} reportLabels={reportLabels} />
      );
    case ChartKind.Composed:
      return <ComposedChartBody model={model} reportLabels={reportLabels} />;
    default:
      return <LineChartBody model={model} reportLabels={reportLabels} />;
  }
}
