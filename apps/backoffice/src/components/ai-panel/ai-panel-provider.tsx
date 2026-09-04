"use client";

/**
 * AI Panel — Provider (context {state, actions, meta}).
 *
 * Nơi DUY NHẤT biết cách persist state (cookie, thread registry) và cách nói chuyện với eve
 * (`useEveAgent`). Provider LUÔN mounted ở layout (không unmount theo route) — đây là điều
 * kiện để đóng/mở panel không đứt stream đang chạy.
 *
 * KIẾN TRÚC 2 TẦNG (p1-01 §2.1.1 — "một agent instance duy nhất"): panel VÀ trang `/ai` đọc
 * CÙNG context này, nên khi đổi thread, chỉ tầng NẮM `useEveAgent` (`AgentBridge`) được remount
 * bằng `key={activeThreadId}` — tầng ngoài (`AiPanelProvider`) giữ state UI (open/width/mode,
 * phím tắt) KHÔNG đổi.
 *
 * QUAN TRỌNG — `AgentBridge` là SIBLING của `children`, KHÔNG BỌC `children`. Bug thật gặp lúc
 * verify UI (16/08): bản đầu để `AgentBridge` bọc `{children}` rồi đặt `key` ngay tại đó — đổi
 * thread (bấm "Chat mới") làm React unmount/remount NGUYÊN CÂY `children` (AppSidebar + nội dung
 * trang + AiPanel), vì key nằm trên component cha của chúng. Cây `AppSidebar` có hàng trăm ref
 * composed qua Radix Slot (`SidebarMenuButton`...) — unmount/remount đồng loạt gây crash
 * ("threw undefined") không ổn định. Sửa: `AgentBridge` giờ trả về `null`, chỉ chạy
 * `useEveAgent` rồi ĐẨY state lên `AiPanelProvider` qua callback `onSlice` trong `useEffect`;
 * `AiPanelProvider` gộp state đó với UI state để build `value` cho MỘT `AiPanelContext` DUY
 * NHẤT bọc `children` (không remount). Đổi thread giờ chỉ remount `AgentBridge` (component rỗng,
 * không DOM) — `children` chỉ re-render bình thường theo context mới, không unmount.
 */

import { createContext, type RefObject, use, useCallback, useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { financialDateTodayVN, formatVNDate, formatVNDateTime, VN_TIMEZONE } from "@megawin/shared/utils";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { Client, defaultMessageReducer, isCurrentTurnBoundaryEvent } from "eve/client";
import type { EveMessage, EveMessageData, UseEveAgentHelpers, UseEveAgentStatus } from "eve/react";
import { useEveAgent } from "eve/react";

import { AI_FULL_PAGE_PATH } from "@/config/app-config";
import { collectAiPageContext } from "@/lib/ai-page-context";
import { setClientCookie } from "@/lib/cookie.client";
import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from "@/lib/preferences/ai-panel";
import { useAiThreadsStore, useAiThreadsStoreApi } from "@/stores/ai-threads/ai-threads-provider";
import type { AiThreadsState } from "@/stores/ai-threads/ai-threads-store";
import { deriveThreadTitle, threadNeedsCursorResync } from "@/stores/ai-threads/thread-storage";

import { AiPanelMode, useAiPanelMode } from "./use-ai-panel-mode";

/** Answer pending HITL input requests — khung sẵn ở p0-03, dùng thật ở p1-01. */
type AgentRespondFn = UseEveAgentHelpers<EveMessageData>["respond"];

interface AiPanelContextValue {
  state: {
    open: boolean;
    /** px — chỉ áp dụng docked/overlay; drawer luôn full-height/width riêng. */
    width: number;
    mode: AiPanelMode;
    messages: readonly EveMessage[];
    status: UseEveAgentStatus;
    error: Error | undefined;
    /**
     * Đã bấm Dừng và đang chờ server xác nhận `turn.cancelled`. Optimistic — `cancel()` chỉ
     * trả "accepted" (đã queue), việc dừng thật xác nhận sau trên stream (p0-04 §3.3).
     */
    cancelling: boolean;
    /**
     * Cancel đã quá `STUCK_TIMEOUT_MS` mà turn vẫn chưa kết thúc ⇒ turn kẹt cứng (thường do
     * redelivery loop phía server). UI phải cho user lối ra (bắt đầu chat mới).
     */
    cancelStuck: boolean;
    /** Để p1-01 promote sang `/ai?thread=<id>`. `undefined` khi registry chưa hydrate. */
    activeThreadId: string | undefined;
  };
  actions: {
    setOpen: (open: boolean) => void;
    toggle: () => void;
    /** Clamp về [AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH] + debounce 300ms ghi cookie. */
    setWidth: (width: number) => void;
    /**
     * `agent.send` — mỗi turn tự đính: mốc thời gian VN, route, filter URL, và context runtime
     * do trang đăng ký qua `useAiPageContext` (state không có trên URL).
     */
    send: (text: string) => void;
    respond: AgentRespondFn;
    /**
     * Yêu cầu hủy turn đang chạy phía server (`agent.cancel`) — dừng thật, KHÔNG chỉ
     * detach local. Chỉ có tác dụng khi status là "submitted"/"streaming".
     *
     * Bật `cancelling` ngay lập tức (optimistic) vì `cancel()` chỉ trả "accepted"; nếu 8s sau
     * turn vẫn chưa kết thúc thì `cancelStuck` bật để UI hiện lối thoát.
     */
    stop: () => void;
    /** Tạo thread MỚI trong registry + set active — remount agent qua key (p1-01 §2.4). */
    newChat: () => void;
  };
  meta: {
    panelRef: RefObject<HTMLDivElement | null>;
  };
}

const AiPanelContext = createContext<AiPanelContextValue | null>(null);

const WIDTH_COOKIE_DEBOUNCE_MS = 300;

/**
 * Chờ tối đa 8s cho `turn.cancelled` sau khi bấm Dừng. Quá mốc này coi như turn kẹt cứng và
 * hiện lối thoát "Bắt đầu chat mới" — không để user bấm Dừng vô vọng như bug 16/08.
 */
const CANCEL_STUCK_TIMEOUT_MS = 8000;

/**
 * Nhịp tối thiểu giữa 2 lần mirror `events`/cursor xuống `localStorage` trong lúc stream.
 *
 * `localStorage.setItem` là I/O ĐỒNG BỘ trên main thread và payload là cả event log của thread —
 * ghi mỗi event (một lượt có tool + chart dễ tới hàng trăm event) sẽ giật UI. 400ms giữ được
 * "reload bất kỳ lúc nào cũng chỉ mất ≤1 nhịp" mà không nghẽn. Mốc kết thúc lượt và lúc unmount
 * LUÔN ghi, không qua throttle.
 */
const MIRROR_THROTTLE_MS = 400;

function clampWidth(width: number): number {
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, width));
}

/** "?from=2026-08-06&to=2026-08-12" → { from: "2026-08-06", to: "2026-08-12" }. */
function parseSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

/**
 * Mốc thời gian cấp cho model mỗi turn — TẤT CẢ theo giờ Việt Nam (`Asia/Ho_Chi_Minh`).
 *
 * Bắt buộc phải cấp: không có nó, model tự đi tìm ngày bằng tool khác (trước đây là
 * `bash date +%Y-%m-%d`) — vừa tốn round-trip, vừa trả **UTC** (lệch 1 ngày với staff GMT+7
 * trong khoảng 00:00–07:00 sáng).
 *
 * Vì sao dùng helper của `@megawin/shared/utils` chứ không tự format bằng `Intl`:
 * - Toàn hệ thống (7 game, mọi report) đã chốt `VN_TIMEZONE` là múi giờ nghiệp vụ. Format bằng
 *   múi giờ TRÌNH DUYỆT (bản cũ) là sai ngay khi staff ở múi giờ khác hoặc laptop lệch TZ —
 *   model sẽ hỏi số liệu sai ngày mà không ai biết.
 * - `financialDateTodayVN()` chứa quy tắc nghiệp vụ **ngày tài chính đổi lúc 11:00 VN**, không
 *   thể suy ra từ ngày lịch. Model KHÔNG được tự suy quy tắc này.
 *
 * Ba field khác nhau về mục đích, phải gửi cả ba:
 * | Field | Ví dụ | Model dùng để |
 * |---|---|---|
 * | `now` | `2026-08-16 15:12:44` | Hiểu "đến giờ", "sáng nay", "2 tiếng qua" |
 * | `today` | `2026-08-16` | Mốc ngày **lịch** cho "hôm nay"/"tuần này" |
 * | `financialDate` | `2026-08-16` | Ngày **tài chính** hiện hành (khác `today` khi trước 11:00) |
 */
function vnTimeContext(): { now: string; today: string; financialDate: string; timezone: string } {
  const now = new Date();
  return {
    now: formatVNDateTime(now),
    today: formatVNDate(now),
    financialDate: financialDateTodayVN(),
    timezone: VN_TIMEZONE,
  };
}

/** Gộp text của mọi message role="user" đầu tiên trong `messages` — dùng đặt title thread. */
function firstUserText(messages: readonly EveMessage[]): string | undefined {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) {
    return undefined;
  }
  const text = firstUser.parts
    .filter((part): part is Extract<EveMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  return text === "" ? undefined : text;
}

/** Phần context "sống" theo agent — do `AgentBridge` tính và đẩy lên `AiPanelProvider`. */
interface AgentSlice {
  activeThreadId: string;
  messages: readonly EveMessage[];
  status: UseEveAgentStatus;
  error: Error | undefined;
  cancelling: boolean;
  cancelStuck: boolean;
  send: (text: string) => void;
  respond: AgentRespondFn;
  stop: () => void;
  newChat: () => void;
}

interface AgentBridgeProps {
  threadId: string;
  /** Gọi trong `useEffect` mỗi khi slice thay đổi — KHÔNG gọi trong lúc render. */
  onSlice: (slice: AgentSlice) => void;
}

/** Seed cấp cho `useEveAgent` lúc mount — đã được `AgentBridge` xác thực là cursor đáng tin. */
interface AgentSeed {
  events: readonly MessageStreamEvent[];
  session: ClientSessionState | undefined;
}

interface AgentSessionProps extends AgentBridgeProps {
  seed: AgentSeed;
}

/**
 * Dựng message từ event log đã lưu, KHÔNG cần eve session.
 *
 * Dùng cho khoảng `AgentBridge` đang resync cursor: hội thoại vẫn hiện đầy đủ thay vì trắng bảng,
 * chỉ tạm chưa gửi được. Dùng đúng reducer eve dùng nội bộ nên projection khớp 1:1 với lúc agent đã
 * mount — không phát sinh nhánh render thứ hai phải bảo trì song song.
 */
function projectStoredMessages(events: readonly MessageStreamEvent[]): readonly EveMessage[] {
  const reducer = defaultMessageReducer();
  const data = events.reduce<EveMessageData>((acc, event) => reducer.reduce(acc, event), reducer.initial());
  return data.messages;
}

/**
 * Tầng GATE — đảm bảo cursor cấp cho eve là ĐÚNG tail của server trước khi cho gửi lượt mới.
 * Remount bằng `key={threadId}` ở component cha (`AiPanelProvider`).
 *
 * BUG THẬT (23/08 — "prompt nhảy lung tung"): gõ prompt mới nhưng bubble hiện câu hỏi CŨ và trợ lý
 * trả lời đúng câu cũ đó. Nguyên nhân: eve mở stream của lượt mới tại `session.streamIndex` do app
 * cấp. Cursor tụt sau tail thật ⇒ server phát lại lượt CŨ; eve gán `message.received` cũ vào chính
 * bubble optimistic vừa tạo (nó chỉ khớp theo "đang có submission chờ", KHÔNG so `turnId`) ⇒ text
 * vừa gõ bị ghi đè. Stream cắt tại mốc lượt cũ nên cursor chỉ nhích 1 lượt ⇒ lệch VĨNH VIỄN, và độ
 * lệch đó được ghi vào `localStorage` nên sống qua reload.
 *
 * KHÔNG thể tự đoán cursor để chữa:
 * - `streamIndex: 0` ⇒ eve cắt ở mốc lượt ĐẦU TIÊN của session, còn lệch nặng hơn.
 * - Suy từ `events.length` ⇒ sai vì log lưu bị cap (xem `thread-storage.ts`).
 * Chỉ server biết tail thật ⇒ hỏi bằng `snapshot()` (trả prefix đầy đủ + cursor đúng ngay sau
 * prefix). Chỉ chạy khi {@link threadNeedsCursorResync} báo nghi vấn, nên đường bình thường (mở
 * app, đổi thread lúc rảnh) KHÔNG tốn thêm request.
 */
function AgentBridge({ threadId, onSlice }: AgentBridgeProps) {
  // Đọc registry NGAY LÚC MOUNT qua store API thô — KHÔNG subscribe. `AgentSession` ghi vào registry
  // liên tục trong lúc stream; subscribe bằng selector sẽ biến mỗi lần tự ghi thành 1 re-render.
  // Remount toàn bộ khi `threadId` đổi (key ở cha) nên "đọc 1 lần lúc mount" == "đọc đúng lúc đổi
  // sang thread mới".
  const threadsApi = useAiThreadsStoreApi();
  const [stored] = useState(() => threadsApi.getState().threads.find((thread) => thread.id === threadId));
  const [seed, setSeed] = useState<AgentSeed | undefined>(() =>
    stored !== undefined && threadNeedsCursorResync(stored)
      ? undefined
      : { events: stored?.events ?? [], session: stored?.session },
  );

  useEffect(() => {
    if (seed !== undefined) {
      return;
    }
    const sessionId = stored?.session?.sessionId;
    if (sessionId === undefined) {
      setSeed({ events: stored?.events ?? [], session: undefined });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        // `host: ""` = same-origin `/eve/v1/...`, đúng mặc định `useEveAgent` đang dùng (không
        // truyền `host`/`agent`) nên đọc cùng session store phía server.
        const session = new Client({ host: "" }).sessions.attach(sessionId);
        const snapshot = await session.snapshot({ signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        // Cursor vừa lấy là của server ⇒ đáng tin, hạ `pendingTurn`. Nhờ vậy thread đang lệch sẵn
        // trong `localStorage` cũng tự lành ngay lần mở đầu tiên, staff không phải "Chat mới".
        threadsApi
          .getState()
          .syncThread(threadId, { events: snapshot.events, session: snapshot.session, pendingTurn: false });
        setSeed({ events: snapshot.events, session: snapshot.session });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        // Resync fail (offline, session đã bị retire) — vẫn phải cho staff chat tiếp. Dùng lại
        // cursor cũ: rủi ro replay còn đó nhưng `pendingTurn` giữ nguyên nên lần mount sau thử lại.
        console.error("[ai-panel] resync cursor eve thất bại", error);
        setSeed({ events: stored?.events ?? [], session: stored?.session });
      }
    })();
    return () => controller.abort();
  }, [seed, stored, threadId, threadsApi]);

  // Đang resync: hội thoại hiện từ log đã lưu nhưng CHẶN gửi (`status: "submitted"` ⇒ composer tự
  // disable) — gửi lúc này là gửi bằng cursor chưa xác thực, đúng thứ gây bug. Cửa sổ này chỉ dài
  // bằng 1 request và chỉ mở khi lượt trước bị ngắt.
  const resolving = seed === undefined;
  useEffect(() => {
    if (!resolving) {
      return;
    }
    onSlice({
      activeThreadId: threadId,
      messages: projectStoredMessages(stored?.events ?? []),
      status: "submitted",
      error: undefined,
      cancelling: false,
      cancelStuck: false,
      send: () => {
        // no-op: đang đồng bộ lại cursor với server — xem JSDoc component.
      },
      respond: async () => {
        // no-op: đang đồng bộ lại cursor với server.
      },
      stop: () => {
        // no-op: không có turn nào của client đang chạy để dừng.
      },
      newChat: () => {
        threadsApi.getState().createThread();
      },
    });
  }, [resolving, onSlice, threadId, stored, threadsApi]);

  if (seed === undefined) {
    return null;
  }
  return <AgentSession onSlice={onSlice} seed={seed} threadId={threadId} />;
}

/**
 * Tầng NẮM `useEveAgent`. Trả về `null` — KHÔNG render `children`; chỉ tồn tại để giữ hook trong 1
 * boundary remount được, state đẩy lên qua `onSlice` (xem JSDoc đầu file mục "QUAN TRỌNG").
 *
 * Mirror `events`/cursor/`pendingTurn` xuống registry LIÊN TỤC trong lúc stream, không chỉ ở
 * `onFinish` như bản trước. Lý do: `onFinish` KHÔNG chạy khi lượt bị ngắt (reload, đổi thread,
 * "Chat mới", HMR) — mà đó chính là lúc cursor tụt lại và sinh bug replay lượt cũ (xem JSDoc
 * `AgentBridge`). Ghi liên tục để lần mount sau biết chính xác log dừng ở đâu.
 */
function AgentSession({ threadId, onSlice, seed }: AgentSessionProps) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelStuck, setCancelStuck] = useState(false);

  const threadsApi = useAiThreadsStoreApi();
  const syncThread = useCallback(
    (patch: Parameters<AiThreadsState["syncThread"]>[1]) => {
      threadsApi.getState().syncThread(threadId, patch);
    },
    [threadsApi, threadId],
  );

  const agent = useEveAgent({
    initialEvents: seed.events,
    initialSession: seed.session,
    prepareSend: (input) => {
      // State trang mà URL KHÔNG mô tả (vd kỳ quay đang xem khi `?drawId=` bị xoá khỏi URL).
      const pageContext = collectAiPageContext();
      return {
        ...input,
        // Ephemeral per-turn — KHÔNG vào durable history. Đọc on-demand qua window.location +
        // store module-level (KHÔNG subscribe usePathname/useSearchParams/state trang trong
        // provider — rule §5.2 defer state reads: provider mounted suốt phiên, subscribe ở đây
        // làm cả cây con re-render mỗi lần đổi URL hoặc đổi kỳ quay).
        clientContext: {
          // Mốc thời gian VN — xem JSDoc `vnTimeContext`.
          ...vnTimeContext(),
          route: window.location.pathname,
          filters: parseSearch(window.location.search),
          // Bỏ hẳn khoá khi không trang nào đăng ký — tránh gửi `{}` rỗng vào prompt.
          ...(pageContext ? { page: pageContext } : {}),
        },
      };
    },
    // eve cấp session cho turn ĐẦU của thread ở đây. Ghi ngay, nếu không thì reload giữa lượt đầu
    // làm mất luôn `sessionId` ⇒ hội thoại mồ côi, không resume được.
    onSessionChange: (session) => {
      syncThread({ session });
    },
    onFinish: (snapshot) => {
      const userText = firstUserText(snapshot.data.messages);
      syncThread({
        events: snapshot.events,
        session: snapshot.session,
        title: userText ? deriveThreadTitle(userText) : undefined,
        pendingTurn: false,
      });
    },
  });

  /**
   * Mirror throttled theo `agent.events` — mỗi event ghi 1 lần là hàng trăm lượt `JSON.stringify` +
   * `localStorage.setItem` ĐỒNG BỘ cho một lượt dài (tool + chart), đủ để giật UI.
   *
   * `pendingTurn` suy từ event cuối: chưa tới mốc kết thúc lượt ⇒ cursor chưa đáng tin. Đúng mốc thì
   * ghi NGAY (bỏ throttle) để chốt trạng thái sạch. Nhánh throttle luôn đặt timer trailing nên event
   * cuối không bao giờ bị bỏ.
   */
  const lastMirrorAtRef = useRef(0);
  const pendingMirrorRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const events = agent.events;
    const lastEvent = events.at(-1);
    if (lastEvent === undefined) {
      return;
    }
    const turnSettled = isCurrentTurnBoundaryEvent(lastEvent);
    const write = () => {
      lastMirrorAtRef.current = Date.now();
      pendingMirrorRef.current = undefined;
      syncThread({ events, session: agent.session, pendingTurn: !turnSettled });
    };
    const elapsed = Date.now() - lastMirrorAtRef.current;
    if (turnSettled || elapsed >= MIRROR_THROTTLE_MS) {
      write();
      return;
    }
    pendingMirrorRef.current = write;
    const timer = setTimeout(write, MIRROR_THROTTLE_MS - elapsed);
    return () => clearTimeout(timer);
  }, [agent.events, agent.session, syncThread]);

  const send = useCallback(
    (text: string) => {
      // Bật `pendingTurn` TRƯỚC khi POST: từ giây này server có thể đã nhận turn và bắt đầu sinh
      // event. Ngắt trong khe đó (reload, đổi thread) mà không có cờ thì log vẫn kết thúc bằng mốc
      // của lượt trước — nhìn như đã sạch, nhưng cursor đã tụt ⇒ lượt sau replay lượt cũ.
      syncThread({ pendingTurn: true });
      void agent.send(text).catch((error: unknown) => {
        console.error("[ai-panel] gửi tin nhắn thất bại", error);
        // Gửi lỗi: KHÔNG hạ cờ. Không phân biệt được "server chưa nhận" với "server đã nhận rồi
        // mới đứt kết nối" — giữ cờ để lần mount sau resync cursor, thà đọc lại prefix stream còn
        // hơn trả lời sai lượt.
      });
    },
    [agent, syncThread],
  );

  const stop = useCallback(() => {
    if (agent.status !== "submitted" && agent.status !== "streaming") {
      return;
    }
    // Optimistic: đổi UI NGAY, không chờ server. `cancel()` chỉ trả "accepted" (đã queue durable);
    // việc dừng thật xác nhận sau bằng `turn.cancelled` trên stream. Không có cờ này thì user bấm
    // Dừng mà UI không đổi gì → bấm liên tục, tưởng nút hỏng (p0-04 §3.3 Bug C).
    setCancelling(true);
    // `cancel()` yêu cầu hủy THẬT phía server — đây là hành vi đúng cho nút "Dừng" trong composer
    // (theo mẫu chính thức trong docs eve), không phải chỉ detach stream client.
    void agent.cancel().catch((error: unknown) => {
      console.error("[ai-panel] hủy turn thất bại", error);
      setCancelling(false); // Cancel fail → cho user bấm lại.
    });
  }, [agent]);

  // Turn thực sự kết thúc (turn.cancelled hoặc hoàn tất bình thường) → dọn cờ cancel.
  useEffect(() => {
    if (agent.status === "ready" || agent.status === "error") {
      setCancelling(false);
      setCancelStuck(false);
    }
  }, [agent.status]);

  // Bấm Dừng mà 8s sau turn vẫn chưa kết thúc ⇒ kẹt cứng. Bật cờ để UI hiện lối thoát.
  useEffect(() => {
    if (!cancelling) {
      return;
    }
    const timer = setTimeout(() => setCancelStuck(true), CANCEL_STUCK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cancelling]);

  /**
   * Unmount giữa lượt (đổi thread, "Chat mới", điều hướng hard, HMR) ⇒ ghi nốt nhịp đang chờ.
   *
   * `detachEveAgentStore` (cleanup của `useEveAgent`) chỉ ngắt stream phía CLIENT — server vẫn chạy
   * tiếp lượt đó, và `onFinish` KHÔNG chạy. Không flush ở đây thì mất nhịp cuối, log lưu lại dừng
   * sớm hơn thực tế.
   *
   * Cleanup chỉ đọc ref nên deps rỗng là đúng — chạy 1 lần lúc unmount.
   */
  useEffect(() => {
    return () => {
      pendingMirrorRef.current?.();
    };
  }, []);

  const createThread = useAiThreadsStore((s) => s.createThread);
  const newChat = useCallback(() => {
    // `createThread` đổi `activeThreadId` trong registry → `AiPanelProvider` re-render với
    // `key` mới → CHÍNH component này remount, tự nhận initialEvents=[] của thread mới.
    createThread();
    setCancelling(false);
    setCancelStuck(false);
  }, [createThread]);

  // Đẩy slice lên `AiPanelProvider` mỗi khi có field đổi — trong `useEffect` (KHÔNG trong lúc
  // render) vì `onSlice` gọi `setState` ở component cha (xem JSDoc đầu file mục "QUAN TRỌNG").
  useEffect(() => {
    onSlice({
      activeThreadId: threadId,
      messages: agent.data.messages,
      status: agent.status,
      error: agent.error,
      cancelling,
      cancelStuck,
      send,
      respond: agent.respond,
      stop,
      newChat,
    });
  }, [
    onSlice,
    threadId,
    agent.data.messages,
    agent.status,
    agent.error,
    cancelling,
    cancelStuck,
    send,
    agent.respond,
    stop,
    newChat,
  ]);

  return null;
}

export function AiPanelProvider({
  children,
  defaultOpen,
  defaultWidth,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
  defaultWidth: number;
}) {
  const [open, setOpenState] = useState(defaultOpen);
  const [width, setWidthState] = useState(defaultWidth);
  const panelRef = useRef<HTMLDivElement>(null);
  const widthCookieTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Giữ giá trị `open` mới nhất cho `toggle` — tránh phải đưa `open` vào dependency của
  // useCallback (sẽ làm toggle đổi reference mỗi lần mở/đóng, kéo theo re-subscribe listener).
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    // Cookie ghi thẳng trên browser (mục 2 phân tích loop, 2026-09) — trước đây gọi
    // `setValueToCookie` (Server Action) ở đây khiến Next.js re-render lại CẢ layout `(main)`
    // trên server mỗi lần mở/đóng panel. Cookie vẫn là cookie thật, request tiếp theo lên
    // server (`layout.tsx` đọc qua `getPreference`) nhận giá trị mới bình thường — chỉ khác
    // chỗ AI VIẾT, không đổi cách server ĐỌC.
    setClientCookie("ai_panel_state", next ? "open" : "closed");
  }, []);

  const toggle = useCallback(() => {
    // KHÔNG gọi side-effect (server action) bên trong updater của setOpenState — React gọi
    // updater trong lúc render, side-effect ở đó gây lỗi "Cannot update a component while
    // rendering a different component". Tính `next` từ ref rồi gọi setOpen (side-effect nằm
    // ngoài render) như một lệnh imperative bình thường.
    const next = !openRef.current;
    setOpen(next);
  }, [setOpen]);

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    clearTimeout(widthCookieTimeoutRef.current);
    widthCookieTimeoutRef.current = setTimeout(() => {
      // Client-side cookie write — cùng lý do như `setOpen` phía trên.
      setClientCookie("ai_panel_width", String(clamped));
    }, WIDTH_COOKIE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => clearTimeout(widthCookieTimeoutRef.current);
  }, []);

  const mode = useAiPanelMode({ panelOpen: open, panelWidth: width });

  // Vào `/ai` (trang chat full-page, p1-01) → tự đóng panel: 2 bề mặt chat cùng hiện là dư
  // thừa, và panel + trang share cùng agent instance nên nội dung y hệt panel nếu cả hai cùng mở.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === AI_FULL_PAGE_PATH && openRef.current) {
      setOpen(false);
    }
  }, [pathname, setOpen]);

  // KHÔNG auto-collapse `AppSidebar` khi vào `/ai` — quyết định 17/08 sau phản hồi thật của staff.
  //
  // Bản trước ép `setAppSidebarOpen(false)` lúc vào `/ai` để nhường chỗ cho danh sách thread. Hai
  // hệ quả xấu đã được xác nhận: (1) `setOpen` của shadcn Sidebar GHI cookie `sidebar_state=false`,
  // nên việc "tạm thu để xem chat" biến thành thu VĨNH VIỄN ở MỌI trang sau khi reload — staff mất
  // điều hướng chính mà không hiểu vì sao; (2) staff mở lại thủ công thì lần điều hướng kế tiếp vào
  // `/ai` lại bị thu, tạo cảm giác "nút bấm không có tác dụng".
  //
  // Không gian cho danh sách thread giải quyết bằng LAYOUT (thread panel sang phải, thu/mở được —
  // xem `app/(main)/ai/page.tsx`), KHÔNG bằng việc điều khiển sidebar app thay staff.

  // ⌘I toggle — combo an toàn, không cần guard theo input/textarea đang focus.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "i" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  // Esc chỉ đóng ở overlay/drawer — docked không phản ứng Esc (không phải modal).
  useEffect(() => {
    if (!open || mode === AiPanelMode.Docked) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, mode, setOpen]);

  const activeThreadId = useAiThreadsStore((s) => s.activeThreadId);
  const threadsHydrated = useAiThreadsStore((s) => s.hydrated);

  // Slice "sống" (messages/status/send/...) do `AgentBridge` đẩy lên qua `onSlice` — xem JSDoc
  // đầu file mục "QUAN TRỌNG". `onSlice` phải ổn định reference (không đưa gì vào dep) để
  // `useEffect` bên trong `AgentBridge` không bị nhắc do đổi identity của callback.
  const [agentSlice, setAgentSlice] = useState<AgentSlice | null>(null);
  const onSlice = useCallback((slice: AgentSlice) => {
    setAgentSlice(slice);
  }, []);

  // Registry chưa hydrate (đọc localStorage trong effect, xem `ai-threads-provider.tsx`) ⇒
  // chưa biết thread nào active. Context vẫn phải tồn tại (children gọi `useAiPanel()` ngay
  // từ render đầu) — cấp state agent "rỗng" tạm thời, KHÔNG mount `useEveAgent` (tránh tạo
  // session cho 1 thread sẽ bị bỏ ngay khi hydrate xong).
  if (!threadsHydrated || activeThreadId === undefined) {
    const placeholder: AiPanelContextValue = {
      state: {
        open,
        width,
        mode,
        messages: [],
        status: "ready",
        error: undefined,
        cancelling: false,
        cancelStuck: false,
        activeThreadId: undefined,
      },
      actions: {
        setOpen,
        toggle,
        setWidth,
        // Placeholder — registry chưa hydrate nên chưa có thread nào để gửi/dừng/trả lời.
        // Composer tự disable trong lúc này (xem `hydrated` ở `chat-panel.tsx`), các hàm này
        // chỉ tồn tại để type của context không phải optional trên toàn bộ children.
        send: () => {
          // no-op: xem comment phía trên.
        },
        respond: async () => {
          // no-op: xem comment phía trên.
        },
        stop: () => {
          // no-op: xem comment phía trên.
        },
        newChat: () => {
          // no-op: xem comment phía trên.
        },
      },
      meta: { panelRef },
    };
    return <AiPanelContext value={placeholder}>{children}</AiPanelContext>;
  }

  // `agentSlice` có thể vẫn thuộc thread CŨ trong khoảng thời gian ngắn giữa lúc
  // `activeThreadId` đổi (đồng bộ, cùng render) và lúc `AgentBridge` MỚI (key mới) chạy xong
  // `useEffect` đầu tiên (bất đồng bộ, sau paint) — so `activeThreadId` để phát hiện lệch, dùng
  // slice "rỗng" tạm cho ĐÚNG thread mới thay vì hiển thị nhầm dữ liệu thread cũ.
  const liveSlice: AgentSlice =
    agentSlice && agentSlice.activeThreadId === activeThreadId
      ? agentSlice
      : {
          activeThreadId,
          messages: [],
          status: "ready",
          error: undefined,
          cancelling: false,
          cancelStuck: false,
          send: () => {
            // no-op: đang chờ AgentBridge của thread mới sẵn sàng.
          },
          respond: async () => {
            // no-op: đang chờ AgentBridge của thread mới sẵn sàng.
          },
          stop: () => {
            // no-op: đang chờ AgentBridge của thread mới sẵn sàng.
          },
          newChat: () => {
            // no-op: đang chờ AgentBridge của thread mới sẵn sàng.
          },
        };

  const contextValue: AiPanelContextValue = {
    state: {
      open,
      width,
      mode,
      messages: liveSlice.messages,
      status: liveSlice.status,
      error: liveSlice.error,
      cancelling: liveSlice.cancelling,
      cancelStuck: liveSlice.cancelStuck,
      activeThreadId: liveSlice.activeThreadId,
    },
    actions: {
      setOpen,
      toggle,
      setWidth,
      send: liveSlice.send,
      respond: liveSlice.respond,
      stop: liveSlice.stop,
      newChat: liveSlice.newChat,
    },
    meta: { panelRef },
  };

  return (
    <AiPanelContext value={contextValue}>
      {/* Sibling của `children`, KHÔNG bọc — remount qua `key` chỉ ảnh hưởng chính nó (trả về
      `null`, không DOM), `children` (AppSidebar + nội dung trang + AiPanel) không unmount. */}
      <AgentBridge key={activeThreadId} onSlice={onSlice} threadId={activeThreadId} />
      {children}
    </AiPanelContext>
  );
}

export function useAiPanel(): AiPanelContextValue {
  const context = use(AiPanelContext);
  if (!context) {
    throw new Error("useAiPanel must be used within an AiPanelProvider");
  }
  return context;
}
