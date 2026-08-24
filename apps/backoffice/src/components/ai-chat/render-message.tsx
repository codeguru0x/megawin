"use client";

/**
 * AI Chat — `renderMessage`: chuyển `EveMessage` sang AI Elements.
 *
 * QUAN TRỌNG (p0-03 §1): `EveMessage`/`EveMessagePart` KHÔNG interchangeable với `UIMessage`
 * của AI SDK (eve có `authorization`, HITL `toolMetadata.eve.inputRequest`, `file` có thể
 * thiếu `url`). Component dưới đây viết theo ĐÚNG shape part của eve, KHÔNG cast sang
 * `UIMessage` — tham khảo mẫu chính thức trong `eve/dist/.../web-template.js`.
 */

import { useCallback, useEffect, useState } from "react";

import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessageInputRequest,
  EveMessagePart,
} from "eve/react";
import {
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import { AssistantHeader } from "./assistant-header";
import { InternalSteps, toMessageSegments } from "./internal-steps";
import { getToolLabel, getToolRenderer } from "./tool-renderers/registry";

/** Giữ icon "đã copy" 2 giây — đủ để user thấy phản hồi, không quá lâu gây nhầm trạng thái. */
const COPY_FEEDBACK_MS = 2000;

/**
 * Cho phép hiện khối JSON tham số của tool — CÙNG cổng env với `SHOW_TOOL_DETAIL`
 * (`internal-steps.tsx`), vì cùng bản chất: dữ kiện để dev đối soát, không phải nội dung nghiệp vụ.
 *
 * Ngoại lệ KHÔNG đi qua cổng này: cửa duyệt hành động (`tool-approval`) luôn phải cho thấy tham số,
 * kể cả debug tắt — xem giải thích ở {@link DefaultToolView}.
 */
const SHOW_TOOL_PARAMS = env.NEXT_PUBLIC_AI_CHAT_DEBUG === "true";

type EveFilePart = Extract<EveMessagePart, { type: "file" }>;

export interface AgentInputResponseInput {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
}

/** "1.5 KB" / "2.0 MB" — kích thước file đính kèm, undefined nếu server không trả size. */
function formatBytes(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPart({ part }: { part: EveFilePart }) {
  const label = part.filename ?? "Tệp đính kèm";
  const detail = [part.mediaType, formatBytes(part.size)].filter(Boolean).join(" · ");
  const isImage = part.mediaType.startsWith("image/");
  const Icon = isImage ? ImageIcon : FileIcon;
  const body = (
    <span className="flex max-w-sm items-center gap-3 rounded-md border bg-background/60 p-2 text-sm">
      {isImage ? (
        // biome-ignore lint/performance/noImgElement: file url tuỳ ý từ eve (blob/remote domain bất kỳ), không thể khai next/image remotePatterns tĩnh.
        <img alt={label} className="size-12 shrink-0 rounded-sm object-cover" src={part.url} />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {detail && <span className="block truncate text-muted-foreground">{detail}</span>}
      </span>
      {part.url && <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />}
    </span>
  );

  if (!part.url) {
    return body;
  }
  return (
    <a href={part.url} rel="noreferrer" target="_blank">
      {body}
    </a>
  );
}

function formatAuthorizationOutcome(outcome: NonNullable<EveAuthorizationPart["outcome"]>): string {
  switch (outcome) {
    case "authorized":
      return "đã xác thực";
    case "declined":
      return "bị từ chối";
    case "failed":
      return "thất bại";
    case "timed-out":
      return "hết thời gian chờ";
    default:
      return outcome;
  }
}

function authorizationTitle(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return `Kết nối ${part.displayName}`;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} đã kết nối`;
  }
  return `${part.displayName} xác thực ${formatAuthorizationOutcome(part.outcome)}`;
}

function authorizationDescription(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return part.description;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} đã kết nối.`;
  }
  const tail = part.reason !== undefined ? ` (${part.reason})` : "";
  return `${part.displayName} xác thực ${formatAuthorizationOutcome(part.outcome)}${tail}.`;
}

function AuthorizationPromptPart({ part }: { part: EveAuthorizationPart }) {
  const isAuthorized = part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const Icon = isAuthorized ? CheckCircleIcon : isCompleted ? XCircleIcon : KeyRoundIcon;
  const instructions = part.authorization?.instructions;
  const shouldShowInstructions = instructions !== undefined && instructions !== part.description;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3",
        isAuthorized
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isCompleted
            ? "border-destructive/30 bg-destructive/5"
            : "border-blue-500/30 bg-blue-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            isAuthorized
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : isCompleted
                ? "bg-destructive/10 text-destructive"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-sm">{authorizationTitle(part)}</p>
          <p className="text-muted-foreground text-sm">{authorizationDescription(part)}</p>
          {shouldShowInstructions && <p className="text-muted-foreground text-sm">{instructions}</p>}
          {part.state === "required" && part.authorization?.userCode && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Mã</span>
              <code className="rounded-md bg-background px-2 py-1 font-mono">{part.authorization.userCode}</code>
            </div>
          )}
          {part.state === "required" && part.authorization?.url && (
            <Button asChild size="sm">
              <a href={part.authorization.url} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-4" />
                Đăng nhập với {part.displayName}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `kind === "tool-approval"` là HITL do FRAMEWORK eve tự phát sinh cho tool có
 * `approval: always()`/`once()` (hiện chỉ `web_fetch` — xem `agent/tools/web_fetch.ts`) — prompt
 * `"Approve tool call: <toolName>"` và 2 option `"Approve"`/`"Cancel"` đều là văn bản CỨNG trong
 * `eve` (`dist/src/harness/input-extraction.js`), KHÔNG đi qua model nên KHÔNG sửa được bằng
 * system prompt. Phơi tên tool kỹ thuật (`web_fetch`) + tiếng Anh cho staff không rành kỹ thuật là
 * bug thật đã thấy trên UI — phải dịch tay ở tầng render.
 *
 * `id` "approve"/"cancel" do framework đặt CỐ ĐỊNH nên map theo id an toàn — KHÔNG áp dụng cho
 * `kind === "question"` (`ask_question`), nơi `id`/`label` do MODEL tự chọn tự do và model đã được
 * dạy trả lời tiếng Việt (`agent/instructions.md`); đụng vào đó sẽ dịch nhầm lựa chọn của model.
 *
 * `kind === "session-limit"` cũng là văn bản cứng tiếng Anh và cũng phải dịch — xem
 * {@link SESSION_LIMIT_OPTION_LABELS}.
 */
const TOOL_APPROVAL_OPTION_LABELS: Record<string, string> = {
  approve: "Duyệt",
  cancel: "Từ chối",
};

/**
 * `kind === "session-limit"` là HITL do harness eve phát sinh khi session chạm `limits` trong
 * `agent/agent.ts`. Cả prompt lẫn nhãn option đều là văn bản CỨNG tiếng Anh trong eve
 * (`dist/src/harness/session-limit-continuation.js`) và KHÔNG đi qua model, nên cũng phải dịch tay
 * y như `tool-approval` — trước đây nhánh này rơi xuống `inputRequest.prompt` và staff thấy nguyên
 * văn _"This session has hit the input-token limit (20M) per session. This is a guardrail against
 * defective long-running sessions…"_ kèm 2 nút "Approve"/"Stop".
 *
 * Bản dịch CỐ Ý bỏ con số token và cụm "guardrail": staff không quyết định được gì tốt hơn nhờ biết
 * "20M input token", còn phơi ra thì vi phạm nguyên tắc "chi tiết kỹ thuật thuộc log, không thuộc
 * hội thoại của staff" (`tool-renderers/registry.tsx`). Số token thật vẫn còn nguyên trong log
 * server, và hiện lại trên thẻ khi bật `NEXT_PUBLIC_AI_CHAT_DEBUG` (xem {@link SHOW_TOOL_PARAMS}).
 *
 * `id` "continue"/"stop" do framework đặt CỐ ĐỊNH (`SESSION_LIMIT_CONTINUE_OPTION_ID`/
 * `SESSION_LIMIT_STOP_OPTION_ID`) nên map theo id an toàn — KHÁC bộ id của `tool-approval`
 * ("approve"/"cancel"), vì vậy phải là bảng riêng chứ không gộp chung.
 */
const SESSION_LIMIT_OPTION_LABELS: Record<string, string> = {
  continue: "Tiếp tục",
  stop: "Dừng lại",
};

/**
 * Câu thay cho prompt tiếng Anh của eve. Nói đúng 3 điều staff cần: (1) vì sao dừng, (2) đây KHÔNG
 * phải lỗi dữ liệu — số vừa tra vẫn dùng được, (3) chọn gì thì xảy ra gì. Điều (2) quan trọng nhất:
 * một hộp cảnh báo vàng xuất hiện giữa lúc đang tra tiền rất dễ bị hiểu là "số liệu có vấn đề".
 */
const SESSION_LIMIT_PROMPT =
  "Phiên trao đổi này đã dùng hết định mức được cấp cho một phiên. Đây là cơ chế an toàn phòng " +
  "trường hợp trợ lý lặp vô hạn, KHÔNG phải lỗi dữ liệu — các số đã tra ở trên vẫn dùng được. " +
  "Nếu cuộc trao đổi vẫn đang diễn ra bình thường, chọn Tiếp tục để làm việc tiếp; chọn Dừng lại " +
  "thì lượt đang xử lý bị huỷ, phiên vẫn giữ nguyên lịch sử.";

/** Thay `"Approve tool call: <toolName>"` bằng câu tiếng Việt nêu tên nghiệp vụ (`getToolLabel`) —
 * không lộ tên tool kỹ thuật, đúng nguyên tắc "chi tiết kỹ thuật thuộc log, không thuộc hội thoại
 * của staff" (`tool-renderers/registry.tsx`). */
function toolApprovalPrompt(toolLabel: string): string {
  return `Cho phép agent thực hiện "${toolLabel}"? Xem tham số bên dưới trước khi quyết định.`;
}

/** `kind` của HITL request — lấy từ type của eve, KHÔNG khai báo lại literal ở đây. */
type HitlKind = EveMessageInputRequest["kind"];

/** Dựng prompt tiếng Việt cho một `kind`; `toolLabel` chỉ có nghĩa với `tool-approval`. */
type HitlPromptBuilder = (inputRequest: EveMessageInputRequest, toolLabel: string) => string;

/**
 * Bảng dịch prompt theo `kind`, kèm lá chắn compile.
 *
 * `satisfies Record<HitlKind, …>` giữ đúng ý định cũ: eve thêm `kind` mới mà quên dịch thì THIẾU
 * KEY ở đây là đỏ compile, buộc dịch trước khi ship (chính lỗ hổng "kind mới rơi vào nhánh chung"
 * là cách prompt tiếng Anh của `session-limit` lọt ra UI lần đầu).
 *
 * Trước đây lá chắn này là `switch` KHÔNG `default` — cách đó phụ thuộc việc TS narrow được union
 * `kind`, và union đó KHÔNG đáng tin: eve suy nó ra bằng `z.infer<typeof inputRequestKindSchema>`,
 * trong khi `.d.ts` của eve `import * as z from "zod"` mà package **không khai báo zod** ở
 * `dependencies` lẫn `peerDependencies`. Zod chỉ resolve được nhờ hoisting — tuỳ layout
 * `node_modules` của từng máy. Nơi nào không resolve được thì `z` thành `any` (lỗi bị
 * `skipLibCheck` che), `kind` thành `any`, không nhánh `case` nào chứng minh được exhaustive →
 * `TS2366 Function lacks ending return statement`. Đã xảy ra thật: build Vercel đỏ trong khi
 * `check-types` local xanh. Bảng tra + fallback giữ nguyên lá chắn nhưng hàm LUÔN có đường trả về.
 *
 * Annotation `Record<string, …>` là CỐ Ý (không phải thừa): nó cho phép index bằng `kind` kể cả khi
 * type của eve suy rộng thành `string`, tránh lỗi implicit-any index ở đúng môi trường vừa nói.
 */
const HITL_PROMPT_BUILDERS: Record<string, HitlPromptBuilder | undefined> = {
  "tool-approval": (_inputRequest, toolLabel) => toolApprovalPrompt(toolLabel),
  "session-limit": () => SESSION_LIMIT_PROMPT,
  // `ask_question`: prompt do MODEL sinh, đã là tiếng Việt theo instructions — giữ nguyên văn,
  // dịch lại sẽ làm sai ý model.
  question: (inputRequest) => inputRequest.prompt,
} satisfies Record<HitlKind, HitlPromptBuilder>;

/**
 * Bảng nhãn nút theo `kind` — cùng cơ chế lá chắn và cùng lý do bỏ `switch` như
 * {@link HITL_PROMPT_BUILDERS}.
 *
 * `question: undefined` là khai báo có chủ đích, không phải thiếu sót: `ask_question` có `id`/`label`
 * do model tự chọn tự do — đụng vào là dịch nhầm lựa chọn của model.
 */
const HITL_OPTION_LABELS: Record<string, Record<string, string> | undefined> = {
  "tool-approval": TOOL_APPROVAL_OPTION_LABELS,
  "session-limit": SESSION_LIMIT_OPTION_LABELS,
  question: undefined,
} satisfies Record<HitlKind, Record<string, string> | undefined>;

/** Prompt hiển thị cho staff, dịch tay theo `kind`. */
function resolveHitlPrompt(inputRequest: EveMessageInputRequest, toolLabel: string): string {
  const build = HITL_PROMPT_BUILDERS[inputRequest.kind];
  // `kind` ngoài bảng (eve thêm mới ở bản sau): trả prompt gốc của eve — tiếng Anh nhưng đúng nội
  // dung, hơn là hiện hộp rỗng giữa lúc staff phải quyết định duyệt/dừng.
  return build?.(inputRequest, toolLabel) ?? inputRequest.prompt;
}

/** Nhãn nút, dịch tay theo `kind`. */
function resolveHitlOptionLabel(inputRequest: EveMessageInputRequest, option: { id: string; label: string }): string {
  return HITL_OPTION_LABELS[inputRequest.kind]?.[option.id] ?? option.label;
}

/**
 * Màu nút theo mức nghiêm trọng THẬT của hành động, không theo `option.style` của eve.
 *
 * Quy ước chung: `destructive` chỉ dành cho hành động **mất mát không lấy lại được**. `session-limit`
 * không thuộc loại đó (xem giải thích tại chỗ dùng), nên "Dừng lại" là `outline` dù eve gắn
 * `style: "danger"`.
 */
function resolveHitlOptionVariant(
  inputRequest: EveMessageInputRequest,
  option: { id: string; style?: string },
): "default" | "destructive" | "outline" {
  if (inputRequest.kind === "session-limit") {
    return option.id === "stop" ? "outline" : "default";
  }
  if (option.style === "danger") {
    return "destructive";
  }
  if (inputRequest.kind === "tool-approval" && option.id === "cancel") {
    return "outline";
  }
  return "default";
}

/** Nút Duyệt/Từ chối/lựa chọn cho HITL — chỉ hiện khi câu hỏi CHƯA được trả lời. */
function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  canRespond: boolean;
  onInputResponses: (responses: readonly AgentInputResponseInput[]) => void;
  part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find((option) => option.id === inputResponse?.optionId);
  const prompt = resolveHitlPrompt(inputRequest, getToolLabel(part.toolName));

  return (
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <p className="text-muted-foreground text-sm">{prompt}</p>
      {inputResponse ? (
        <p className="font-medium text-sm">
          Đã trả lời:{" "}
          {selectedOption
            ? resolveHitlOptionLabel(inputRequest, selectedOption)
            : (inputResponse.text ?? inputResponse.optionId)}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                onInputResponses([{ optionId: option.id, requestId: inputRequest.requestId }]);
              }}
              size="sm"
              type="button"
              // Nút "cancel" của tool-approval không có `option.style` từ framework (luôn
              // "default") — dùng outline để tách bạch trực quan khỏi nút Duyệt (primary),
              // tránh 2 nút cùng màu khiến staff không rành kỹ thuật khó biết đâu là hành động
              // chính.
              //
              // "Dừng lại" của session-limit thì NGƯỢC LẠI: eve gắn `style: "danger"` nhưng hành vi
              // thật chỉ là huỷ lượt đang xử lý (`turn.cancelled` → `session.waiting`) — lịch sử và
              // số đã tra còn nguyên, bấm lại là tiếp tục được. Nút đỏ ở đây báo sai mức nghiêm
              // trọng: staff đọc đỏ là "mất dữ liệu" nên không dám bấm, dù đó là lựa chọn vô hại.
              variant={resolveHitlOptionVariant(inputRequest, option)}
            >
              {resolveHitlOptionLabel(inputRequest, option)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Câu thay thế cho `errorText` thô của tool.
 *
 * `errorText` do framework/runtime sinh, LUÔN là tiếng Anh kỹ thuật và thường nhúng tên tool +
 * tool call id — đúng ca đã thấy 17/08: `Tool "getGameConfig" call "toolu_01Ei7…" returned a
 * non-JSON-serializable result`. Nó nằm trong mục "Chi tiết xử lý" nên chỉ hiện khi có người bấm,
 * nhưng người bấm là STAFF (dev đọc log server), nên hiện nguyên văn vừa vô nghĩa với họ vừa phá
 * đúng nguyên tắc không phơi tên tool.
 *
 * Nội dung thật đi vào `console.error` (client) và `logError` + `incidentId` (server, xem
 * `src/server/ai/tool-result.ts`) — không mất đường debug.
 */
const TOOL_ERROR_NOTE = "Bước này không hoàn tất. Chi tiết kỹ thuật đã được ghi vào log hệ thống.";

/** Đã log `errorText` nào — `DefaultToolView` render lại mỗi lần stream tick, log thẳng sẽ spam console. */
const loggedToolErrors = new Set<string>();

function ToolErrorNote({ errorText, toolName }: { errorText: string; toolName: string }) {
  // Log trong effect (không trong thân render) để StrictMode double-render không nhân đôi dòng log
  // và để render giữ tính thuần khiết.
  useEffect(() => {
    const dedupeKey = `${toolName}:${errorText}`;
    if (loggedToolErrors.has(dedupeKey)) {
      return;
    }
    loggedToolErrors.add(dedupeKey);
    console.error(`[ai-chat] tool ${toolName} lỗi:`, errorText);
  }, [errorText, toolName]);

  return (
    <div className="space-y-1.5">
      <h4 className="font-medium text-muted-foreground text-xs">Trạng thái</h4>
      <p className="rounded-md bg-muted/50 p-2 text-muted-foreground text-xs">{TOOL_ERROR_NOTE}</p>
    </div>
  );
}

function DefaultToolView({
  canRespond,
  onInputResponses,
  part,
  turnEnded,
}: {
  canRespond: boolean;
  onInputResponses: (responses: readonly AgentInputResponseInput[]) => void;
  part: EveDynamicToolPart;
  turnEnded: boolean;
}) {
  // Turn đã kết thúc mà part vẫn chưa có output ⇒ mồ côi: không bao giờ nhận output nữa
  // (p0-04 §3.2 Bug B — trước đây hiện "Đang chạy" xoay vĩnh viễn, user tưởng còn chạy).
  const isInterrupted = turnEnded && (part.state === "input-available" || part.state === "input-streaming");
  const needsApproval = part.state === "approval-requested" || part.state === "approval-responded";
  // Mở sẵn CHỈ khi user cần hành động (duyệt) hoặc cần thấy lỗi. Còn lại đóng cho gọn.
  const shouldOpen = needsApproval || part.state === "output-error";
  // Tham số thô ĐƯỢC PHÉP hiện ở ĐÚNG MỘT tình huống: chờ duyệt một hành động (`tool-approval`) —
  // duyệt mà không thấy duyệt cái gì thì việc duyệt vô nghĩa và thành lỗ hổng (`web_fetch` phải cho
  // thấy URL). Ngoài ra chỉ hiện khi bật debug.
  //
  // ĐÃ CẮT (24/08, feedback ảnh 3): khi Mira HỎI LẠI (`ask_question`, `inputRequest.kind` là
  // `"question"`) và khi tool LỖI. Câu hỏi đã nằm nguyên văn trong khối vàng ngay bên dưới, còn khối
  // JSON `{gameKey, from, to}` bên trên nó chỉ làm người vận hành tưởng mình phải hiểu/điền cái gì
  // đó. Với tool lỗi, `errorText` thô đã bị thay bằng câu tiếng Việt trung tính (xem
  // {@link TOOL_ERROR_NOTE}) — phơi tham số thô ngay cạnh là tự phá quy tắc đó; đường điều tra thật
  // là log server + bật `NEXT_PUBLIC_AI_CHAT_DEBUG`.
  const isApprovalGate = needsApproval && part.toolMetadata?.eve?.inputRequest?.kind === "tool-approval";
  const showInput = isApprovalGate || (SHOW_TOOL_PARAMS && (needsApproval || part.state === "output-error"));
  const errorText = part.errorText;
  // Ẩn tham số làm lộ ra một lỗ: lúc tool ĐANG chạy thì output chưa có (`ToolOutput` trả `null`)
  // và không có input request ⇒ mở card ra là khung trống. Thay bằng một dòng trạng thái.
  const hasBody = showInput || Boolean(part.output) || Boolean(errorText);

  return (
    <Tool defaultOpen={shouldOpen}>
      <ToolHeader
        interrupted={isInterrupted}
        state={part.state}
        title={getToolLabel(part.toolName)}
        toolName={part.toolName}
        type="dynamic-tool"
      />
      <ToolContent>
        {showInput && <ToolInput input={part.input} />}
        <InputRequestActions canRespond={canRespond} onInputResponses={onInputResponses} part={part} />
        {errorText === undefined ? (
          <ToolOutput errorText={undefined} output={part.output} />
        ) : (
          <ToolErrorNote errorText={errorText} toolName={part.toolName} />
        )}
        {!hasBody && (
          <p className="text-muted-foreground text-xs">
            {isInterrupted ? "Không có kết quả." : "Đang chạy, chưa có kết quả."}
          </p>
        )}
      </ToolContent>
      {isInterrupted && (
        <p className="border-t px-3 py-2 text-muted-foreground text-xs">
          Tác vụ không hoàn tất do phiên bị ngắt — hãy hỏi lại.
        </p>
      )}
    </Tool>
  );
}

function DynamicToolPartView({
  canRespond,
  messageParts,
  onInputResponses,
  part,
  partIndex,
  turnEnded,
}: {
  canRespond: boolean;
  /** Toàn bộ part của message đang chứa `part` — cần cho renderer dò part LIỀN TRƯỚC (`renderChart`). */
  messageParts: readonly EveMessagePart[];
  onInputResponses: (responses: readonly AgentInputResponseInput[]) => void;
  part: EveDynamicToolPart;
  /** Vị trí của CHÍNH `part` này trong `messageParts`. */
  partIndex: number;
  turnEnded: boolean;
}) {
  const fallback = (
    <DefaultToolView canRespond={canRespond} onInputResponses={onInputResponses} part={part} turnEnded={turnEnded} />
  );

  // Renderer chuyên biệt chỉ nhận state đã có output — các state khác (đang chạy, cần approve)
  // phải qua DefaultToolView để staff thấy tiến trình, không "đứng hình" chờ output.
  if (part.state !== "output-available" || part.partial) {
    return fallback;
  }

  const render = getToolRenderer(part.toolName);
  if (render === undefined) {
    return fallback;
  }

  // Renderer trả `null` ⇒ output ở dạng spec/card không mô tả được. Fallback về JSON gập lại
  // để staff vẫn xem được dữ liệu thô, thay vì thấy khoảng trắng (p0-04 §4.11).
  return render(part, { messageParts, partIndex }) ?? fallback;
}

function AgentMessagePart({
  canRespond,
  isStreamingText,
  messageParts,
  onInputResponses,
  part,
  partIndex,
  turnEnded,
}: {
  canRespond: boolean;
  /**
   * Part text này là ĐUÔI của message assistant đang stream ⇒ bật fade-in từng từ.
   * Chỉ đúng một part trong cả hội thoại có giá trị `true` tại một thời điểm (xem {@link AgentMessage}).
   */
  isStreamingText: boolean;
  /** Toàn bộ part của message chứa `part` — truyền xuống `DynamicToolPartView` cho renderer cần dò part khác. */
  messageParts: readonly EveMessagePart[];
  onInputResponses: (responses: readonly AgentInputResponseInput[]) => void;
  part: EveMessagePart;
  /** Vị trí của CHÍNH `part` trong `messageParts`. */
  partIndex: number;
  turnEnded: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      // KHÔNG truyền `caret`: caret của streamdown là ký tự `▋` (U+258B) chèn tĩnh vào `::after` của
      // block cuối — không nhấp nháy, không di chuyển, nên staff đọc ra thành "ô chữ nhật đen" dính
      // vào chữ chứ không hiểu là con trỏ đang gõ (feedback 17/08). Với văn bản có bảng số liệu nó
      // còn đứng lơ lửng sau ô cuối của bảng.
      // Cảm giác "đang viết tiếp" giờ do fade-in từng từ đảm nhiệm (`STREAM_TEXT_ANIMATION` trong
      // `ai-elements/message.tsx`) — giống ChatGPT/Claude, chữ tự hiện dần theo nhịp model trả.
      // `isAnimating` VẪN cần: đó là cổng bật animate plugin của streamdown, tắt thì text lại đổ
      // thành từng cục.
      return <MessageResponse isAnimating={isStreamingText}>{part.text}</MessageResponse>;
    case "reasoning":
      // KHÔNG truyền defaultOpen: để `Reasoning` tự mở khi stream và tự đóng sau khi xong
      // (AUTO_CLOSE_DELAY). Trước đây `defaultOpen` cứng làm chain-of-thought phơi vĩnh viễn
      // giữa hội thoại (p0-04 §0.3 U1).
      return (
        <Reasoning isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "file":
      return <AttachmentPart part={part} />;
    case "authorization":
      return <AuthorizationPromptPart part={part} />;
    case "dynamic-tool":
      return (
        <DynamicToolPartView
          canRespond={canRespond}
          messageParts={messageParts}
          onInputResponses={onInputResponses}
          part={part}
          partIndex={partIndex}
          turnEnded={turnEnded}
        />
      );
    default:
      return null;
  }
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `authorization:${part.turnId}:${part.stepIndex}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}

/** Copy text của message; đổi icon 2 giây để user biết đã copy. */
function CopyMessageAction({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
      })
      .catch((error: unknown) => {
        console.error("[ai-chat] copy thất bại", error);
      });
  }, [text]);

  // Reset icon sau 2s — dùng effect (không setTimeout trong handler) để cleanup đúng khi unmount.
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <MessageAction onClick={handleCopy} tooltip={copied ? "Đã copy" : label}>
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </MessageAction>
  );
}

/**
 * Render 1 `EveMessage` — dùng trong `.map((message) => <AgentMessage ... />)` trên `data.messages`.
 *
 * Part được chia thành 2 luồng: nội dung cho staff hiện thẳng, nội thất agent gộp vào mục đóng sẵn
 * (`internal-steps.tsx`).
 */
export function AgentMessage({
  canRespond,
  isActive,
  isStreaming,
  message,
  onInputResponses,
  onReuseQuestion,
  turnEnded,
  turnStartedAt,
}: {
  canRespond: boolean;
  /**
   * Lượt này đang chạy (`submitted`/`streaming`) — bật `LiveDot` cuối hàng tên trợ lý. Rộng hơn
   * `isStreaming`: bao cả pha `submitted` khi message đã tạo nhưng chưa có part nào.
   */
  isActive: boolean;
  isStreaming: boolean;
  message: EveMessage;
  onInputResponses: (responses: readonly AgentInputResponseInput[]) => void;
  /**
   * Nạp câu hỏi user NGAY TRƯỚC message này vào ô nhập để staff sửa rồi tự bấm gửi. `undefined` ⇒
   * ẩn nút (message đầu hội thoại là assistant, không có câu hỏi nào phía trước).
   *
   * KHÔNG gửi thẳng (đổi 24/08): bản trước bấm là gửi lại NGUYÊN VĂN ngay, nên nút chỉ hữu ích khi
   * câu hỏi vốn đã đúng — mà lý do thật khiến staff bấm lại thường là câu hỏi THIẾU Ý (quên nêu kỳ
   * hạn, quên nêu game, quên nêu loại biểu đồ). Nạp xuống ô nhập phục vụ được CẢ HAI: sửa rồi gửi,
   * hoặc bấm gửi luôn nếu không cần sửa.
   *
   * Đây cũng là lý do bubble message user KHÔNG còn hàng nút riêng: "Copy câu hỏi" + "Sửa lại câu
   * hỏi" ở đó làm đúng việc mà nút này đã làm, chỉ khác chỗ bấm (feedback 24/08).
   *
   * Lưu ý về mô hình: KHÔNG phải sửa tại chỗ. Message đã gửi thuộc lịch sử thread trên server,
   * client không xoá/ghi đè được — câu sửa lại đi tiếp như một lượt MỚI.
   */
  onReuseQuestion?: () => void;
  /** Turn đã kết thúc — dùng để phát hiện tool call mồ côi (p0-04 §3.2). */
  turnEnded: boolean;
  /** Mốc `Date.now()` lúc lượt bắt đầu (xem `assistant-header.tsx`); `null` nếu không phải lượt đang chạy. */
  turnStartedAt: number | null;
}) {
  const lastTextIndex = message.parts.reduce((last, part, index) => (part.type === "text" ? index : last), -1);
  // Chữ ĐANG chảy ⇔ part CUỐI của message là text (agent chưa rời chữ đi làm việc khác). Dùng để
  // tắt `LiveDot` đúng lúc — xem `isThinking` bên dưới.
  const isWritingText = lastTextIndex === message.parts.length - 1;
  const isAssistant = message.role === "assistant";
  // Chỉ gộp text part cho nút Copy — không copy reasoning/tool JSON (user muốn câu trả lời).
  const plainText = message.parts
    .filter((part): part is Extract<EveMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
  const hasText = plainText.trim() !== "";
  const showAssistantActions = isAssistant && !isStreaming && hasText;
  // Nội thất agent (reasoning, tool đang chạy/lỗi/JSON thô) gộp vào mục đóng sẵn — xem
  // `internal-steps.tsx`. Chỉ áp cho assistant; message user không có part loại này.
  const segments = toMessageSegments(message.parts);

  return (
    <Message data-optimistic={message.metadata?.optimistic ? "true" : undefined} from={message.role}>
      {isAssistant && (
        // `isThinking`: dot sống trong MỌI khoảng agent đang làm việc mà chữ không chảy ra — đầu
        // lượt (chưa viết gì) VÀ mỗi lần agent viết xong một đoạn rồi đi gọi tool (feedback 23/08:
        // tra tool 50 giây mà dot đã tắt thì staff tưởng đã trả lời xong). Chỉ tắt trong lúc chữ
        // đang chảy, vì lúc đó chữ tự nó là tín hiệu (feedback 19/08 lần 4). `isActive` vẫn truyền
        // nguyên để chốt tổng thời gian đúng lúc lượt kết thúc, KHÔNG được gộp hai cờ này (xem
        // `assistant-header.tsx`).
        <AssistantHeader isActive={isActive} isThinking={isActive && !isWritingText} turnStartedAt={turnStartedAt} />
      )}
      <MessageContent>
        {segments.map((segment) =>
          segment.kind === "visible" ? (
            <AgentMessagePart
              canRespond={canRespond}
              isStreamingText={isStreaming && isAssistant && segment.item.index === lastTextIndex}
              key={partKey(segment.item.part, segment.item.index)}
              messageParts={message.parts}
              onInputResponses={onInputResponses}
              part={segment.item.part}
              partIndex={segment.item.index}
              turnEnded={turnEnded}
            />
          ) : (
            <InternalSteps items={segment.items} key={`steps:${segment.items[0]?.index ?? 0}`}>
              {segment.items.map((item) => (
                <AgentMessagePart
                  canRespond={canRespond}
                  isStreamingText={false}
                  key={partKey(item.part, item.index)}
                  messageParts={message.parts}
                  onInputResponses={onInputResponses}
                  part={item.part}
                  partIndex={item.index}
                  turnEnded={turnEnded}
                />
              ))}
            </InternalSteps>
          ),
        )}
      </MessageContent>
      {showAssistantActions && (
        // `-mt-1.5`: huỷ phần lớn `gap-2` của `Message` — toolbar là phần phụ của câu trả lời,
        // dán sát text mới đọc thành một khối; để 8px thì nó trôi lửng giữa 2 message (p0-04 §4.14).
        <MessageToolbar className="-mt-1.5">
          {/* opacity-0 + group-hover: nút chỉ hiện khi trỏ vào message, không làm rối hội thoại.
              focus-within giữ nút hiện khi điều hướng bằng bàn phím (a11y).
              `[&>button]:size-7` (28px): nhỏ hơn `icon-sm` mặc định (32px) — icon 14px trong ô 32px
              tạo viền trống dày, làm hàng nút trông xa text hơn thực tế. */}
          <MessageActions className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [&>button]:size-7">
            <CopyMessageAction label="Copy câu trả lời" text={plainText} />
            {onReuseQuestion && (
              // Nhãn nói ĐÚNG việc nó làm: nạp chữ xuống ô nhập, KHÔNG tự gửi. Nhãn cũ ("Gửi lại câu
              // hỏi") hứa một hành động dứt điểm mà giờ không còn xảy ra — staff bấm rồi ngồi chờ câu
              // trả lời sẽ tưởng nút bị hỏng.
              <MessageAction onClick={onReuseQuestion} tooltip="Hỏi lại câu này">
                <RefreshCwIcon className="size-3.5" />
              </MessageAction>
            )}
          </MessageActions>
        </MessageToolbar>
      )}
    </Message>
  );
}
