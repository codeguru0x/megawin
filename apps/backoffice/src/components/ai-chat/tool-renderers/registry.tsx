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

import { logInfo } from "@megawin/shared/utils";
import type { EveDynamicToolPart } from "eve/react";

import { renderIntegrationHealth, renderOpsSnapshot } from "./daily-ops-cards";
import { resolveToolViewData, ToolResultLine, ToolViewCard, toolViewTitle } from "./generic-tool-view";
import { renderNavigateTo } from "./navigate-tool-card";
import { drawsOverviewView } from "./ops-views";
import {
  dailyOverviewView,
  drawSettleReportView,
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
  SystemOutstanding: "getSystemOutstanding",
  GameConfig: "getGameConfig",
  GameJackpot: "getGameJackpot",
  NavigateTo: "navigateTo",
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
 * Hợp đồng của mọi renderer: nhận part, trả node — hoặc `null` để caller fallback về `<Tool>`
 * mặc định.
 *
 * Là HÀM chứ không phải component vì caller cần phân biệt "render ra rỗng" với "không render
 * được": component trả `null` thì bên ngoài không có cách nào biết, staff sẽ thấy khoảng trắng
 * thay vì JSON gập lại.
 */
export type ToolPartRenderer = (part: EveDynamicToolPart) => React.ReactNode | null;

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

const toolRenderers: Partial<Record<AiToolName, ToolPartRenderer>> = {
  [AiToolName.FinancialByGame]: specRenderer(gameSummaryView),
  [AiToolName.FinancialDailyOverview]: specRenderer(dailyOverviewView),
  [AiToolName.SystemOutstanding]: specRenderer(systemOutstandingView),
  [AiToolName.GameConfig]: specRenderer(gameConfigView),
  [AiToolName.GameJackpot]: specRenderer(gameJackpotView),
  [AiToolName.NavigateTo]: renderNavigateTo,
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
  [AiToolName.SystemOutstanding]: "Kỳ quay chờ settle",
  [AiToolName.GameConfig]: "Cấu hình game",
  [AiToolName.GameJackpot]: "Jackpot hiện tại",
  [AiToolName.NavigateTo]: "Mở trang",
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
  [AiToolName.SystemOutstanding]: "đọc danh sách kỳ chờ settle",
  [AiToolName.GameConfig]: "đọc cấu hình game",
  [AiToolName.GameJackpot]: "đọc số jackpot",
  [AiToolName.NavigateTo]: "mở trang",
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
 * NGOẠI LỆ DUY NHẤT là `navigateTo`, và nó KHÔNG phải ngoại lệ về dữ liệu mà về BẢN CHẤT:
 * output của nó là một NÚT ĐIỀU HƯỚNG, không phải số để đọc. Gộp nút vào mục đóng thì trên trang
 * `/ai` (nơi card chỉ hiện nút, không auto-navigate — xem `navigate-tool-card.tsx`) staff không
 * thấy gì để bấm ⇒ tool mất tác dụng hoàn toàn. Cùng một lý lẽ với việc `isInternalPart` luôn cho
 * HITL (`web_fetch` chờ duyệt, `ask_question`) hiện thẳng: **cần staff hành động ⇒ phải thấy**.
 *
 * Vì vậy tiêu chí giờ chỉ còn MỘT câu: part này có cần staff BẤM/QUYẾT ĐỊNH gì không? Có ⇒
 * `Primary`. Chỉ để đọc số ⇒ `Reference`. Thêm tool mới mà băn khoăn thì chọn `Reference`.
 */
const AI_TOOL_CARD_PLACEMENT: Record<AiToolName, ToolCardPlacement> = {
  // Output là NÚT điều hướng, không phải số — xem giải thích ngoại lệ ở trên.
  [AiToolName.NavigateTo]: ToolCardPlacement.Primary,
  [AiToolName.FinancialByGame]: ToolCardPlacement.Reference,
  [AiToolName.FinancialDailyOverview]: ToolCardPlacement.Reference,
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
