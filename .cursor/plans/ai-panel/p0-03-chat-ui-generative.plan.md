# p0-03 — Panel Chat UI: `useEveAgent`, AI Elements adapter, context, generative UI

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` (revision eve-first 14/08/2026).
> **Phụ thuộc:** p0-01 (shell), p0-02 (eve foundation deploy được).

Plan này lắp chat thật vào panel (Surface A): `useEveAgent` trong provider, AI Elements
adapt cho `EveMessage`, context trang qua `prepareSend`, tool renderers, resume qua session
cursor, 3 entry points. **Mọi component message/composer viết DÙNG CHUNG được cho trang `/ai`
(p1-01)** — panel chỉ là layout wrapper đầu tiên.

## Pattern tham chiếu

| Việc | Nguồn |
|---|---|
| Composition provider `{state, actions, meta}` | `.cursor/skills/vercel-composition-patterns/AGENTS.md` §2.2 |
| `useEveAgent` API (data/status/send/respond/stop/reset, prepareSend, resumable sessions) | Bundled docs `node_modules/eve/docs/` guide frontend — ĐỌC bản theo version cài, KHÔNG code theo web |
| Command palette item | `apps/backoffice/src/components/sidebar/search-dialog.tsx` |
| Đọc filter từ URL (nuqs) | `apps/backoffice/src/app/(main)/reports/settle/_lib/use-report-filters.ts` |
| Bảng compact + format tiền | tabs hiện có `.../reports/settle/_lib/tabs/daily-overview.tsx` |
| localStorage version + try-catch | `.cursor/skills/vercel-react-best-practices/AGENTS.md` §4.4 |

## 1. Cài AI Elements + adapter `EveMessage`

```bash
cd apps/backoffice
npx ai-elements@latest add conversation message response prompt-input tool suggestion loader actions
```

- Cài vào `src/components/ai-elements/` — code của repo, chỉnh được. Sau khi cài:
  `biome check --write` thư mục đó; lỗi rule trong generated code → sửa THẬT, không ignore hàng loạt.
- **QUAN TRỌNG:** `EveMessage[]` của eve theo convention render `UIMessage` nhưng KHÔNG
  interchangeable (eve có part `authorization`, HITL metadata `toolMetadata.eve.inputRequest`,
  file part có thể thiếu url). Quy tắc:
  - Component AI Elements **presentational thuần** (Conversation, Response, Loader, PromptInput…)
    dùng nguyên.
  - Component nhận typed message part → viết `renderMessage` của mình theo **shape part của eve**
    (switch theo `part.type`), KHÔNG cast `EveMessage` → `UIMessage`.
- KHÔNG cài component chưa dùng.

## 2. Nối chat vào provider (sửa `ai-panel-provider.tsx` từ p0-01)

`useEveAgent` sống TRONG provider — provider luôn mounted (p0-01 §4) nên đóng/mở panel không
đứt stream. Provider là **nơi DUY NHẤT** biết transport.

```typescript
interface AiPanelContextValue {
  state: {
    open: boolean;
    width: number;
    mode: AiPanelMode;
    messages: EveMessage[];        // agent.data.messages
    status: EveAgentStatus;        // "ready" | "submitted" | "streaming" | "error"
    error: Error | undefined;
    sessionId: string | undefined; // để p1-01 promote sang /ai?thread=<id>
  };
  actions: {
    setOpen: (open: boolean) => void;
    toggle: () => void;
    setWidth: (width: number) => void;
    send: (text: string) => void;      // agent.send — context tự đính qua prepareSend (§3)
    respond: AgentRespondFn;           // HITL (khung sẵn, dùng thật ở p1-01)
    stop: () => void;                  // local detach — turn server vẫn chạy (semantics eve)
    newChat: () => void;               // agent.reset + xoá saved state → session mới
  };
  meta: { panelRef: React.RefObject<HTMLDivElement | null> };
}
```

- Type import từ `eve/react` — đối chiếu tên chính xác trong bundled docs.
- Cookie better-auth same-origin tự gửi — không config auth phía hook.

### 2.1. Resume hội thoại qua reload — session cursor (KHÔNG tự chế persistence)

Theo mẫu "Resumable sessions" trong docs eve:

- Lưu `{ events, session }` (event log + cursor `{sessionId, streamIndex}`) vào
  `sessionStorage` key `ai_panel_chat:v1` trong `onFinish`; bọc try-catch (private mode throw).
- Khởi tạo hook với `initialEvents` + `initialSession` từ saved state (lazy init `useState(() => ...)`).
- Event có `meta.id` ổn định — store tự dedupe khi saved log overlap replay, không cần tự lo.
- `newChat`: `agent.reset()` + xoá key. Cap event log ~500 events khi ghi (tránh phình storage;
  hội thoại thật vẫn nguyên vẹn phía server — mở lại bằng cursor).
- Hội thoại KHÔNG mất khi vượt cap hay xoá storage — durable phía eve; sessionStorage chỉ là
  cache render + cursor.

## 3. Context trang — `prepareSend` (built-in, thay thiết kế context tự chế cũ)

```typescript
const agent = useEveAgent({
  prepareSend: (input) => ({
    ...input,
    // Ephemeral per-turn — KHÔNG vào durable history. Đọc on-demand, KHÔNG subscribe
    // searchParams trong provider (rule §5.2 defer state reads).
    clientContext: contextEnabledRef.current
      ? { route: window.location.pathname, filters: parseSearch(window.location.search) }
      : undefined,
  }),
});
```

- **Context chip** trên composer: `📊 Báo cáo tài chính · 06/08 – 12/08` — label map pathname qua
  const registry (`/reports/settle` → "Báo cáo tài chính"; route lạ → hiện pathname). Chip là
  component nhỏ riêng subscribe `usePathname()`/`useSearchParams()` — provider KHÔNG subscribe.
- Bấm ✕ trên chip → tắt đính context các turn sau (ref trong provider; bật lại khi đổi route).

## 4. Panel body — composition (thay placeholder p0-01)

```tsx
<div className="flex h-full flex-col">
  <AiPanelHeader />                {/* title + [⤢ Mở rộng → /ai, enable ở p1-01] + New chat + Đóng */}
  <Conversation>
    <ConversationContent>
      {messages.length === 0 ? <AiEmptyState /> : messages.map(renderMessage)}
    </ConversationContent>
  </Conversation>
  <AiComposer />                   {/* ContextChip + PromptInput + Stop khi streaming */}
</div>
```

- Các mảnh `AiPanelHeader`/`renderMessage`/`AiComposer`/`AiEmptyState` đặt ở
  `src/components/ai-chat/` (KHÔNG phải `ai-panel/`) — p1-01 trang `/ai` import lại nguyên bộ,
  chỉ khác layout wrapper. Panel-specific (frame, resize, trigger) mới ở `ai-panel/`.
- `AiEmptyState`: 3–4 `Suggestion` theo trang hiện tại (registry: `/reports/settle` →
  "Tóm tắt tài chính 7 ngày", "Ngày nào tỷ lệ trả thưởng bất thường?", "So sánh doanh thu theo
  game"); route lạ → bộ gợi ý chung.
- `renderMessage` — switch theo `part.type` của eve (exhaustive, Biome bắt thiếu case):
  - `text` → `Response` (markdown).
  - `reasoning` → collapse nhỏ (nếu model trả).
  - `dynamic-tool` → §5 (registry renderer; state `approval-requested` → placeholder card,
    hoàn thiện ở p1-01).
  - `authorization` → card thông báo (hiếm ở P0 — chưa có connection nào).
  - `file` → chỉ render khi có `url` (eve có thể không trả url).
- Streaming: `status === "streaming"` → `Loader` + nút Stop. LƯU Ý semantics: `stop()` chỉ detach
  stream client — turn server vẫn chạy; label là "Ngừng theo dõi" (đúng bản chất), KHÔNG "Dừng
  agent". Cancel turn server-side qua route cancel — để P1 nếu cần thật.
- Error: banner nhỏ trên composer + "Thử lại" — không toast.

## 5. Generative UI — tool renderers

### 5.1. Registry — `src/components/ai-chat/tool-renderers/registry.tsx`

```typescript
/** Tên tool — PHẢI khớp key tools trong agent/tools/ (p0-02 §3). Const object, không string trần. */
export const AiToolName = {
  FinancialDailyOverview: "getFinancialDailyOverview",
  FinancialByGame: "getFinancialByGame",
  SystemOutstanding: "getSystemOutstanding",
} as const;
export type AiToolName = (typeof AiToolName)[keyof typeof AiToolName];

/** Map tool → renderer. Không có renderer riêng → fallback <Tool> (collapsible JSON). */
export const toolRenderers: Partial<Record<AiToolName, React.ComponentType<{ part: EveDynamicToolPart }>>> = {
  [AiToolName.FinancialDailyOverview]: DailyOverviewToolCard,
};
```

Flow: part `dynamic-tool` → tra registry theo tool name → có renderer & output sẵn sàng →
render card; các state khác → AI Elements `<Tool>` mặc định (đối chiếu tên state part chính
xác của eve trong bundled docs — KHÔNG giả định giống AI SDK `output-available`).

### 5.2. `daily-overview-tool-card.tsx` — renderer đầu tiên (mẫu)

- Output của tool là `AppResult<GetDailyOverviewOutput>` (p0-02 §3): import **đúng DTO** từ
  `@megawin/game-core-application/use-cases/reports` — KHÔNG khai lại type. `success: false`
  → alert nhỏ với `error.message`, không render bảng.
- Nội dung: 3–4 số tổng (GGR, trả thưởng, lợi nhuận ròng) + bảng compact ≤7 hàng. Format qua
  helper hiện dùng ở tabs reports (`formatNumber`… — tái dùng, không viết mới).
- **Deep-link**: "Mở trong báo cáo →" build href `/reports/settle?from=...&to=...` (đọc đúng
  param keys từ `use-report-filters.ts`) qua `next/link`.

### 5.3. Nguyên tắc mọi renderer

1. Số hiển thị = số từ DTO, không tự tính lại (trừ tổng cột đơn giản).
2. Luôn có deep-link về trang thật khi trang tồn tại.
3. Compact: card ≤ ~320px cao — chi tiết để trang chính lo.

## 6. Entry points

1. **Nút header** — có từ p0-01 (`AiPanelTrigger`).
2. **`⌘I`** — có từ p0-01.
3. **Command palette**: sửa `search-dialog.tsx` — group "AI", `CommandItem` "Hỏi AI về trang
   này" (icon `Sparkles`): đóng dialog + `actions.setOpen(true)`. SearchDialog trong scope
   `AiPanelProvider` → dùng `useAiPanel()` trực tiếp.

## 7. Verify

1. `pnpm --filter @megawin/backoffice check-types` + `biome check` paths đã sửa.
2. End-to-end dev: mở panel → suggestion → stream → tool card số **khớp bảng `/reports/settle`
   cùng filter** (đối chiếu mắt từng số).
3. Deep-link từ card → trang mở đúng date range.
4. Resume: chat vài câu → reload → hội thoại còn (cursor + events); đóng/mở panel giữa lúc
   streaming → stream tiếp tục không đứt; New chat → session mới + storage sạch.
5. Context: đổi route → chip đổi; tắt chip → turn không kèm clientContext (check Network tab).
6. Tool lỗi (range sai) → card hiện lỗi kiểm soát, model diễn giải, turn không crash.
7. Responsive spot-check 1024px + 390px với chat thật (bảng trong card không tràn panel).
