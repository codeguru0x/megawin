/**
 * AI Chat — registry map tool name → cách render output.
 *
 * BA TẦNG:
 *   0. Không có entry trong `toolRenderers` → `<Tool>` mặc định (JSON gập lại) trong
 *      `render-message.tsx`. Hợp cho tool ít dùng / đang debug.
 *   1. `specRenderer(spec)` — khai báo bằng `view-spec`, renderer chung dựng UI.
 *      **MẶC ĐỊNH NÊN DÙNG** cho tool trả bảng / số tổng / chi tiết record.
 *   2. Component bespoke — toàn quyền TSX. CHỈ khi cần chart, interaction, hoặc layout mà spec
 *      không mô tả nổi. Mỗi entry loại này là 1 file phải bảo trì riêng.
 *
 * Cả 2 tầng đều nằm trong MỘT map `toolRenderers` — spec chỉ là cách *tạo* component, nên
 * không cần cơ chế tra 2 bước. Component được tạo ở module scope (không phải trong hàm lookup)
 * để identity ổn định qua các lần render — nếu tạo mới mỗi render, React sẽ unmount/remount
 * card và mọi state bên trong (scroll bảng, disclosure) bị reset.
 *
 * Tên tool PHẢI khớp key file trong `agent/tools/` (p0-02 §3).
 *
 * File này còn là nơi khai 3 bảng tra theo tool, tất cả kiểu `Record` TOÀN PHẦN để compiler bắt
 * ngay khi thêm tool mà quên khai: nhãn tiếng Việt ({@link AI_TOOL_LABELS}), cụm động từ cho mục
 * gộp ({@link AI_TOOL_ACTIVITY_PHRASES}), và chỗ đứng của card ({@link AI_TOOL_CARD_PLACEMENT}).
 *
 * MỌI renderer (cả tầng 1 lẫn tầng 2) đều bọc `ToolResultLine` — một dòng gạch đóng sẵn, bấm mới
 * bung bảng. Xem `generic-tool-view.tsx` cho lý lẽ.
 */

import type React from "react";

import type { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS, getGameLabel, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { logInfo } from "@megawin/shared/utils";
import type { EveDynamicToolPart, EveMessagePart } from "eve/react";

import {
  buildChartModel,
  CHART_KIND_VALUES,
  ChartFieldType,
  type ChartKind,
  type ChartOverride,
  type ChartRow,
  ChartToolView,
  extractRows,
} from "../chart";
import { renderIntegrationHealth, renderOpsSnapshot } from "./daily-ops-cards";
import { resolveToolViewData, ToolResultLine, ToolViewCard, toolViewTitle } from "./generic-tool-view";
import { renderNavigateTo } from "./navigate-tool-card";
import { drawsOverviewView } from "./ops-views";
import {
  dailyOverviewView,
  drawSettleReportView,
  financialTrendView,
  gameConfigView,
  gameJackpotView,
  gameSummaryView,
  systemOutstandingView,
} from "./report-views";
import type { ToolViewSpec } from "./view-spec";

export type { ToolRendererProps } from "./view-spec";

/** Const object, không string trần (code-quality-standards.mdc §5.3). */
export const AiToolName = {
  FinancialByGame: "getFinancialByGame",
  FinancialDailyOverview: "getFinancialDailyOverview",
  FinancialTrend: "getFinancialTrend",
  FinancialTrendByGame: "getFinancialTrendByGame",
  SystemOutstanding: "getSystemOutstanding",
  GameConfig: "getGameConfig",
  GameJackpot: "getGameJackpot",
  NavigateTo: "navigateTo",
  RenderChart: "renderChart",
  // Wave 1 — p1-03-ops-data-visibility.
  DrawsOverview: "getDrawsOverview",
  DrawDetail: "getDrawDetail",
  ListDraws: "listDraws",
  OpsSnapshot: "getOpsSnapshot",
  OpsAlerts: "getOpsAlerts",
  TenantGameConfig: "getTenantGameConfig",
  DrawSettleReport: "getDrawSettleReport",
  IntegrationHealth: "getIntegrationHealth",
  PlayerAccountInfo: "getPlayerAccountInfo",
  PlayerInsight: "getPlayerInsight",
  // Wave 2 — p1-03-ops-data-visibility.
  SearchAuditLogs: "searchAuditLogs",
  JackpotHistory: "getJackpotHistory",
  DispatchOrders: "getDispatchOrders",
  VoidReport: "getVoidReport",
} as const;
export type AiToolName = (typeof AiToolName)[keyof typeof AiToolName];

/**
 * Ngữ cảnh kèm theo mỗi lần gọi renderer — hiện chỉ cần cho `renderChart` (dò part tool dữ liệu
 * GẦN NHẤT phía trước nó trong CÙNG message, xem {@link renderChartTool}). Truyền tay thay vì đọc
 * qua React context vì renderer là HÀM thuần (không phải component con nằm trong tree), không có
 * Provider nào bọc quanh nó.
 */
export interface ToolRenderContext {
  /** Snapshot toàn bộ part của message đang chứa `part` này (`EveMessage.parts`). */
  messageParts: readonly EveMessagePart[];
  /** Vị trí của CHÍNH part đang render trong `messageParts` — dùng để dò lùi (`i < partIndex`). */
  partIndex: number;
}

/**
 * Hợp đồng của mọi renderer: nhận part (+ ngữ cảnh vị trí trong message), trả node — hoặc `null`
 * để caller fallback về `<Tool>` mặc định.
 *
 * Là HÀM chứ không phải component vì caller cần phân biệt "render ra rỗng" với "không render
 * được": component trả `null` thì bên ngoài không có cách nào biết, staff sẽ thấy khoảng trắng
 * thay vì JSON gập lại.
 */
export type ToolPartRenderer = (part: EveDynamicToolPart, context: ToolRenderContext) => React.ReactNode | null;

/**
 * Biến 1 `ToolViewSpec` thành renderer — giữ nguyên generic nên KHÔNG cần cast, `Output`/`Row`
 * của từng spec được compiler kiểm tra tại chỗ khai (`report-views.ts`).
 *
 * Bọc `ToolResultLine` Ở ĐÂY (không trong `ToolViewCard`) để renderer bespoke bọc bằng cùng
 * component đó và mọi tool ra cùng một hình thái — dòng gạch đóng sẵn, bấm mới thấy bảng.
 */
function specRenderer<Output, Row>(spec: ToolViewSpec<Output, Row>): ToolPartRenderer {
  return (part) => {
    const data = resolveToolViewData(spec, "output" in part ? part.output : undefined);
    if (data === null) {
      return null;
    }
    return (
      <ToolResultLine title={toolViewTitle(spec.view, data)}>
        <ToolViewCard data={data} view={spec.view} />
      </ToolResultLine>
    );
  };
}

/**
 * Envelope `safeRun()` (`{ success, data, error }`, xem `resolveToolViewData`) → `data`; thất bại
 * → `null` (không có gì để vẽ). Tool output KHÔNG theo envelope này (hiếm, phần lớn tool nội bộ
 * đều qua `safeRun`) → dùng nguyên như cũ.
 */
function unwrapChartSourceOutput(output: unknown): unknown {
  if (typeof output !== "object" || output === null || !("success" in output)) {
    return output;
  }
  const result = output as { success: boolean; data?: unknown };
  return result.success ? result.data : null;
}

/**
 * Bảng tra override chart THEO TOOL — gom `.chart` của mọi `ToolViewSpec` đã khai (nếu có), tách
 * khỏi `toolRenderers` vì `renderChart` cần tra override của tool DỮ LIỆU (khác tool đang render),
 * không đi qua `getToolRenderer` (chỉ tra theo tool CHÍNH part đang render).
 *
 * `as ChartOverride<ChartRow>`: an toàn ở runtime — `rowColor` của spec luôn nhận đúng `Row` của
 * CHÍNH spec đó (xem JSDoc `ToolViewSpec.chart`), rows thực tế đi vào đây LÀ `select(output)` của
 * cùng spec. Ép kiểu 1 LẦN ở đây thay vì rải cast khắp `chart-inference.ts`.
 */
const toolChartOverrides: Partial<Record<AiToolName, ChartOverride<ChartRow>>> = {
  [AiToolName.FinancialByGame]: gameSummaryView.chart as ChartOverride<ChartRow> | undefined,
  [AiToolName.SystemOutstanding]: systemOutstandingView.chart as ChartOverride<ChartRow> | undefined,
};

/**
 * 6/10 field {@link GAME_PERIOD_METRIC_KEYS} là tiền VND (còn lại là số đếm: kỳ quay, phiếu cược,
 * người chơi, đại lý) — dùng để ép `seriesType` Currency cho cột game khi `metric` khớp.
 *
 * ĐỒNG BỘ TAY với `GAME_PERIOD_METRIC_KEYS`
 * (`packages/game-core-application/src/infras/repos/types/system-settle-game-daily.types.ts`):
 * `chart-inference.ts` chỉ đọc được TÊN CỘT (mã game, vd `"keno"`), không đọc được `metric` của
 * lần gọi tool, nên không tự phân loại được cột này là tiền hay số đếm — xem
 * {@link financialTrendByGameChartOverride}.
 */
const CURRENCY_GAME_PERIOD_METRICS: ReadonlySet<string> = new Set([
  "totalStake",
  "totalWin",
  "totalPayout",
  "ggr",
  "totalCommission",
  "netProfit",
]);

/**
 * Override chart CHO TỪNG LẦN GỌI `getFinancialTrendByGame` — khác mọi entry khác của
 * `toolChartOverrides` (khai TĨNH 1 lần), override này đọc `part.input.metric`/`games` để biết cột
 * game (`"keno"`, `"power655"`) đang chứa tiền VND hay số đếm, rồi ép `seriesType` cho đúng.
 *
 * Không thể khai tĩnh vì `GamePeriodByGameRow` dùng RAW `gameProduct` làm tên cột — tên đó không
 * gợi ý được đơn vị (`CURRENCY_NAME_PATTERN` không khớp `"keno"`), nên nếu không ép, tooltip mất
 * `₫` và hiện số trần dù `metric` thực tế là doanh thu/lợi nhuận.
 *
 * CHỈ ép cột nằm trong `input.games` — TUYỆT ĐỐI không ép vô điều kiện mọi `key` (bug thật lúc
 * viết: `() => Currency` không lọc key sẽ ép luôn cột `period`, biến trục thời gian thành
 * `currency` ⇒ `pickXAxis` không tìm được trục nào ⇒ `buildChartModel` trả `null`, chart biến mất
 * hoàn toàn — phát hiện qua unit test `chart-inference.test.ts`, không phải qua đọc code).
 */
function financialTrendByGameChartOverride(part: EveDynamicToolPart): ChartOverride<ChartRow> | undefined {
  const input = part.input as { metric?: unknown; games?: unknown } | undefined;
  const metric = typeof input?.metric === "string" ? input.metric : undefined;
  if (metric === undefined || !CURRENCY_GAME_PERIOD_METRICS.has(metric)) {
    return undefined;
  }
  const games = Array.isArray(input?.games) ? new Set(input.games.filter((g) => typeof g === "string")) : undefined;
  if (games === undefined || games.size === 0) {
    return undefined;
  }
  return { seriesType: (key) => (games.has(key) ? ChartFieldType.Currency : undefined) };
}

/**
 * Dò LÙI từ ngay trước `beforeIndex` (không gồm chính part đang xét) tìm tool part GẦN NHẤT đã
 * có output THÀNH CÔNG và chartable (`extractRows` khác `null`) — đây là "dữ liệu của
 * `renderChart`" theo thiết kế signal-only (xem JSDoc `agent/tools/renderChart.ts`: tool này
 * KHÔNG chở dữ liệu, hệ thống tự ghép với tool dữ liệu vừa gọi trước đó trong CÙNG message).
 *
 * Bỏ qua chính tool `renderChart` (model lỡ gọi liên tiếp 2 lần) để không tự tham chiếu vào nhau.
 */
function findChartableSource(
  messageParts: readonly EveMessagePart[],
  beforeIndex: number,
): { output: unknown; title: string; sourceNote?: string; override?: ChartOverride<ChartRow> } | null {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const candidate = messageParts[i];
    if (candidate === undefined || candidate.type !== "dynamic-tool") {
      continue;
    }
    if (candidate.toolName === AiToolName.RenderChart) {
      continue;
    }
    if (candidate.state !== "output-available" || candidate.partial) {
      continue;
    }
    const unwrapped = unwrapChartSourceOutput(candidate.output);
    if (extractRows(unwrapped) === null) {
      continue;
    }
    const dynamicOverride =
      candidate.toolName === AiToolName.FinancialTrendByGame ? financialTrendByGameChartOverride(candidate) : undefined;
    return {
      output: unwrapped,
      title: getToolLabel(candidate.toolName),
      sourceNote: chartSourceNote(candidate),
      override: dynamicOverride ?? toolChartOverrides[candidate.toolName as AiToolName],
    };
  }
  return null;
}

/**
 * Dòng nguồn dữ liệu in dưới tiêu đề chart — tên báo cáo + phạm vi của ĐÚNG lần gọi tool được ghép
 * vào chart (xem `ChartToolViewProps.sourceNote` để biết vì sao cần).
 *
 * Đọc `from`/`to` (input chung của các tool báo cáo) và `game`/`games` nếu lần gọi đó có lọc game.
 * Phạm vi game quan trọng đúng bằng khoảng ngày: sự cố 24/08 là chart vẽ CẢ 7 GAME trong khi câu hỏi
 * chỉ về Keno — nếu dòng nguồn không nói phạm vi game thì người đọc không có cách nào phát hiện, vì
 * bảng số liệu bên dưới trông hoàn toàn hợp lệ. `games` (mảng, dùng bởi `getFinancialTrendByGame`)
 * là biến thể "nhiều game" của cùng lỗi — liệt kê đủ TÊN các game đang so sánh để phát hiện ngay nếu
 * thiếu game nào trên hình.
 *
 * Tool không có `from`/`to` → trả `undefined`, card chỉ hiện tiêu đề như trước (không bịa dòng
 * nguồn rỗng nghĩa).
 */
function chartSourceNote(part: EveDynamicToolPart): string | undefined {
  const input = part.input as { from?: unknown; to?: unknown; game?: unknown; games?: unknown } | undefined;
  const from = typeof input?.from === "string" ? input.from : undefined;
  const to = typeof input?.to === "string" ? input.to : undefined;
  if (from === undefined || to === undefined) {
    return undefined;
  }
  const parts = [getToolLabel(part.toolName)];
  if (typeof input?.game === "string") {
    parts.push(getGameLabel(input.game as GameProduct));
  } else if (Array.isArray(input?.games) && input.games.every((g) => typeof g === "string")) {
    parts.push((input.games as string[]).map((g) => getGameLabel(g as GameProduct)).join(", "));
  }
  parts.push(from === to ? formatIsoDate(from) : `${formatIsoDate(from)} – ${formatIsoDate(to)}`);
  return parts.join(" · ");
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`; chuỗi không đúng dạng thì giữ nguyên (không nuốt giá trị lạ). */
function formatIsoDate(value: string): string {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Ghi chú khi không dựng được biểu đồ — KHÔNG phải trạng thái lỗi hệ thống (không tô đỏ, không
 * `ToolErrorCard`), nhưng PHẢI nói rõ vì sao và thiếu gì.
 *
 * Trước 23/08 chỉ có 1 câu chung "Không có dữ liệu phù hợp từ bước tra cứu trước đó" — dùng cho cả
 * trường hợp staff DÁN dữ liệu (không có bước tra cứu nào), nên câu đó vừa sai ngữ cảnh vừa không
 * cho staff biết cần sửa gì. Tách 2 lý do vì hành động sửa của staff khác nhau hoàn toàn.
 */
function ChartUnavailableNote({ reason }: { reason: "noSourceTool" | "notChartable" }) {
  return (
    <p className="text-muted-foreground text-xs">
      {reason === "noSourceTool"
        ? "Chưa vẽ được biểu đồ: bước tra cứu trước đó không trả về dữ liệu dạng bảng để vẽ."
        : "Chưa vẽ được biểu đồ: dữ liệu cần tối thiểu 2 dòng, một cột làm trục (ngày/tháng, nhóm, hoặc mốc số) và một cột số để đo."}
    </p>
  );
}

/**
 * Từ điển nhãn CHUNG cho `ChartToolView`/`ChartBody` — `REPORT_COLUMN_LABELS` (tên cột báo cáo) gộp
 * thêm `GAME_LABELS` (mã game → tên đầy đủ).
 *
 * Cần gộp vì `ChartOverride.xLabel` (`report-views.ts`) CHỈ đổi nhãn khi mã game nằm ở TRỤC X (giá
 * trị). Khi model tự gộp nhiều lần gọi 1-game thành `rows` ad-hoc, mã game lại nằm ở vị trí SERIES/
 * KEY (cột `keno`, `power655` — mỗi game 1 cột theo thời gian) — `xLabel` không chạm tới vì đó không
 * phải giá trị trục X. `prettifyLabel` tra `reportLabels` cho MỌI key (trục lẫn series), nên gộp
 * `GAME_LABELS` vào đây là chỗ DUY NHẤT sửa được cả hai trường hợp, không phải sửa riêng từng nơi
 * `prettifyLabel` được gọi trong `chart-body.tsx`. Bug thật (24/08): so sánh Keno/Power 6/55 theo
 * tháng ra legend "power655" thay vì "Power 6/55".
 */
const CHART_REPORT_LABELS: Readonly<Record<string, string>> = { ...REPORT_COLUMN_LABELS, ...GAME_LABELS };

/**
 * Renderer cho tool `renderChart` — tool TÍN HIỆU vẽ chart (§1.1 kế hoạch p1-05-chart-generative-ui),
 * HAI CHẾ ĐỘ theo `part.input.rows` (xem JSDoc `agent/tools/renderChart.ts`):
 *
 * 1. `rows` bỏ trống — chế độ thường: tự dò tool dữ liệu GẦN NHẤT phía trước qua
 *    `context.messageParts`/`context.partIndex` ({@link findChartableSource}).
 * 2. `rows` có điền — chế độ dữ liệu tự nhập: model đã tự phân loại dữ liệu staff dán/mô tả thành
 *    mảng object phẳng, dùng THẲNG mảng đó, KHÔNG dò lùi tool nào (không có override per-tool vì
 *    không gắn với 1 tool cụ thể).
 *
 * Cả 2 chế độ đều suy luận `ChartModel` qua `buildChartModel` (`chart-inference.ts`) rồi vẽ bằng
 * `ChartToolView`. Không tìm được dữ liệu hoặc suy luận thất bại (không chọn được trục X/series)
 * → note nhẹ, KHÔNG fallback về `<Tool>` mặc định (JSON `{ ok: true }` của tool này vô nghĩa với
 * staff).
 *
 * Chart hiện NGAY, KHÔNG bọc `ToolResultLine` (đổi 23/08): staff vừa yêu cầu "vẽ biểu đồ" thì phải
 * thấy biểu đồ, bắt bấm thêm 1 lần vào dòng gập là làm ngược ý định vừa nêu. `ToolResultLine` vẫn
 * đúng cho các tool DỮ LIỆU (staff hỏi số, bảng chỉ là bằng chứng phụ) — khác bản chất ở đây.
 *
 * `AI_TOOL_CARD_PLACEMENT[RenderChart]` PHẢI là `Primary` (xem khai báo bên dưới) — nếu để
 * `Reference` như mọi tool dữ liệu khác, `isInternalPart` (`internal-steps.tsx`) sẽ gộp part này
 * vào mục "nội thất" và khi debug tắt (mặc định) nó biến mất HOÀN TOÀN khỏi cây render, tức chart
 * mà staff vừa yêu cầu không bao giờ hiện — ngược hẳn mục đích của cả tính năng.
 */
function renderChartTool(part: EveDynamicToolPart, context: ToolRenderContext): React.ReactNode {
  const input = part.input as { chartType?: string; rows?: ChartRow[]; title?: string } | undefined;
  const requestedRaw = input?.chartType;
  const requestedKind = (CHART_KIND_VALUES as readonly string[]).includes(requestedRaw ?? "")
    ? (requestedRaw as ChartKind)
    : undefined;

  // Chế độ (2): model đã tự phân loại dữ liệu staff cung cấp thành `rows` — dùng thẳng, không dò
  // lùi tool nào (đây không phải output của 1 tool dữ liệu cụ thể).
  if (input?.rows !== undefined && input.rows.length > 0) {
    const adhocTitle = input.title ?? "Dữ liệu tự nhập";
    const model = buildChartModel(input.rows, requestedKind, adhocTitle);
    if (model === null) {
      return <ChartUnavailableNote reason="notChartable" />;
    }
    return <ChartToolView model={model} reportLabels={CHART_REPORT_LABELS} />;
  }

  // Chế độ (1): dò lùi tool dữ liệu gần nhất như cũ.
  const source = findChartableSource(context.messageParts, context.partIndex);
  if (source === null) {
    return <ChartUnavailableNote reason="noSourceTool" />;
  }

  const model = buildChartModel(source.output, requestedKind, source.title, source.override);
  if (model === null) {
    return <ChartUnavailableNote reason="notChartable" />;
  }

  return <ChartToolView model={model} reportLabels={CHART_REPORT_LABELS} sourceNote={source.sourceNote} />;
}

const toolRenderers: Partial<Record<AiToolName, ToolPartRenderer>> = {
  [AiToolName.FinancialByGame]: specRenderer(gameSummaryView),
  [AiToolName.FinancialDailyOverview]: specRenderer(dailyOverviewView),
  [AiToolName.FinancialTrend]: specRenderer(financialTrendView),
  [AiToolName.SystemOutstanding]: specRenderer(systemOutstandingView),
  [AiToolName.GameConfig]: specRenderer(gameConfigView),
  [AiToolName.GameJackpot]: specRenderer(gameJackpotView),
  [AiToolName.NavigateTo]: renderNavigateTo,
  [AiToolName.RenderChart]: renderChartTool,
  // 4 tool "hằng ngày" (p1-03 §8).
  [AiToolName.DrawsOverview]: specRenderer(drawsOverviewView),
  [AiToolName.DrawSettleReport]: specRenderer(drawSettleReportView),
  [AiToolName.OpsSnapshot]: renderOpsSnapshot,
  [AiToolName.IntegrationHealth]: renderIntegrationHealth,
};

/** Type guard hẹp `toolName` (string trần) về `AiToolName` đã biết trong registry. */
export function isKnownAiTool(toolName: string): toolName is AiToolName {
  return Object.values(AiToolName).includes(toolName as AiToolName);
}

/**
 * Built-in tool của eve đang BẬT trong agent này — cần nhãn vì chúng cũng hiện trong UI.
 *
 * Khai tay vì eve không export union tên built-in tool. Bật thêm built-in nào (`agent/agent.ts`)
 * thì thêm vào đây, nếu không staff sẽ thấy nhãn chung {@link UNLABELED_TOOL}.
 */
export const EveBuiltinToolName = {
  AskQuestion: "ask_question",
  Bash: "bash",
  Todo: "todo",
  WebFetch: "web_fetch",
} as const;
export type EveBuiltinToolName = (typeof EveBuiltinToolName)[keyof typeof EveBuiltinToolName];

/**
 * Tool SYNTHETIC do harness eve tự phát sinh — không khai trong `agent/tools/`, không bật trong
 * `agent/agent.ts`, và model KHÔNG gọi nó. Vì vậy tách khỏi {@link EveBuiltinToolName}: nhồi vào đó
 * sẽ đọc như "đây là built-in đang bật", dẫn người sau đi tìm nó trong `agent.ts` và không thấy.
 *
 * `session_limit_continuation`: eve dựng khi session chạm `limits` ở `agent/agent.ts` và cần staff
 * quyết định gia hạn hay dừng — xem `node_modules/eve/dist/src/harness/session-limit-continuation.js`.
 */
export const EveHarnessToolName = {
  SessionLimitContinuation: "session_limit_continuation",
} as const;
export type EveHarnessToolName = (typeof EveHarnessToolName)[keyof typeof EveHarnessToolName];

/** Mọi tên tool có thể xuất hiện trong hội thoại — 3 nguồn: của ta, built-in eve, synthetic harness. */
type LabeledToolName = AiToolName | EveBuiltinToolName | EveHarnessToolName;

/**
 * Tên tool hiển thị cho nhân viên — model thấy tên kỹ thuật (`getFinancialByGame`), staff thấy
 * tiếng Việt.
 *
 * Kiểu `Record<AiToolName | EveBuiltinToolName, string>` (KHÔNG phải `Record<string, string>`) để
 * compiler BẮT ngay khi thêm tool vào `AiToolName` mà quên nhãn — thay vì phải tự nhớ hoặc chờ
 * thấy nhãn sai trên UI.
 */
const AI_TOOL_LABELS: Record<LabeledToolName, string> = {
  [EveBuiltinToolName.AskQuestion]: "Hỏi nhân viên",
  [EveBuiltinToolName.Bash]: "Chạy lệnh hệ thống",
  [EveBuiltinToolName.Todo]: "Danh sách việc cần làm",
  [EveBuiltinToolName.WebFetch]: "Đọc trang web",
  [EveHarnessToolName.SessionLimitContinuation]: "Tiếp tục phiên làm việc",
  [AiToolName.FinancialByGame]: "Tài chính theo game",
  [AiToolName.FinancialDailyOverview]: "Báo cáo tài chính theo ngày",
  [AiToolName.FinancialTrend]: "Tài chính theo kỳ",
  [AiToolName.FinancialTrendByGame]: "So sánh game theo kỳ",
  [AiToolName.SystemOutstanding]: "Kỳ quay chờ settle",
  [AiToolName.GameConfig]: "Cấu hình game",
  [AiToolName.GameJackpot]: "Jackpot hiện tại",
  [AiToolName.NavigateTo]: "Mở trang",
  [AiToolName.RenderChart]: "Biểu đồ",
  [AiToolName.DrawsOverview]: "Bức tranh kỳ quay",
  [AiToolName.DrawDetail]: "Chi tiết kỳ quay",
  [AiToolName.ListDraws]: "Danh sách kỳ quay",
  [AiToolName.OpsSnapshot]: "Snapshot vận hành",
  [AiToolName.OpsAlerts]: "Alert vận hành",
  [AiToolName.TenantGameConfig]: "Cấu hình đại lý",
  [AiToolName.DrawSettleReport]: "Báo cáo settle kỳ quay",
  [AiToolName.IntegrationHealth]: "Sức khoẻ tích hợp",
  [AiToolName.PlayerAccountInfo]: "Tra tài khoản người chơi",
  [AiToolName.PlayerInsight]: "Thông tin người chơi",
  [AiToolName.SearchAuditLogs]: "Nhật ký thao tác",
  [AiToolName.JackpotHistory]: "Lịch sử Jackpot",
  [AiToolName.DispatchOrders]: "Nhật ký lệnh dispatch",
  [AiToolName.VoidReport]: "Báo cáo kỳ huỷ",
};

/**
 * Cụm động từ TRẦN (không thì) mô tả việc tool làm — dùng dựng nhãn mục gộp ở `internal-steps.tsx`.
 *
 * Tách khỏi {@link AI_TOOL_LABELS} vì hai chỗ cần hai dạng ngữ pháp khác nhau: tiêu đề card cần
 * danh ngữ ("Cấu hình game"), nhãn mục gộp cần động ngữ ("đọc cấu hình game"). Nhồi một bảng dùng
 * cho cả hai sẽ ra "Đã đọc Cấu hình game" (hoa giữa câu) hoặc "Đã đọc đọc trang web" (lặp động từ).
 *
 * KHÔNG bao gồm thì: caller ghép `Đang …` khi bước còn chạy, `Đã …` khi xong. Nếu nhúng thì vào
 * đây thì lúc tool đang chạy nhãn sẽ nói "Đã" trong khi nó chưa xong — sai với thứ staff đang thấy.
 *
 * Kiểu `Record<AiToolName | EveBuiltinToolName, string>` để compiler BẮT khi thêm tool mà quên cụm
 * này (cùng lý lẽ với {@link AI_TOOL_LABELS}).
 */
const AI_TOOL_ACTIVITY_PHRASES: Record<LabeledToolName, string> = {
  [EveBuiltinToolName.AskQuestion]: "hỏi nhân viên",
  [EveBuiltinToolName.Bash]: "chạy lệnh hệ thống",
  [EveBuiltinToolName.Todo]: "cập nhật danh sách việc",
  [EveBuiltinToolName.WebFetch]: "đọc trang web",
  [EveHarnessToolName.SessionLimitContinuation]: "chờ xác nhận tiếp tục phiên",
  [AiToolName.FinancialByGame]: "đọc số tài chính theo game",
  [AiToolName.FinancialDailyOverview]: "đọc báo cáo tài chính theo ngày",
  [AiToolName.FinancialTrend]: "đọc tài chính theo kỳ",
  [AiToolName.FinancialTrendByGame]: "so sánh tài chính giữa các game theo kỳ",
  [AiToolName.SystemOutstanding]: "đọc danh sách kỳ chờ settle",
  [AiToolName.GameConfig]: "đọc cấu hình game",
  [AiToolName.GameJackpot]: "đọc số jackpot",
  [AiToolName.NavigateTo]: "mở trang",
  [AiToolName.RenderChart]: "vẽ biểu đồ",
  [AiToolName.DrawsOverview]: "đọc tóm tắt kỳ quay",
  [AiToolName.DrawDetail]: "đọc chi tiết kỳ quay",
  [AiToolName.ListDraws]: "đọc danh sách kỳ quay",
  [AiToolName.OpsSnapshot]: "đọc snapshot vận hành",
  [AiToolName.OpsAlerts]: "đọc alert vận hành",
  [AiToolName.TenantGameConfig]: "đọc cấu hình đại lý",
  [AiToolName.DrawSettleReport]: "đọc báo cáo settle kỳ quay",
  [AiToolName.IntegrationHealth]: "kiểm tra sức khoẻ tích hợp",
  [AiToolName.PlayerAccountInfo]: "tra tài khoản người chơi",
  [AiToolName.PlayerInsight]: "đọc thông tin người chơi",
  [AiToolName.SearchAuditLogs]: "tra nhật ký thao tác",
  [AiToolName.JackpotHistory]: "đọc lịch sử Jackpot",
  [AiToolName.DispatchOrders]: "đọc nhật ký lệnh dispatch",
  [AiToolName.VoidReport]: "đọc báo cáo kỳ huỷ",
};

/**
 * Cụm động từ của tool, `undefined` nếu chưa khai.
 *
 * `undefined` (KHÔNG phải cụm chung chung kiểu "làm việc gì đó") để caller lùi về nhãn đếm bước —
 * thà nói "Chi tiết xử lý (3 bước)" còn hơn nói sai việc agent vừa làm.
 */
export function getToolActivityPhrase(toolName: string): string | undefined {
  return AI_TOOL_ACTIVITY_PHRASES[toolName as LabeledToolName];
}

/** Card của tool hiện ngang hàng câu trả lời, hay gộp vào mục "Chi tiết xử lý"? */
export const ToolCardPlacement = {
  /** Hiện thẳng — part này cần STAFF HÀNH ĐỘNG, gộp vào mục đóng thì không ai bấm. */
  Primary: "primary",
  /** Gộp vào mục đóng — dữ liệu để ĐỐI SOÁT, câu trả lời nằm trong text của trợ lý. */
  Reference: "reference",
} as const;
export type ToolCardPlacement = (typeof ToolCardPlacement)[keyof typeof ToolCardPlacement];

/**
 * Tool nào được hiện thẳng vào hội thoại.
 *
 * CHỐT VỚI USER 17/08 — MỌI TOOL TRẢ DỮ LIỆU ĐỀU `Reference`. Câu trả lời là TEXT của trợ lý;
 * bảng số chỉ để đối soát, nằm sau dòng gạch đóng sẵn. Lý do bỏ hẳn khái niệm "bảng chính là câu
 * trả lời": nó phụ thuộc vào việc staff hỏi kiểu gì ("cho xem báo cáo" vs "doanh thu bao nhiêu"),
 * mà placement lại là quyết định TĨNH theo tool — nên luôn có một nửa tình huống bị sai. Chọn
 * `Reference` cho tất cả thì trần độ cao hội thoại là hằng số, không phụ thuộc số game/kỳ/đại lý
 * mà model quyết định tra.
 *
 * NGOẠI LỆ là `navigateTo` và `renderChart`, và cả hai KHÔNG phải ngoại lệ về dữ liệu mà về BẢN
 * CHẤT: output của `navigateTo` là một NÚT ĐIỀU HƯỚNG, output của `renderChart` là tín hiệu VẼ
 * (`{ ok: true }`, không chở số — xem `agent/tools/renderChart.ts`) mà UI thật (biểu đồ) được
 * dựng ở renderer bằng cách dò tool dữ liệu trước đó, KHÔNG nằm trong `part.output` của chính nó.
 * Gộp `renderChart` vào mục đóng thì khi debug tắt (mặc định, CHỐT LẦN 3 ở `internal-steps.tsx`)
 * toàn bộ part nội thất bị bỏ qua khỏi cây render ⇒ biểu đồ mà staff vừa yêu cầu KHÔNG BAO GIỜ
 * hiện ra — ngược hẳn mục đích của tính năng. Cùng một lý lẽ với việc `isInternalPart` luôn cho
 * HITL (`web_fetch` chờ duyệt, `ask_question`) hiện thẳng: **cần staff THẤY KẾT QUẢ ⇒ phải thấy**.
 *
 * Vì vậy tiêu chí giờ là: part này có cần staff BẤM/QUYẾT ĐỊNH, hoặc mang UI THẬT không nằm trong
 * `part.output` của chính nó, không? Có ⇒ `Primary`. Chỉ để đọc số ⇒ `Reference`. Thêm tool mới
 * mà băn khoăn thì chọn `Reference`.
 */
const AI_TOOL_CARD_PLACEMENT: Record<AiToolName, ToolCardPlacement> = {
  // Output là NÚT điều hướng / tín hiệu vẽ chart — xem giải thích ngoại lệ ở trên.
  [AiToolName.NavigateTo]: ToolCardPlacement.Primary,
  [AiToolName.RenderChart]: ToolCardPlacement.Primary,
  [AiToolName.FinancialByGame]: ToolCardPlacement.Reference,
  [AiToolName.FinancialDailyOverview]: ToolCardPlacement.Reference,
  [AiToolName.FinancialTrend]: ToolCardPlacement.Reference,
  [AiToolName.FinancialTrendByGame]: ToolCardPlacement.Reference,
  [AiToolName.SystemOutstanding]: ToolCardPlacement.Reference,
  [AiToolName.GameJackpot]: ToolCardPlacement.Reference,
  [AiToolName.GameConfig]: ToolCardPlacement.Reference,
  [AiToolName.TenantGameConfig]: ToolCardPlacement.Reference,
  [AiToolName.DrawsOverview]: ToolCardPlacement.Reference,
  [AiToolName.DrawDetail]: ToolCardPlacement.Reference,
  [AiToolName.ListDraws]: ToolCardPlacement.Reference,
  [AiToolName.OpsSnapshot]: ToolCardPlacement.Reference,
  [AiToolName.OpsAlerts]: ToolCardPlacement.Reference,
  [AiToolName.DrawSettleReport]: ToolCardPlacement.Reference,
  [AiToolName.IntegrationHealth]: ToolCardPlacement.Reference,
  [AiToolName.PlayerAccountInfo]: ToolCardPlacement.Reference,
  [AiToolName.PlayerInsight]: ToolCardPlacement.Reference,
  [AiToolName.SearchAuditLogs]: ToolCardPlacement.Reference,
  [AiToolName.JackpotHistory]: ToolCardPlacement.Reference,
  [AiToolName.DispatchOrders]: ToolCardPlacement.Reference,
  [AiToolName.VoidReport]: ToolCardPlacement.Reference,
};

/** Placement của tool. Tool lạ (built-in eve, tool bản mới) → `Reference`: mặc định là GỘP. */
export function getToolCardPlacement(toolName: string): ToolCardPlacement {
  if (!isKnownAiTool(toolName)) {
    return ToolCardPlacement.Reference;
  }
  return AI_TOOL_CARD_PLACEMENT[toolName];
}

/** Nhãn cho tool chưa khai trong {@link AI_TOOL_LABELS} — xem {@link getToolLabel}. */
const UNLABELED_TOOL = "Tác vụ nội bộ";

/**
 * Tool đã log thiếu nhãn — `getToolLabel` chạy MỖI LẦN render message, log thẳng sẽ đổ hàng trăm
 * dòng giống nhau vào console. Module scope nên sống qua re-render, chỉ reset khi reload trang.
 */
const loggedUnlabeledTools = new Set<string>();

/**
 * Nhãn tiếng Việt của tool.
 *
 * Tool chưa map thì trả nhãn chung, KHÔNG trả `toolName` thô: tên kỹ thuật không giúp gì cho nhân
 * viên vận hành nhưng lại phơi bề mặt công cụ của agent ra UI (`bash`, `web_fetch`,
 * `getSystemOutstanding`…) — vừa nhiễu, vừa mời người tò mò thử điều khiển agent gọi thẳng chúng.
 * Chi tiết kỹ thuật thuộc log, không thuộc hội thoại của staff.
 *
 * Nhánh fallback chỉ chạy cho tool eve tự thêm ở bản mới (ta chưa biết tên) — tool của MegaWin đã
 * bị compiler bắt qua kiểu của {@link AI_TOOL_LABELS}. Nên nó log để ta biết mà bổ sung, thay vì
 * im lặng hiện nhãn chung mãi.
 */
// ĐÃ CÂN NHẮC VÀ TỪ CHỐI: hiện thêm tên kỹ thuật khi ở dev/staging, ẩn ở production. Hai nhánh
// render theo môi trường ⇒ nhánh production (ít chạy nhất lúc code) là nhánh dễ lỗi nhất mà không
// reproduce được ở máy dev. Đường debug đã đủ: `output-error` LUÔN hiện tham số ở mọi môi trường
// (xem `render-message.tsx`), và log server có đủ input/output. Nếu vẫn muốn làm, cổng PHẢI là
// `env.NEXT_PUBLIC_APP_ENV`, KHÔNG phải `NODE_ENV` (build staging cũng "production").
// Lý lẽ đầy đủ: `.cursor/plans/ai-panel/p0-04-sandbox-chat-ux.plan.md` §4.16.2.
export function getToolLabel(toolName: string): string {
  const label = AI_TOOL_LABELS[toolName as LabeledToolName];
  if (label !== undefined) {
    return label;
  }

  if (!loggedUnlabeledTools.has(toolName)) {
    loggedUnlabeledTools.add(toolName);
    logInfo("ai-chat", `Tool ${toolName} chưa có nhãn, hiển thị "${UNLABELED_TOOL}" — bổ sung AI_TOOL_LABELS.`);
  }
  return UNLABELED_TOOL;
}

/**
 * Renderer cho `toolName`, `undefined` nếu chưa khai (caller fallback `<Tool>` mặc định).
 *
 * Renderer trả về VẪN có thể trả `null` — spec `select` trả `null` khi output ở dạng nó không
 * mô tả được. Caller PHẢI xử lý được cả 2 trường hợp, xem `DynamicToolPartView`.
 */
export function getToolRenderer(toolName: string): ToolPartRenderer | undefined {
  if (!isKnownAiTool(toolName)) {
    return undefined;
  }
  return toolRenderers[toolName];
}
