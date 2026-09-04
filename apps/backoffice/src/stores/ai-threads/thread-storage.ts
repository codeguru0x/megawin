/**
 * AI Threads — persist registry vào `localStorage` (p1-01 §1).
 *
 * Registry chỉ là MỤC LỤC client-side: hội thoại thật durable phía eve (session cursor +
 * event log server giữ). Mất `localStorage` (clear site data, đổi máy) chỉ mất khả năng
 * liệt kê/khôi phục lại UI, KHÔNG mất dữ liệu nghiệp vụ.
 *
 * Dùng `localStorage` (KHÔNG `sessionStorage` như panel p0-03) — thread history phải sống
 * qua tab mới/đóng trình duyệt, giống lịch sử chat của ChatGPT.
 */

import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { isCurrentTurnBoundaryEvent } from "eve/client";

export interface AiThread {
  /** uuid sinh ở client (`crypto.randomUUID()`) — KHÔNG phải `sessionId` của eve. */
  id: string;
  /** 60 ký tự đầu của message user đầu tiên; rỗng cho tới khi có message (p1-01 §2.4). */
  title: string;
  /**
   * Cursor resume của eve — `undefined` cho tới khi turn đầu tiên bắt đầu.
   *
   * `streamIndex` là SỐ ĐẾM TUYỆT ĐỐI event đã tiêu thụ từ đầu session (eve mở stream mới tại
   * đúng vị trí này). Cursor tụt sau tail thật của server ⇒ eve replay lại lượt cũ — xem
   * {@link threadNeedsCursorResync}.
   */
  session: ClientSessionState | undefined;
  /** Cache render — cap {@link MAX_STORED_EVENTS_PER_THREAD} phần tử cuối. */
  events: readonly MessageStreamEvent[];
  /**
   * Đã POST 1 turn lên eve mà CHƯA thấy mốc kết thúc lượt (`session.waiting`/`completed`/`failed`).
   *
   * Bật ngay lúc gửi, tắt khi event mốc về. Nếu cờ này còn `true` lúc mở lại thread ⇒ lượt trước
   * bị ngắt giữa (reload, đổi thread, HMR, POST lỗi) ⇒ cursor KHÔNG đáng tin, phải resync từ
   * server. Cần cờ riêng vì có khe: ngắt SAU khi server nhận turn nhưng TRƯỚC event đầu tiên —
   * lúc đó `events` vẫn kết thúc bằng mốc của lượt trước, nhìn như đã sạch.
   */
  pendingTurn?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AiThreadsRegistry {
  threads: AiThread[];
  activeThreadId: string | undefined;
}

/**
 * Bump khi wire format event stream đổi (vd eve 0.50 delta-only appends) — key cũ bị bỏ,
 * registry hydrate lại rỗng thay vì replay event cumulative bằng reducer delta.
 */
const STORAGE_KEY = "ai_threads:v2";

/** Cap event log/thread khi ghi — tránh phình localStorage cho hội thoại rất dài (kế thừa p0-03). */
const MAX_STORED_EVENTS_PER_THREAD = 500;
/** Cap số thread lưu trong registry — đầy thì xoá thread cũ nhất theo `updatedAt` (LRU). */
const MAX_THREADS = 30;
/** Độ dài title tối đa — 60 ký tự đầu message user đầu tiên (p1-01 §2.4). */
const TITLE_MAX_LENGTH = 60;

function isAiThread(value: unknown): value is AiThread {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AiThread>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.events) &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

/**
 * Cursor của thread có đáng tin để resume trực tiếp hay phải hỏi lại server?
 *
 * BUG THẬT (23/08 — prompt vừa gõ bị thay bằng prompt CŨ): eve mở stream tại `session.streamIndex`
 * lấy từ `localStorage`. Nếu số này TỤT sau tail thật của server, lượt gửi mới nhận về event của
 * LƯỢT CŨ; eve gán `message.received` cũ đó vào chính bubble optimistic vừa tạo (nó chỉ khớp theo
 * "có submission đang chờ", không so turnId) ⇒ text vừa gõ bị ghi đè bằng câu hỏi cũ, rồi câu trả
 * lời cũ chảy ra. Stream cắt tại mốc lượt cũ nên cursor chỉ nhích đúng 1 lượt ⇒ LỆCH VĨNH VIỄN,
 * và trạng thái lệch được ghi lại vào `localStorage` nên sống qua reload.
 *
 * Hai điều kiện phát hiện lệch (chỉ 1 trong 2 đúng là đủ):
 * 1. `pendingTurn` còn bật ⇒ lượt trước bị ngắt giữa (reload/đổi thread/POST lỗi), server đã hoặc
 *    đang sinh thêm event mà client chưa đọc.
 * 2. Event cuối trong log KHÔNG phải mốc kết thúc lượt ⇒ log dừng giữa lượt.
 *
 * Có session nhưng `events` rỗng (log bị cap {@link MAX_STORED_EVENTS_PER_THREAD} hoặc chỉ mất
 * cache) thì KHÔNG kết luận được gì từ log — dựa vào `pendingTurn`.
 */
export function threadNeedsCursorResync(thread: Pick<AiThread, "events" | "pendingTurn" | "session">): boolean {
  if (thread.session === undefined) {
    return false;
  }
  if (thread.pendingTurn === true) {
    return true;
  }
  const lastEvent = thread.events.at(-1);
  if (lastEvent === undefined) {
    return false;
  }
  return !isCurrentTurnBoundaryEvent(lastEvent);
}

/** Đọc registry từ `localStorage`. Bọc try-catch — private mode/quota exceeded throw khi truy cập storage. */
function readRegistry(): AiThreadsRegistry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { threads: [], activeThreadId: undefined };
    }
    const parsed = JSON.parse(raw) as Partial<AiThreadsRegistry>;
    const threads = Array.isArray(parsed.threads) ? parsed.threads.filter(isAiThread) : [];
    return {
      threads,
      activeThreadId: typeof parsed.activeThreadId === "string" ? parsed.activeThreadId : undefined,
    };
  } catch {
    return { threads: [], activeThreadId: undefined };
  }
}

/**
 * Model AI giả lập thay cho `modelId` thật (vd "claude-opus-...") trước khi ghi vào `localStorage`.
 * KHÔNG dùng chuỗi rỗng: 1 chuỗi hợp lệ giữ format ổn định nếu có code cũ nào lỡ đọc field này,
 * đồng thời không lộ nhà cung cấp model thật (17/08 — theo yêu cầu ẩn "nền tảng kỹ thuật hạ tầng").
 */
const FAKE_MODEL_ID = "megawin-v1-0826";

/**
 * Redact TOÀN BỘ field hạ tầng/kỹ thuật KHÔNG được UI nào của app đọc trước khi ghi 1 event vào
 * `localStorage` — nguyên tắc (17/08): chỉ giữ lại field thật sự cần để dựng lại UI khi mở lại
 * thread sau reload, mọi field còn lại coi là rủi ro rò rỉ hạ tầng và bị xoá/giả lập, KỂ CẢ khi
 * chưa thấy khai thác thực tế (staff mở DevTools > Application > Local Storage vẫn đọc được).
 *
 * Đã verify bằng cách đọc type `MessageStreamEvent` (`eve/dist/src/protocol/message.d.ts`) +
 * grep toàn bộ `src/components/ai-chat` cho tên field: KHÔNG có part nào trong `EveMessagePart`
 * (`message-reducer-types.d.ts`) được dựng từ các field bị redact dưới đây — an toàn xoá.
 *
 * - `session.started.runtime` (agentId/eveVersion/build.gitBranch/gitSha/deployedAt) và
 *   `.trace`/`turn.started.trace` (traceId/spanId) — lộ thẳng version framework, git commit đang
 *   deploy, và toạ độ observability nội bộ. Đây là rò rỉ hạ tầng nặng nhất, không phục vụ render.
 * - `step.started`/`compaction.requested`/`compaction.completed.modelId` — lộ tên model AI thật.
 *   Thay bằng {@link FAKE_MODEL_ID}. `compaction.requested.usageInputTokens` (billing) → `null`.
 * - `step.completed.providerMetadata`/`.usage` — số liệu billing/gateway nội bộ (generationId,
 *   token, cost).
 * - `step.failed`/`turn.failed`/`session.failed.details` — `JsonObject` tự do, có thể chứa
 *   nguyên văn lỗi provider/stack nội bộ (đúng lỗi thật đã gặp 17/08 với `ToolOutputSerializationError`).
 * - `subagent.called.childStreamPath`/`.workflowId`/`.remote` — đường dẫn stream nội bộ, workflow
 *   id, URL + resolver credential của subagent remote. Agent Mira hiện KHÔNG dùng subagent (verify
 *   bằng grep `agent/` không thấy `subagent`/`connection(`) nhưng field vẫn bị redact đề phòng
 *   tương lai thêm subagent mà quên cập nhật rule này.
 * - `authorization.required.webhookUrl` — URL webhook framework dùng nội bộ để hoàn tất OAuth
 *   callback, không phải link cho staff bấm (link staff bấm là `authorization.url`, GIỮ NGUYÊN vì
 *   `render-message.tsx` cần nó để dựng nút "Đăng nhập với ...").
 * - `session.waiting.continuationToken` — token nội bộ để resume session; app đã resume qua
 *   `AiThread.session` (`ClientSessionState`, field riêng NGOÀI `events`) nên field này trong log
 *   sự kiện là dư, không được đọc lại.
 *
 * KHÔNG đụng `toolName`/`input`/`output` của event tool-call (`actions.requested`/
 * `action.result`) — `render-message.tsx` (`getToolRenderer(part.toolName)`, `part.input`,
 * `part.output`) cần đúng các field này để dựng lại card khi mở lại thread sau reload; xoá đi sẽ
 * làm card cũ hiện trống/vỡ. Việc ẨN chi tiết kỹ thuật của các field này khỏi mắt nhân viên đã xử
 * lý ở tầng hiển thị (`internal-steps.tsx` + `ToolCardPlacement` trong `registry.tsx`), áp dụng
 * đều cho dữ liệu mới từ stream và dữ liệu replay từ `localStorage` — không cần xử lý lại ở đây.
 */
function redactSensitiveEventFields(event: MessageStreamEvent): MessageStreamEvent {
  switch (event.type) {
    case "session.started":
      return { ...event, data: { ...event.data, runtime: undefined, trace: undefined } };
    case "turn.started":
      return { ...event, data: { ...event.data, trace: undefined } };
    case "step.started":
      return { ...event, data: { ...event.data, modelId: FAKE_MODEL_ID } };
    case "step.completed": {
      const { providerMetadata: _providerMetadata, usage: _usage, ...rest } = event.data;
      return { ...event, data: rest };
    }
    case "step.failed":
      return { ...event, data: { ...event.data, details: undefined } };
    case "turn.failed":
      return { ...event, data: { ...event.data, details: undefined } };
    case "session.failed":
      return { ...event, data: { ...event.data, details: undefined } };
    case "compaction.requested":
      return { ...event, data: { ...event.data, modelId: FAKE_MODEL_ID, usageInputTokens: null } };
    case "compaction.completed":
      return { ...event, data: { ...event.data, modelId: FAKE_MODEL_ID } };
    case "subagent.called":
      return { ...event, data: { ...event.data, childStreamPath: "", workflowId: "", remote: undefined } };
    case "authorization.required":
      return { ...event, data: { ...event.data, webhookUrl: undefined } };
    case "session.waiting":
      return { ...event, data: { ...event.data, continuationToken: "" } };
    default:
      return event;
  }
}

/** Ghi registry — cap {@link MAX_THREADS}, mỗi thread cap {@link MAX_STORED_EVENTS_PER_THREAD} event. */
function writeRegistry(registry: AiThreadsRegistry): void {
  try {
    const sorted = registry.threads.toSorted((a, b) => b.updatedAt - a.updatedAt);
    const capped = sorted.slice(0, MAX_THREADS).map((thread) => {
      const capped =
        thread.events.length > MAX_STORED_EVENTS_PER_THREAD
          ? thread.events.slice(-MAX_STORED_EVENTS_PER_THREAD)
          : thread.events;
      return { ...thread, events: capped.map(redactSensitiveEventFields) };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ threads: capped, activeThreadId: registry.activeThreadId }));
  } catch {
    // private mode / quota exceeded — bỏ qua, registry chỉ mất khả năng persist qua reload.
  }
}

/** "Cho tôi xem báo cáo hôm nay" → "Cho tôi xem báo cáo hôm nay" (giữ nguyên nếu <= 60 ký tự). */
export function deriveThreadTitle(firstUserText: string): string {
  const trimmed = firstUserText.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

function newEmptyThread(): AiThread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    session: undefined,
    events: [],
    pendingTurn: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load registry lúc khởi tạo `AiThreadsProvider` — LUÔN đảm bảo có ít nhất 1 thread active
 * (tạo mới nếu registry rỗng). Ghi lại ngay để lần load sau khỏi phải tạo lại.
 */
export function loadOrInitThreadRegistry(): AiThreadsRegistry {
  const existing = readRegistry();
  if (existing.threads.length > 0) {
    const activeStillExists = existing.threads.some((thread) => thread.id === existing.activeThreadId);
    return activeStillExists ? existing : { ...existing, activeThreadId: existing.threads[0]?.id };
  }

  const initialThread = newEmptyThread();
  const registry: AiThreadsRegistry = { threads: [initialThread], activeThreadId: initialThread.id };
  writeRegistry(registry);
  return registry;
}

export function createAndPersistThread(registry: AiThreadsRegistry): { thread: AiThread; registry: AiThreadsRegistry } {
  const thread = newEmptyThread();
  const next: AiThreadsRegistry = { threads: [thread, ...registry.threads], activeThreadId: thread.id };
  writeRegistry(next);
  return { thread, registry: next };
}

export function persistThreadRegistry(registry: AiThreadsRegistry): void {
  writeRegistry(registry);
}

export type { AiThreadsRegistry };
