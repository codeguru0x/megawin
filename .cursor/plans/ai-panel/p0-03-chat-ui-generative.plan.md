# p0-03 — Chat UI: AI Elements, context chip, generative UI renderers, entry points

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md`
> **Phụ thuộc:** p0-01 (shell), p0-02 (backend `/api/ai/chat`).

Plan này lắp chat thật vào panel: cài AI Elements, nối `useChat` vào `AiPanelProvider`,
context chip từ nuqs, tool renderers (generative UI), 3 entry points, persist hội thoại qua reload.

## Pattern tham chiếu

| Việc | File mẫu |
|---|---|
| Composition provider `{state, actions, meta}` | `.cursor/skills/vercel-composition-patterns/AGENTS.md` §2.2 |
| Command palette item | `apps/backoffice/src/components/sidebar/search-dialog.tsx` |
| Đọc filter từ URL (nuqs) | `apps/backoffice/src/app/(main)/reports/settle/_lib/use-report-filters.ts` |
| Bảng compact + format tiền | tabs hiện có `.../reports/settle/_lib/tabs/daily-overview.tsx` |
| localStorage version + try-catch | `.cursor/skills/vercel-react-best-practices/AGENTS.md` §4.4 |

## 1. Cài AI Elements

```bash
cd apps/backoffice
npx ai-elements@latest add conversation message response prompt-input tool suggestion loader actions
```

- Components cài vào `src/components/ai-elements/` (theo `components.json` hiện có) — trở thành
  code của repo, chỉnh sửa được.
- Sau khi cài: chạy `biome check --write apps/backoffice/src/components/ai-elements` để format
  theo convention repo (generated code có thể lệch style). Nếu Biome báo lỗi rule trong generated
  code (vd default export) → sửa THẬT theo convention, không `biome-ignore` hàng loạt.
- KHÔNG cài component chưa dùng (`reasoning`, `citation`… để khi cần).

## 2. Nối chat vào provider (sửa `ai-panel-provider.tsx` từ p0-01)

`useChat` (từ `@ai-sdk/react`) sống TRONG provider — provider luôn mounted (p0-01 §4) nên
đóng/mở panel không mất hội thoại. Mở rộng context value:

```typescript
interface AiPanelContextValue {
  state: {
    open: boolean;
    width: number;
    mode: AiPanelMode;
    messages: UIMessage[];          // từ useChat
    status: ChatStatus;             // "ready" | "submitted" | "streaming" | "error"
    error: Error | undefined;
  };
  actions: {
    setOpen: (open: boolean) => void;
    toggle: () => void;
    setWidth: (width: number) => void;
    sendMessage: (text: string) => void;   // tự đính context chip hiện tại (§3)
    stop: () => void;
    clearChat: () => void;                 // reset hội thoại + xoá sessionStorage
  };
  meta: { panelRef: ... };
}
```

- Transport: `DefaultChatTransport({ api: "/api/ai/chat" })` — cookie same-origin tự gửi,
  không config auth thêm.
- `sendMessage` bọc: đọc context hiện tại (§3) → gửi kèm `body: { context }`.

### 2.1. Persist hội thoại qua reload

- Key: `ai_chat:v1` trong `sessionStorage` (theo tab — hội thoại vận hành không nên rò sang
  browser session khác; localStorage chỉ khi có yêu cầu thật).
- Ghi: debounce sau mỗi lần `status` về `ready` (KHÔNG ghi từng chunk streaming).
- Đọc: lazy init `useChat({ messages: loadInitialMessages() })` — hàm load bọc try-catch
  (sessionStorage throw trong private mode), parse fail → `[]`.
- Cap: giữ tối đa 50 messages gần nhất khi ghi (tránh phình storage).
- `clearChat` xoá key.

## 3. Context chip — `context-chip.tsx`

- Đọc `usePathname()` + `useSearchParams()` → build `{ page, filters }`.
- Hiển thị chip trên composer: `📊 Báo cáo tài chính · 06/08 – 12/08` — label map từ pathname
  qua registry nhỏ (`/reports/settle` → "Báo cáo tài chính"; route lạ → hiện pathname).
- Staff bấm ✕ trên chip → tắt đính context cho các message tiếp theo (state local trong provider,
  bật lại khi đổi route).
- **Lưu ý re-render:** component chip subscribe searchParams — tách riêng component nhỏ,
  KHÔNG subscribe trong provider (rule §5.2 defer state reads); provider đọc
  `window.location.search` on-demand lúc `sendMessage`.

## 4. Panel body — composition

```tsx
// ai-panel.tsx body (thay placeholder p0-01)
<div className="flex h-full flex-col">
  <AiPanelHeader />                 {/* title + nút clear chat + nút đóng */}
  <Conversation>                    {/* AI Elements — auto scroll */}
    <ConversationContent>
      {messages.length === 0 ? <AiEmptyState /> : messages.map(renderMessage)}
    </ConversationContent>
  </Conversation>
  <AiComposer />                    {/* ContextChip + PromptInput + trạng thái streaming */}
</div>
```

- `AiEmptyState`: 3–4 `Suggestion` theo trang hiện tại (registry: `/reports/settle` →
  "Tóm tắt tài chính 7 ngày", "Ngày nào tỷ lệ trả thưởng bất thường?", "So sánh doanh thu theo game").
  Route không có gợi ý riêng → bộ gợi ý chung.
- `renderMessage`: text parts → `Response` (markdown); tool parts → §5.
- Streaming: `status === "streaming"` → `Loader` + nút Stop trên composer.
- Error: banner nhỏ trên composer + nút "Thử lại" (regenerate) — không toast (panel tự chứa).

## 5. Generative UI — tool renderers

### 5.1. Registry — `tool-renderers/registry.tsx`

```typescript
import type { ToolUIPart } from "ai";

/** Tên tool — PHẢI khớp key trong aiTools của p0-02. Const object, không string trần. */
export const AiToolName = {
  FinancialDailyOverview: "getFinancialDailyOverview",
  FinancialByGame: "getFinancialByGame",
  SystemOutstanding: "getSystemOutstanding",
} as const;
export type AiToolName = (typeof AiToolName)[keyof typeof AiToolName];

/** Map tool → renderer. Tool không có renderer riêng → fallback AI Elements <Tool> (collapsible JSON). */
export const toolRenderers: Partial<Record<AiToolName, React.ComponentType<{ part: ToolUIPart }>>> = {
  [AiToolName.FinancialDailyOverview]: DailyOverviewToolCard,
  // ...
};
```

Render flow trong `renderMessage`: part type `tool-*` → tra registry theo tool name →
có renderer & `state === "output-available"` → render card; các state khác
(`input-streaming`/`input-available`/`output-error`) hoặc không có renderer → AI Elements
`<Tool>` mặc định (collapsible, hiện input/output/error).

### 5.2. `daily-overview-tool-card.tsx` — renderer đầu tiên (mẫu cho các card sau)

- Input type: import **đúng DTO** `GetDailyOverviewOutput` từ
  `@megawin/game-core-application/use-cases/reports` — KHÔNG khai lại type
  (`code-quality-standards.mdc` §5 tìm-trước-khi-tạo).
- Nội dung: 3–4 số tổng (doanh thu thuần, trả thưởng, lợi nhuận ròng) + bảng compact tối đa
  7 hàng ngày. Format tiền theo helper format hiện dùng ở tabs reports (tìm và tái dùng,
  không viết mới).
- **Deep-link**: nút "Mở trong báo cáo →" build href `/reports/settle?from=...&to=...`
  (khớp param names mà `use-report-filters.ts` định nghĩa — đọc file đó lấy đúng key)
  qua `next/link`.
- Tool error (`{ error }` trong output — contract p0-02 §3.4): render alert nhỏ với message,
  không render bảng.

### 5.3. Nguyên tắc cho mọi renderer sau này

1. Số hiển thị = số từ DTO, không tự tính lại (trừ tổng cột đơn giản).
2. Luôn có deep-link về trang thật khi trang tồn tại.
3. Compact: card không vượt ~320px chiều cao, còn lại để bảng trang chính lo.

## 6. Entry points (hoàn thiện 3 điểm kích hoạt)

1. **Nút header** — đã có từ p0-01 (`AiPanelTrigger`).
2. **`⌘I`** — đã có từ p0-01.
3. **Command palette**: sửa `search-dialog.tsx` — thêm group "AI" với `CommandItem`
   "Hỏi AI về trang này" (icon `Sparkles`): `onSelect` → đóng dialog + `actions.setOpen(true)`.
   SearchDialog nằm trong scope `AiPanelProvider` (cả hai trong `(main)/layout`) → dùng
   `useAiPanel()` trực tiếp.

## 7. Verify

1. `pnpm --filter @megawin/backoffice check-types` + `biome check` các paths đã sửa.
2. Flow end-to-end trên dev: mở panel → suggestion → agent stream → tool card render số
   **khớp với bảng trang `/reports/settle` cùng filter** (đối chiếu bằng mắt từng số).
3. Deep-link từ card → trang mở đúng date range.
4. Persist: chat vài câu → reload → hội thoại còn; đóng/mở panel → còn; clear chat → sạch + storage sạch.
5. Context chip: đổi route → chip đổi; tắt chip → request không kèm context (check Network tab).
6. Tool lỗi (giả lập range sai) → card hiện lỗi có kiểm soát, agent diễn giải, turn không crash.
7. Responsive spot-check lại 1024px + 390px với chat thật (bảng trong card không tràn panel).
