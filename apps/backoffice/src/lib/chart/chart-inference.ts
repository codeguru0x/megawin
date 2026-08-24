/**
 * Engine suy luận `ChartModel` từ 1 mảng dữ liệu bảng bất kỳ (pure, unit-test được).
 *
 * KHÔNG import React/JSX — file này chỉ tính TOÁN, tách khỏi tầng render
 * (`components/ai-chat/chart/chart-body.tsx`, `chart-tool-view.tsx`) để test nhanh và không kéo
 * theo recharts vào bundle test.
 *
 * Sống ở `src/lib/chart/` (không phải `components/ai-chat/chart/`) — dùng được cho MỌI nguồn dữ
 * liệu bảng trong backoffice, không riêng output tool AI (xem JSDoc `index.ts`).
 *
 * Luồng: `extractRows(output)` → phân loại cột (`classifyColumns`) → chọn trục + series
 * (`buildChartModel`) → áp `chartType` do caller yêu cầu (nếu có, vd tool `renderChart` hoặc field
 * `rows` do model tự trích xuất từ dữ liệu user cung cấp — xem `agent/tools/renderChart.ts`) → áp
 * override per-tool (nếu có khai ở `tool-renderers/view-spec.ts`).
 */

import { ChartFieldType, ChartKind, getChartCatalogEntry, suitableChartKinds } from "./chart-catalog";

/** 1 dòng dữ liệu đã rút — giá trị field có thể là bất kỳ kiểu JSON nào lúc đầu vào. */
export type ChartRow = Record<string, unknown>;

/** Số điểm dữ liệu tối đa vẽ trên chart — quá số này thì bucket/gộp "Khác" (xem `tsimData`). */
const MAX_POINTS = 60;

/** Số cột series tối đa lấy từ suy luận (đủ cho tab Bảng xem hết, chart chỉ vẽ tối đa 4). */
const MAX_SERIES = 4;

/** Số dòng tối đa quét để phân loại cột — output có thể dài hơn nhưng suy luận chỉ cần mẫu. */
const CLASSIFY_SAMPLE_SIZE = 50;

/** Distinct tối đa để 1 cột string được coi là `category` (thay vì text tự do bỏ qua). */
const MAX_CATEGORY_DISTINCT = 30;

/** Key quen thuộc để tìm mảng dữ liệu trong output dạng object (ưu tiên theo thứ tự). */
const ARRAY_FIELD_CANDIDATES = ["rows", "items", "data", "days", "games", "draws", "cycles", "history", "results"];

/**
 * Regex tên field khớp "tiền" — dùng khi field là number và tên gợi ý đơn vị VND.
 *
 * Kèm từ tiếng Việt (`tiền`, `doanh thu`, `cược`, `thưởng`, `hoa hồng`, `lợi nhuận`, `chi phí`) vì
 * sau feedback QA 24/08 hướng dẫn ad-hoc `rows` (`55-charts.md`) đổi sang buộc model viết key CÓ DẤU
 * (`"tổng tiền cược"` thay vì `"totalStake"`/`"tongTienCuoc"`) — pattern chỉ có từ tiếng Anh trước đó
 * không khớp được key tiếng Việt, khiến field tiền của dữ liệu tự nhập rơi về `number` thường (mất
 * định dạng K/M/B VND trên trục/tooltip).
 */
const CURRENCY_NAME_PATTERN =
  /revenue|amount|payout|prize|balance|jackpot|net|ggr|cost|fee|commission|stake|profit|total(?!count)|tiền|doanh ?thu|cược|thưởng|hoa ?hồng|lợi ?nhuận|chi ?phí/i;

/**
 * Regex tên field khớp "phần trăm".
 *
 * PHẢI kiểm tra TRƯỚC {@link CURRENCY_NAME_PATTERN}: nhiều field tỷ lệ mang luôn tên chỉ số gốc
 * (`payoutRatio`, `prizeRate`, `commissionPct`) nên khớp cả hai. Xét tiền trước thì `payoutRatio`
 * bị gán `currency` ⇒ mọi series cùng một đơn vị ⇒ biểu đồ "Kết hợp" (cần ≥2 đơn vị) bị loại oan,
 * và trục Y in `0,7 ₫` thay vì `70%`.
 *
 * Kèm từ tiếng Việt (`tỷ lệ`/`tỉ lệ`, `phần trăm`) — cùng lý do với {@link CURRENCY_NAME_PATTERN}:
 * thiếu nhánh này thì field `%` viết tiếng Việt bị phân loại `number`, và `radar`/`radialBar` (yêu
 * cầu MỌI series đều `percent` — xem `allPercentSeries` ở `chart-catalog.ts`) gần như KHÔNG BAO GIỜ
 * được chọn cho dữ liệu ad-hoc, kể cả khi dữ liệu hoàn toàn hợp lệ. Phát hiện qua QA UI 24/08: 9 lần
 * thử radar với dữ liệu % sạch đều bị hệ thống tự đổi sang bar/line mà không còn lý do dữ liệu nào
 * hợp lý để giải thích.
 */
const PERCENT_NAME_PATTERN = /rate|ratio|percent|pct|t[ỷỉ] ?l[ệê]|phần ?trăm/i;

/** Regex tên field bị BỎ QUA hoàn toàn khỏi suy luận (id kỹ thuật, không phải chỉ số). */
const IGNORED_NAME_PATTERN = /^id$|Id$|^_/;

/** ISO date/datetime: `YYYY-MM-DD` hoặc có phần time `THH:mm`. Export để `chart-format.ts` phân biệt date vs drawId khi format tick trục X. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}|$)/;

/**
 * Tháng dạng `YYYY-MM` — output tool gộp theo tháng dùng shape này (vd `{ month: "2026-03" }`).
 *
 * PHẢI có pattern riêng (thêm 23/08): trước đây `"2026-03"` không khớp `ISO_DATE_PATTERN` (thiếu
 * ngày) nên cột đó bị phân loại là `category` ⇒ chuỗi tháng mất tính thời gian (không sort, không
 * được phép vẽ đường/miền) và trục X in nguyên `"2026-03"` (ảnh 3, feedback 23/08).
 */
export const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** drawId format `YYYY-MM-DD.NNN` (xem quy ước DrawId toàn hệ thống). Export cùng lý do trên. */
export const DRAW_ID_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{3}$/;

/**
 * Rút danh sách rows từ output tool — trả `null` nếu không tìm được mảng object ≥ 2 phần tử.
 *
 * Output đã là mảng → dùng luôn (mọi phần tử phải là object, không phải primitive).
 * Output là object → quét field theo thứ tự ưu tiên `ARRAY_FIELD_CANDIDATES`, sau đó tới field
 * mảng object bất kỳ đầu tiên tìm được.
 */
export function extractRows(output: unknown): ChartRow[] | null {
  const rows = findRowsArray(output);
  if (rows === null || rows.length < 2) {
    return null;
  }
  return rows;
}

function isFlatObjectArray(value: unknown): value is ChartRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
}

function findRowsArray(output: unknown): ChartRow[] | null {
  if (isFlatObjectArray(output)) {
    return output;
  }
  if (typeof output !== "object" || output === null) {
    return null;
  }

  const record = output as Record<string, unknown>;

  for (const key of ARRAY_FIELD_CANDIDATES) {
    const candidate = record[key];
    if (isFlatObjectArray(candidate)) {
      return candidate;
    }
  }

  // Không khớp key quen thuộc → tìm field mảng-object BẤT KỲ đầu tiên (fallback rộng).
  for (const value of Object.values(record)) {
    if (isFlatObjectArray(value)) {
      return value;
    }
  }

  return null;
}

/** 1 cột đã phân loại — dùng để chọn trục X + series ở `buildChartModel`. */
export interface ClassifiedColumn {
  key: string;
  type: ChartFieldType;
  /** Số giá trị PHÂN BIỆT quan sát được trong mẫu — dùng để chọn trục X ưu tiên category nhiều nhất. */
  distinctCount: number;
}

/** Field time: string ISO date/datetime, tháng `YYYY-MM`, hoặc drawId `YYYY-MM-DD.NNN`. */
function isTimeValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return ISO_DATE_PATTERN.test(value) || ISO_MONTH_PATTERN.test(value) || DRAW_ID_PATTERN.test(value);
}

/**
 * Phân loại TẤT CẢ cột xuất hiện trong mẫu `rows.slice(0, CLASSIFY_SAMPLE_SIZE)`.
 *
 * Quy tắc theo thứ tự ưu tiên (khớp bảng §2.2 kế hoạch p1-05):
 * 1. Tên field khớp `IGNORED_NAME_PATTERN` (id-like), hoặc giá trị boolean/object lồng → bỏ qua.
 * 2. Giá trị string khớp `isTimeValue` ở ĐA SỐ mẫu không rỗng → `time`.
 * 3. Giá trị number + tên khớp `CURRENCY_NAME_PATTERN` → `currency`.
 * 4. Giá trị number + tên khớp `PERCENT_NAME_PATTERN` → `percent`.
 * 5. Giá trị number còn lại → `number`.
 * 6. Giá trị string còn lại, distinct ≤ `MAX_CATEGORY_DISTINCT` → `category`.
 * 7. Còn lại (string tự do distinct lớn, kiểu khác) → bỏ qua (không có trong kết quả trả về).
 */
export function classifyColumns(rows: readonly ChartRow[]): ClassifiedColumn[] {
  const sample = rows.slice(0, CLASSIFY_SAMPLE_SIZE);
  const keys = collectKeys(sample);
  const columns: ClassifiedColumn[] = [];

  for (const key of keys) {
    if (IGNORED_NAME_PATTERN.test(key)) {
      continue;
    }
    const values = sample.map((row) => row[key]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) {
      continue;
    }

    const classified = classifyColumn(key, values);
    if (classified !== null) {
      columns.push(classified);
    }
  }

  return columns;
}

function collectKeys(rows: readonly ChartRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** Đa số (>50%) giá trị mẫu là time-like → coi cột này là `time`. */
function classifyColumn(key: string, values: unknown[]): ClassifiedColumn | null {
  const timeLikeCount = values.filter(isTimeValue).length;
  if (timeLikeCount / values.length > 0.5) {
    return { key, type: ChartFieldType.Time, distinctCount: new Set(values).size };
  }

  const numericValues = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numericValues.length / values.length > 0.5) {
    // Tỷ lệ xét TRƯỚC tiền — xem JSDoc `PERCENT_NAME_PATTERN`.
    if (PERCENT_NAME_PATTERN.test(key)) {
      return { key, type: ChartFieldType.Percent, distinctCount: numericValues.length };
    }
    if (CURRENCY_NAME_PATTERN.test(key)) {
      return { key, type: ChartFieldType.Currency, distinctCount: numericValues.length };
    }
    return { key, type: ChartFieldType.Number, distinctCount: numericValues.length };
  }

  const stringValues = values.filter((v): v is string => typeof v === "string");
  if (stringValues.length / values.length > 0.5) {
    const distinct = new Set(stringValues).size;
    if (distinct <= MAX_CATEGORY_DISTINCT) {
      return { key, type: ChartFieldType.Category, distinctCount: distinct };
    }
  }

  // boolean / object lồng / string tự do quá nhiều distinct → không mô tả được, bỏ qua.
  return null;
}

/** 1 series sẽ vẽ trên chart — trục Y (hoặc lát pie/radar). */
export interface ChartSeries {
  dataKey: string;
  label: string;
  type: ChartFieldType;
  /** Màu cố định (hex/CSS var) — override mới có, suy luận thuần để `chart-body.tsx` tự cấp theo palette `--chart-N`. */
  color?: string;
}

/** Trục X đã chọn — `label` mặc định = prettify(key), override có thể đổi. */
export interface ChartAxis {
  dataKey: string;
  label: string;
  type: ChartFieldType;
}

/**
 * Kết quả suy luận đầy đủ — input cho `chart-body.tsx` render trực tiếp, không cần tính lại.
 *
 * `kind` là kind SAU KHI đã merge chartType (nếu hợp lệ) + override — xem `buildChartModel`.
 */
export interface ChartModel {
  kind: ChartKind;
  allowedKinds: readonly ChartKind[];
  /**
   * `chartType` mà user/model yêu cầu nhưng KHÔNG nằm trong `allowedKinds`.
   *
   * KHÔNG hiển thị trên card (bỏ 24/08 — xem `chart-tool-view.tsx`): FE không biết loại đó do người
   * hỏi nêu rõ hay do model đoán, nên note kiểu "loại X không phù hợp" hoặc là lặp lại điều Mira đã
   * giải thích, hoặc là phơi chuyện nội bộ. Field vẫn giữ vì `renderChart` (BE) trả nó về cho model
   * — model cần biết loại yêu cầu đã bị đổi để nói cho đúng trong câu trả lời.
   */
  rejectedKind?: ChartKind;
  x: ChartAxis;
  series: readonly ChartSeries[];
  rows: ChartRow[];
  title: string;
  /**
   * Màu riêng cho TỪNG dòng (bar 1-series/pie/donut/radialBar) — từ `ChartOverride.rowColor`
   * (vd `getGameHex(row.gameProduct)`). `undefined` ⇒ `chart-body.tsx` dùng palette `--chart-N`
   * mặc định. Chỉ có tác dụng khi biểu đồ vẽ MỖI DÒNG một màu (không phải mỗi SERIES một màu).
   */
  rowColor?: (row: ChartRow) => string | undefined;
  /**
   * Đổi GIÁ TRỊ trục X thô thành nhãn hiển thị — vd `"power655"` → `"Power 6/55"`, từ
   * `ChartOverride.xLabel`. Áp cho MỌI chỗ giá trị đó xuất hiện: tick trục, chú giải, tooltip và
   * bảng số liệu dưới card.
   *
   * Có vì feedback 24/08: biểu đồ so sánh game in nguyên mã kỹ thuật (`power655`, `lotto535`) trong
   * khi cả backoffice gọi là `Power 6/55`, `Lotto 5/35` (`GAME_LABELS` là nguồn chân lý). Nhận
   * `string` thay vì `ChartRow` để mọi tầng đều tra được: recharts đưa cho tick/legend/tooltip
   * formatter đúng GIÁ TRỊ, không đưa cả dòng.
   */
  xLabel?: (value: string) => string | undefined;
}

/**
 * Override tuỳ chọn khai qua `ToolViewSpec.chart` (`view-spec.ts`) — MỌI field optional, merge ĐÈ
 * lên kết quả suy luận thuần. Chỉ khai khi suy luận mặc định không đủ tốt (màu riêng theo game,
 * ép loại chart mặc định/cho phép) — mặc định KHÔNG khai gì, để engine tự suy luận (§2.4 kế hoạch
 * p1-05-chart-generative-ui).
 *
 * `Row` khớp kiểu dòng của CHÍNH `ToolViewSpec` khai override này — an toàn ở runtime vì rows mà
 * `buildChartModel` nhận qua `extractRows(output)` chính là mảng `spec.select(output)` trả về cho
 * CÙNG tool đó (`registry.tsx` ép kiểu 1 lần tại điểm khai, xem `toChartOverride`).
 */
export interface ChartOverride<Row> {
  /** Ép `kind` mặc định (trước khi áp `requestedKind` từ tool `renderChart`), thay vì phần tử đầu `allowedKinds` suy luận. */
  defaultKind?: ChartKind;
  /** Ép danh sách kind cho phép hiện trên toggle, thay hoàn toàn `suitableChartKinds` suy luận. */
  allowedKinds?: readonly ChartKind[];
  /** Tiêu đề card cố định — thay `title` mặc định (nhãn tool, xem `getToolLabel`). */
  title?: string;
  /** Màu riêng cho MỖI dòng — vd `(row) => getGameHex(row.gameProduct)`. `undefined` ⇒ palette mặc định. */
  rowColor?: (row: Row) => string | undefined;
  /**
   * Đổi giá trị trục X thô thành nhãn hiển thị — vd `(value) => getGameLabel(value as GameProduct)`
   * để `"power655"` hiện thành `"Power 6/55"`. `undefined` (hoặc trả `undefined`) ⇒ dùng giá trị thô.
   */
  xLabel?: (value: string) => string | undefined;
  /**
   * Ép `ChartFieldType` của MỘT cột series theo TÊN CỘT, sau khi `classifyColumns` đã suy luận
   * xong — chỉ có tác dụng khi trả về khác `undefined` (trả `undefined` ⇒ giữ nguyên kiểu suy luận).
   * KHÔNG BAO GIỜ áp cho cột đã được phân loại `time` (`buildChartModel` tự chặn) — override này
   * chỉ để phân loại lại cột SỐ ĐO, ép cả trục thời gian sẽ làm mất trục X (xem lỗi thật dưới đây).
   *
   * Cần vì `classifyColumns` chỉ đọc được TÊN cột — với `getFinancialTrendByGame`
   * (`GamePeriodByGameRow`), tên cột là mã game (`"keno"`, `"power655"`) chứ không phải tên chỉ số
   * (`"ggr"`, `"totalStake"`), nên `CURRENCY_NAME_PATTERN` không khớp được và mọi cột game bị rơi
   * về `number` thường dù `metric` thực tế là tiền — tooltip mất `₫`. `registry.tsx` dùng field này
   * để tra `metric`/`games` từ `input` của lần gọi tool và ép đúng loại.
   *
   * Callback PHẢI tự lọc key thuộc về series (vd so khớp `input.games`) — trả `Currency` vô điều
   * kiện cho MỌI key (kể cả lúc chưa biết key nào sẽ là trục X) là lỗi thật đã xảy ra lúc viết
   * `financialTrendByGameChartOverride`: ép luôn cột `period` thành `currency` khiến `pickXAxis`
   * không còn cột `time` nào để chọn, `buildChartModel` trả `null` — chart biến mất hoàn toàn.
   */
  seriesType?: (key: string) => ChartFieldType | undefined;
}

/**
 * Chọn trục X: `time` → `category` (distinct nhiều nhất) → **cột SỐ đầu tiên** (fallback cuối).
 *
 * Nhánh số là thứ thiếu ở bản đầu và làm hỏng use-case "staff dán CSV" (bug 23/08): dữ liệu như
 * `records,invocations` (histogram — bucket số ở cột 1, số lượt ở cột 2) KHÔNG có cột thời gian hay
 * phân loại nào, nên `pickXAxis` trả `null` ⇒ `buildChartModel` trả `null` ⇒ UI chỉ hiện "không vẽ
 * được" dù dữ liệu hoàn toàn vẽ được. Trục X số là chuyện bình thường của biểu đồ phân bố/tương
 * quan, không phải trường hợp lạ.
 *
 * Quy ước chọn: cột số ĐẦU TIÊN theo thứ tự field xuất hiện trong dữ liệu — với CSV/JSON do người
 * dán thì cột đầu gần như luôn là biến độc lập (trục X), cột sau là giá trị đo. Chỉ áp dụng khi còn
 * ÍT NHẤT 1 cột số khác để làm series; 1 cột số duy nhất thì không có gì để vẽ theo nó.
 *
 * KHÔNG chọn cột `currency`/`percent` làm trục X: tiền và tỷ lệ luôn là ĐẠI LƯỢNG ĐO (trục Y). Nếu
 * chỉ có currency/percent, để `null` — quay về báo không vẽ được, đúng hơn là vẽ trục X bằng tiền.
 */
function pickXAxis(columns: readonly ClassifiedColumn[]): ClassifiedColumn | null {
  const timeColumn = columns.find((c) => c.type === ChartFieldType.Time);
  if (timeColumn !== undefined) {
    return timeColumn;
  }

  const categoryColumns = columns.filter((c) => c.type === ChartFieldType.Category);
  if (categoryColumns.length > 0) {
    return categoryColumns.reduce((best, c) => (c.distinctCount > best.distinctCount ? c : best));
  }

  const numericColumns = columns.filter(
    (c) => c.type === ChartFieldType.Number || c.type === ChartFieldType.Currency || c.type === ChartFieldType.Percent,
  );
  const plainNumberColumn = numericColumns.find((c) => c.type === ChartFieldType.Number);
  if (plainNumberColumn !== undefined && numericColumns.length >= 2) {
    return plainNumberColumn;
  }
  return null;
}

/** Chọn series: cột số (currency/number/percent) trừ trục X, currency trước, tối đa `MAX_SERIES`. */
function pickSeries(columns: readonly ClassifiedColumn[], xKey: string): ClassifiedColumn[] {
  const numeric = columns.filter(
    (c) =>
      c.key !== xKey &&
      (c.type === ChartFieldType.Currency || c.type === ChartFieldType.Number || c.type === ChartFieldType.Percent),
  );
  const priority = (type: ChartFieldType): number =>
    type === ChartFieldType.Currency ? 0 : type === ChartFieldType.Percent ? 1 : 2;
  return numeric.toSorted((a, b) => priority(a.type) - priority(b.type)).slice(0, MAX_SERIES);
}

/** `totalRevenue` → `Total Revenue` → dùng làm fallback khi không có từ điển nhãn (xem `chart-format.ts`). */
function fallbackLabel(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Độ dài nhãn trục X DÀI NHẤT — quyết định cột dọc (nhãn ngắn) vs cột ngang (nhãn dài), xem `ChartSuitabilityInput`. */
function maxLabelLength(rows: readonly ChartRow[], xKey: string): number {
  return rows.reduce((max, row) => Math.max(max, String(row[xKey] ?? "").length), 0);
}

/** Tỉa `rows` về tối đa `MAX_POINTS`: time → lấy N gần nhất (giữ nguyên khoảng đều theo sort); category giữ nguyên (đã ≤ 30). */
function trimRows(rows: readonly ChartRow[], xType: ChartFieldType): ChartRow[] {
  if (rows.length <= MAX_POINTS) {
    return [...rows];
  }
  if (xType === ChartFieldType.Time) {
    // Giữ N điểm gần nhất theo thứ tự đã sort tăng — bucket đơn giản bằng lấy tail.
    return rows.slice(-MAX_POINTS);
  }
  return rows.slice(0, MAX_POINTS);
}

/**
 * Sort rows theo trục X — `time` sort chuỗi (ISO/`YYYY-MM`/drawId đều sort đúng theo lexicographic),
 * trục X SỐ sort theo giá trị số (không phải chuỗi: `"10"` phải đứng sau `"9"`), `category` giữ
 * nguyên thứ tự tool trả về (tool đã sort theo nghiệp vụ, vd top doanh thu giảm dần).
 */
function sortByXAxis(rows: ChartRow[], xKey: string, xType: ChartFieldType): ChartRow[] {
  if (xType === ChartFieldType.Number) {
    return rows.toSorted((a, b) => Number(a[xKey] ?? 0) - Number(b[xKey] ?? 0));
  }
  if (xType !== ChartFieldType.Time) {
    return rows;
  }
  return rows.toSorted((a, b) => {
    const av = String(a[xKey] ?? "");
    const bv = String(b[xKey] ?? "");
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

/**
 * Kind mặc định gợi ý theo shape dữ liệu, khi tool KHÔNG khai `ChartOverride.defaultKind`.
 *
 * Chỉ can thiệp ở trường hợp thứ tự catalog cho kết quả kém: trục X SỐ với ít mốc là dữ liệu **phân
 * bố theo bucket** (vd `records,invocations`), đọc bằng cột rõ hơn đường — mà thứ tự catalog lại đặt
 * `line` trước `bar`. Các shape khác trả `undefined` để `resolveKind` dùng phần tử đầu
 * `allowedKinds` như thiết kế.
 */
function defaultKindFor(xType: ChartFieldType, pointCount: number): ChartKind | undefined {
  if (xType === ChartFieldType.Number && pointCount <= 15) {
    return ChartKind.Bar;
  }
  return undefined;
}

/**
 * Chọn `kind` + `allowedKinds` mặc định từ shape đã suy luận, rồi merge `requestedKind`
 * (chartType do model/user yêu cầu qua tool `renderChart`).
 *
 * - `requestedKind` nằm trong `allowedKinds` → dùng nó làm `kind`.
 * - `requestedKind` KHÔNG nằm trong `allowedKinds` → `kind` = phần tử đầu `allowedKinds`
 *   (default), và trả thêm `rejectedKind` để BE báo lại cho model (KHÔNG in note trên card).
 * - Không có `requestedKind` → `kind` = phần tử đầu `allowedKinds`.
 * - `allowedKinds` suy luận ra rỗng (hiếm, dữ liệu không khớp catalog nào) → fallback `[bar]`.
 */
function resolveKind(
  allowedKinds: readonly ChartKind[],
  requestedKind: ChartKind | undefined,
  preferredDefault?: ChartKind,
): { kind: ChartKind; allowedKinds: readonly ChartKind[]; rejectedKind?: ChartKind } {
  // Ép kiểu non-empty tuple: nhánh `? :` đã đảm bảo runtime luôn có ≥ 1 phần tử,
  // tránh `safeAllowed[0]` bị suy ra `ChartKind | undefined` dưới `noUncheckedIndexedAccess`.
  const safeAllowed: readonly [ChartKind, ...ChartKind[]] =
    allowedKinds.length > 0 ? (allowedKinds as [ChartKind, ...ChartKind[]]) : [ChartKind.Bar];
  // `ChartOverride.defaultKind` chỉ có tác dụng khi nằm trong `safeAllowed` — override trỏ tới
  // 1 kind không hợp lệ với shape dữ liệu hiện tại (vd override sai) sẽ bị bỏ qua, không throw.
  const defaultKind =
    preferredDefault !== undefined && safeAllowed.includes(preferredDefault) ? preferredDefault : safeAllowed[0];

  if (requestedKind === undefined) {
    return { kind: defaultKind, allowedKinds: safeAllowed };
  }
  if (safeAllowed.includes(requestedKind)) {
    return { kind: requestedKind, allowedKinds: safeAllowed };
  }
  return { kind: defaultKind, allowedKinds: safeAllowed, rejectedKind: requestedKind };
}

/**
 * Dựng `ChartModel` đầy đủ từ output tool — hàm chính gọi từ `chart-tool-view.tsx`.
 *
 * Trả `null` khi `extractRows` không tìm được dữ liệu chartable, hoặc không chọn được trục X
 * (không có cột `time`/`category` nào sau phân loại).
 *
 * @param output        Output THÔ của tool data (đã qua `resolveToolViewData`/`AppResult.data`).
 * @param requestedKind `chartType` từ input tool `renderChart`, nếu user/model có chỉ định.
 * @param title         Tiêu đề card — mặc định lấy từ `toolViewTitle` ở nơi gọi, hoặc chuỗi chung.
 * @param override      `ToolViewSpec.chart` của tool nguồn (nếu có khai) — xem `ChartOverride`.
 */
export function buildChartModel(
  output: unknown,
  requestedKind: ChartKind | undefined,
  title: string,
  override?: ChartOverride<ChartRow>,
): ChartModel | null {
  const rows = extractRows(output);
  if (rows === null) {
    return null;
  }

  const inferredColumns = classifyColumns(rows);
  // `seriesType` override ép loại CỘT theo tên (không đổi bộ cột) — xem JSDoc `ChartOverride.seriesType`.
  // KHÔNG áp cho cột đã phân loại `time`: override này sinh ra để phân loại lại cột SERIES (số đo),
  // ép luôn cả trục thời gian là lỗi caller quên lọc key (bug thật lúc viết `registry.tsx` — xem
  // `financialTrendByGameChartOverride`) khiến `pickXAxis` mất trục, `buildChartModel` trả `null`.
  const columns =
    override?.seriesType === undefined
      ? inferredColumns
      : inferredColumns.map((c) => {
          if (c.type === ChartFieldType.Time) {
            return c;
          }
          const forced = override.seriesType?.(c.key);
          return forced === undefined ? c : { ...c, type: forced };
        });
  const xColumn = pickXAxis(columns);
  if (xColumn === null) {
    return null;
  }

  const seriesColumns = pickSeries(columns, xColumn.key);
  if (seriesColumns.length === 0) {
    return null;
  }

  const sortedRows = sortByXAxis(rows, xColumn.key, xColumn.type);
  const trimmedRows = trimRows(sortedRows, xColumn.type);

  const primaryKey = seriesColumns[0]?.key ?? "";
  const inferredAllowed = suitableChartKinds({
    xType: xColumn.type,
    pointCount: trimmedRows.length,
    seriesCount: seriesColumns.length,
    seriesTypes: seriesColumns.map((c) => c.type),
    primaryHasNegative: trimmedRows.some((row) => Number(row[primaryKey] ?? 0) < 0),
    maxXLabelLength: maxLabelLength(trimmedRows, xColumn.key),
  });
  // `override.allowedKinds` thay hoàn toàn danh sách suy luận — dùng khi tool biết rõ dữ liệu
  // của nó KHÔNG hợp catalog mặc định (vd luôn muốn ép bar dù đủ điểm cho line).
  const allowedKinds = override?.allowedKinds ?? inferredAllowed;
  const resolved = resolveKind(
    allowedKinds,
    requestedKind,
    override?.defaultKind ?? defaultKindFor(xColumn.type, trimmedRows.length),
  );

  return {
    kind: resolved.kind,
    allowedKinds: resolved.allowedKinds,
    rejectedKind: resolved.rejectedKind,
    x: { dataKey: xColumn.key, label: fallbackLabel(xColumn.key), type: xColumn.type },
    series: seriesColumns.map((c) => ({ dataKey: c.key, label: fallbackLabel(c.key), type: c.type })),
    rows: trimmedRows,
    title: override?.title ?? title,
    rowColor: override?.rowColor,
    xLabel: override?.xLabel,
  };
}

/** Re-export để `chart-tool-view.tsx` không cần import trực tiếp `chart-catalog`. */
export { getChartCatalogEntry };

/**
 * Series nào phải vẽ trên trục Y PHỤ (bên phải) — những series có ĐƠN VỊ khác series đầu.
 *
 * Bug thật (24/08, ảnh biểu đồ "Kết hợp"): tiền (tỷ đồng) và tỷ lệ (0-1) dùng CHUNG một trục Y ⇒
 * đường `%` bị ép xuống sát trục 0 thành một vạch phẳng, tức loại chart tồn tại đúng cho use-case
 * "doanh thu + tỷ lệ trả thưởng" lại không đọc được chính hai chỉ số đó.
 *
 * CHỈ tách khi khác ĐƠN VỊ (`ChartFieldType`), KHÔNG tách khi cùng đơn vị mà chỉ lệch độ lớn: doanh
 * thu 200tr cạnh lỗ 19 tỷ trông "mất cột doanh thu" nhưng đó là SỰ THẬT của dữ liệu — cho mỗi series
 * một thang riêng ở đây sẽ vẽ hai cột cao ngang nhau và nói ngược lại sự thật đó.
 *
 * Trục phải chỉ nhận ĐÚNG MỘT đơn vị (đơn vị khác-series-đầu xuất hiện SỚM NHẤT). Có 3 đơn vị (tiền
 * + `%` + số đếm) thì đơn vị thứ ba vẫn nằm ở trục trái: một trục chỉ có MỘT `tickFormatter`, nhồi 2
 * đơn vị vào đó thì số đếm bị in ra dạng `%` — sai hẳn, tệ hơn là bị lệch thang.
 */
export function secondaryAxisKeys(series: readonly ChartSeries[]): readonly string[] {
  const primaryType = series[0]?.type;
  if (primaryType === undefined) {
    return [];
  }
  const secondaryType = series.find((s) => s.type !== primaryType)?.type;
  if (secondaryType === undefined) {
    return [];
  }
  return series.filter((s) => s.type === secondaryType).map((s) => s.dataKey);
}

/** Kiểu field mang giá trị SỐ — đặt lên trục số của biểu đồ phân tán được. */
const NUMERIC_FIELD_TYPES: readonly ChartFieldType[] = [
  ChartFieldType.Number,
  ChartFieldType.Currency,
  ChartFieldType.Percent,
];

/** Hai field đặt lên 2 trục số của biểu đồ phân tán — xem {@link scatterAxisPair}. */
export interface ScatterAxisPair {
  x: { dataKey: string; type: ChartFieldType };
  y: { dataKey: string; type: ChartFieldType };
  /**
   * Field nhận diện DÒNG dữ liệu (vd `financialDate`) khi nó không nằm trên trục nào — tooltip phải
   * in nó, nếu không người xem thấy 1 điểm mà không biết điểm đó là ngày/nhóm nào.
   * `undefined` khi trục X CHÍNH LÀ field trục X của model (không có gì bị mất).
   */
  identityKey?: string;
}

/**
 * Chọn 2 field cho biểu đồ phân tán — hai ca KHÁC HẲN nhau, lẫn ca nào là vẽ ra hình vô nghĩa.
 *
 * 1. Trục X của model đã là SỐ (histogram `records,invocations`): X = chính field đó, Y = series đầu.
 * 2. Trục X là thời gian/phân loại (không đặt lên trục số được): X = series 1, Y = series 2 — tương
 *    quan giữa hai chỉ số (vd tiền cược vs tiền thắng), field trục X thành `identityKey`.
 *
 * Bug thật (24/08): bản cũ luôn lấy `series[0]` làm X và `series[1] ?? series[0]` làm Y ⇒ ca (1) chỉ
 * có 1 series thì vẽ series[0] với CHÍNH NÓ, ra một đường chéo 45° hoàn hảo, đúng nghĩa "biểu đồ
 * luôn đẹp và luôn sai". Trả `null` khi không đủ 2 field số ⇒ caller không vẽ.
 */
export function scatterAxisPair(model: ChartModel): ScatterAxisPair | null {
  const first = model.series[0];
  if (first === undefined) {
    return null;
  }
  if (NUMERIC_FIELD_TYPES.includes(model.x.type)) {
    return {
      x: { dataKey: model.x.dataKey, type: model.x.type },
      y: { dataKey: first.dataKey, type: first.type },
    };
  }
  const second = model.series[1];
  if (second === undefined) {
    return null;
  }
  return {
    x: { dataKey: first.dataKey, type: first.type },
    y: { dataKey: second.dataKey, type: second.type },
    identityKey: model.x.dataKey,
  };
}
