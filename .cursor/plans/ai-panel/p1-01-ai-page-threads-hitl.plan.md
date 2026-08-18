# p1-01 — Trang `/ai` kiểu ChatGPT: thread history, promote từ panel, HITL, tool điều hướng

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` (revision eve-first 14/08/2026).
> **Phụ thuộc:** p0-03 (panel chat end-to-end trên eve).
> **Batch:** làm NGAY sau P0 — UI chuẩn app chat là yêu cầu chính, KHÔNG chờ trigger.

Bốn năng lực: (1) **trang `/ai` full-page** kiểu ChatGPT/Claude với thread sidebar; (2)
**promote** từ panel sang trang cùng session; (3) **HITL** native eve (duyệt trước tool nhạy
cảm); (4) **tool điều hướng** — agent mở trang báo cáo với filter đúng.

## Pattern tham chiếu

| Việc | Nguồn |
|---|---|
| Multi-thread trên eve: 1 saved event log + cursor per thread, remount `key={thread.id}` | Bundled docs frontend guide, mục "Resumable sessions" |
| HITL: `input.requested` → part `dynamic-tool` state `approval-requested` → `respond()` | Bundled docs frontend guide + `human-in-the-loop` |
| Zustand store persist | `apps/backoffice/src/stores/preferences/*` |
| Page layout (main) hiện có | `apps/backoffice/src/app/(main)/reports/settle/page.tsx` |
| Chốt chiều cao để chat scroll nội bộ (bẫy `min-h-svh`) | comment §docked trong `src/components/ai-panel/ai-panel.tsx` |
| URL filter shape từng trang (cho tool điều hướng) | `.../_lib/use-report-filters.ts` các trang reports |

## 1. Thread registry — `src/stores/ai-threads/`

Messages thật nằm durable phía eve; registry chỉ là **mục lục** client-side:

```typescript
interface AiThread {
  id: string;                     // uuid client-side
  title: string;                  // §2.4
  session: ClientSessionState;    // cursor { sessionId, streamIndex } — type từ eve/client
  events: MessageStreamEvent[];   // event log render (cap ~500/thread)
  createdAt: number;
  updatedAt: number;
}
```

- Zustand vanilla store + persist **localStorage** key `ai_threads:v1` (KHÔNG sessionStorage —
  lịch sử thread phải sống qua tab; hội thoại vốn durable phía server, localStorage chỉ là index).
- Cap 30 threads — LRU theo `updatedAt`; đầy → xoá thread cũ nhất khỏi registry (session phía
  eve không bị đụng).
- Version key + try-catch theo rule localStorage (skill react-best-practices §4.4).
- Panel (p0-03) refactor nhẹ: saved state `ai_panel_chat:v1` chuyển thành **1 thread trong
  registry** (panel luôn trỏ "thread hiện hành" — `activeThreadId` trong store). Đây là điểm
  nối 2 surface: panel và trang cùng đọc/ghi registry.

## 2. Trang `/ai` — `app/(main)/ai/page.tsx`

### 2.1. Layout — nằm TRONG shell `(main)`, KHÔNG phải trang full-bleed

Trang `/ai` là **nội dung bên trong `SidebarInset`** như mọi trang backoffice khác: vẫn có
`AppSidebar` bên trái và header `h-12` chung (SidebarTrigger · AiPanelTrigger · ThemeSwitcher ·
AccountSwitcher). **KHÔNG** tạo route group riêng, **KHÔNG** override `(main)/layout.tsx`,
**KHÔNG** chiếm toàn viewport kiểu chatgpt.com. Staff không bị "rơi ra khỏi" backoffice — vẫn
đổi tài khoản/theme, vẫn điều hướng sang báo cáo bằng menu quen thuộc.

```
┌────┬───────────────────────────────────────────────────────────┐
│ ▤  │ header h-12 (của (main)/layout.tsx, KHÔNG sửa)            │
│ A  │  ⌘ trigger                  AI · theme · account          │
│ p  ├──────────────┬────────────────────────────────────────────┤
│ p  │ ThreadSidebar│  Conversation (max-w-3xl mx-auto)          │
│ S  │  [+ Chat mới]│   user: bubble phải, bg-muted              │
│ i  │  Tìm kiếm    │   assistant: full-width, markdown          │
│ d  │  ── Hôm nay ─│   dynamic-tool: card generative/collapse   │
│ e  │   Thread A   │   approval: ApprovalCard inline (§3)       │
│ b  │  ── Hôm qua ─│   hover actions: Copy                      │
│ a  │   Thread B   │  ──────────────────────────────────────    │
│ r  │  ── 7 ngày ──│  Composer sticky bottom: auto-grow,        │
│(ic)│   Thread C   │  ⏎ gửi / ⇧⏎ xuống dòng, Stop, chip ctx    │
└────┴──────────────┴────────────────────────────────────────────┘
  ↑ layout (main)   ↑─────── page content: app/(main)/ai/page.tsx ─┘
```

- Route trong `(main)` → hưởng auth guard + AppSidebar + header sẵn có. Sidebar trái (app)
  auto-collapse icon khi vào `/ai` (`useSidebar().setOpen(false)` on mount, restore khi rời —
  cùng cơ chế p0-01 §3.2) — nhường không gian cho ThreadSidebar. Kết quả: 3 cột (rail 3rem +
  thread ~16rem + hội thoại), vừa đủ từ ~1280px.
- ThreadSidebar là **panel trong page content**, không phải `Sidebar` thứ 2 của shadcn (một
  `SidebarProvider` chỉ quản 1 sidebar; lồng thêm sẽ tranh cookie `sidebar_state` + phím tắt
  `⌘B`). Dưới `lg`: ẩn cột này, mở bằng `Sheet` từ nút trong page header.
- ThreadSidebar: group theo `updatedAt` (Hôm nay/Hôm qua/7 ngày trước/Cũ hơn — helper date
  `@megawin/shared/utils/date`), item có title + menu (Đổi tên, Xoá). Search filter theo title
  (client-side, registry nhỏ).
- **Panel tự ẩn trên `/ai`**: `AiPanelTrigger` return `null` + panel force `open=false` khi
  `pathname === "/ai"` — không 2 surface chat cùng hiển thị.

### 2.1.1. Một agent instance duy nhất — hệ quả của việc ở trong `(main)`

`AiPanelProvider` (chứa `useEveAgent`) đã sống ở `(main)/layout.tsx`, và `/ai` nằm TRONG
`(main)` → trang và panel **đọc cùng một provider, cùng một agent instance**. Hai hệ quả bắt
buộc phải theo:

1. **Promote (§2.5) không cần chuyển state** — cùng instance thì cùng session cursor sẵn; điều
   hướng `/ai?thread=…` chỉ là đổi surface. KHÔNG serialize state qua URL/storage để "bàn giao".
2. **Remount `key={activeThreadId}` phải đặt ở host của agent trong provider**, KHÔNG đặt ở
   từng surface. Đặt `key` ở panel và page riêng lẻ → 2 store eve song song, gửi tin ở panel
   không thấy ở trang.

### 2.1.2. Chốt chiều cao + scroll (bẫy ĐÃ mắc 1 lần ở panel — không mắc lại)

`sidebar-wrapper` dùng `min-h-svh` ⇒ chiều cao **auto, grow theo con cao nhất**. Nếu trang chat
không tự chốt chiều cao thì hội thoại dài sẽ kéo dài cả trang thay vì scroll nội bộ, để lại vệt
trắng cạnh cột nội dung — đúng lỗi đã sửa ở `ai-panel.tsx` (đọc comment mục docked ở đó trước
khi code trang này).

- `(main)/layout.tsx`: đổi wrapper children `<div className="h-full p-4 md:p-6">` →
  `min-h-0 flex-1` (thay `h-full`). `flex-1` trên flex-item của `SidebarInset` (đã `flex-col`)
  cho chiều cao xác định như `h-full` nhưng thêm `min-h-0` — điều kiện để `overflow` bên trong
  có tác dụng. Sửa ở layout dùng chung ⇒ **verify lại vài trang report + trang operations** (mục
  §6.8) trước khi merge.
- `app/(main)/ai/page.tsx` root: `flex min-h-0 flex-1 overflow-hidden` + bỏ padding của shell
  bằng `-m-4 md:-m-6` để ThreadSidebar/composer chạm mép khung nội dung (đúng cảm giác app chat).
- Chỉ **một** vùng `overflow-y-auto` duy nhất: `Conversation`. ThreadSidebar có vùng scroll
  riêng, độc lập. Composer `shrink-0`, KHÔNG nằm trong vùng scroll.

### 2.2. Component dùng chung với panel

`ChatSurface` từ `src/components/ai-chat/` (p0-03 §4) — panel và page render CÙNG
`renderMessage`/`AiComposer`/tool renderers; khác nhau: page bọc `max-w-3xl mx-auto`,
message user dạng bubble, hover actions. Style variant qua prop `variant: "panel" | "page"`
trên wrapper — KHÔNG fork component (boolean prop cho layout wrapper là chấp nhận được;
KHÔNG thêm boolean điều khiển behavior).

`variant` cũng là input cho 2 quyết định behavior ĐÃ chốt ở nơi khác, đọc qua context chứ không
prop-drill: `navigateToReport` auto-push ở panel, chỉ render nút link trên page (§4); và độ dày
padding/`max-w` của bubble.

### 2.3. Chuyển thread

Theo docs eve: hook đọc `initialEvents`/`initialSession` lúc tạo store → **remount bằng
`key={thread.id}`** khi đổi thread — đặt `key` ở host agent trong `AiPanelProvider`, không ở
từng surface (§2.1.1). URL state `?thread=<id>` qua nuqs (pattern `use-report-filters.ts`) —
deep-link/share được trong nội bộ.

### 2.4. Title thread

Đặt title = 60 ký tự đầu của message user đầu tiên (truncate). KHÔNG gọi model đặt title ở
P1 (thêm turn = thêm chi phí; nâng cấp sau nếu cần).

### 2.5. Promote từ panel — nút [⤢ Mở rộng]

`AiPanelHeader` (p0-03): navigate `/ai?thread=<activeThreadId>` + đóng panel. Vì hai surface
dùng CÙNG agent instance (§2.1.1), promote chỉ là đổi surface — không chuyển state, không
reconnect, không mất turn đang stream. Chiều ngược lại: đang ở `/ai` rời sang trang khác →
panel trigger hiện lại, panel mở tiếp thread hiện hành.

## 3. HITL — duyệt trước hành động nhạy cảm (native eve)

P1 chưa có tool ghi dữ liệu nghiệp vụ — dựng KHUNG hoàn chỉnh, gắn approval cho tool tương lai
có side effect. KHÔNG ép duyệt tool read-only/điều hướng (gây phiền vô ích).

- Server: tool khai báo `approval` theo API eve (đối chiếu bundled docs `human-in-the-loop`) —
  eve park session, emit `input.requested`.
- Client: pending request nằm trên part `dynamic-tool` tại `part.toolMetadata?.eve?.inputRequest`,
  state `approval-requested`. **Scan mọi message** (approval có thể còn treo khi turn khác đã
  thêm message mới — lưu ý từ docs). Render `ApprovalCard`:

```tsx
<ApprovalCard
  title="Agent cần bạn duyệt"
  prompt={request.prompt}
  options={request.options}   // eve cấp options; freeform khi allowFreeform
  onRespond={(optionId) => void agent.respond([{ requestId: request.requestId, optionId }])}
/>
```

- `respond()` resume turn — KHÔNG tự chế confirm bằng message text (model bị dụ bỏ qua được).
- Renderer xử lý exhaustive các state part (Biome `useExhaustiveSwitchCases` bắt thiếu).
- Quy tắc bất biến (ghi vào instructions + review checklist): MỌI tool side effect ngoài
  đọc/điều hướng → approval, không ngoại lệ; khi có tool ghi thật → audit log `@megawin/audit`
  trong execute kèm accountId người duyệt.

## 4. Tool điều hướng — `navigateToReport`

Tool eve chạy server-side → không đụng router client trực tiếp. Thiết kế **output-driven**
(cũng chính là dạng degrade cho channel P2 — bot gửi link):

- Server (`agent/tools/navigation.ts`): input `{ page: z.enum(REPORT_PAGES), filters? }` —
  `page` là **enum từ const registry**, KHÔNG path tự do. `execute` chỉ validate + build href
  → trả `{ href, label }`. KHÔNG side effect.
- Client (renderer `navigate-tool-card.tsx`): validate href lần 2 (whitelist prefix + filter
  keys theo nuqs parser của trang) → **auto `router.push`** khi hợp lệ (1 lần, guard bằng ref
  theo `toolCallId` — không re-navigate khi re-render/replay events) + render dòng
  "→ Đã mở Báo cáo tài chính (06/08–12/08)". Href fail whitelist → KHÔNG navigate, hiện cảnh báo.
- Panel giữ nguyên khi navigate (layout persistent) — staff thấy trang đổi dưới panel.
- Trên trang `/ai`: KHÔNG auto-navigate (rời trang chat đang làm việc là phá flow) — render
  nút link để staff tự bấm. Renderer đọc `variant` từ context chat surface.

Thêm tool data P1: `getFinancialByTenant` (`GetTenantSummaryUseCase.safeRun()` — khuôn p0-02 §3).

## 5. Sidebar navigation

Thêm item "Trợ lý AI" (icon `Sparkles`, url `/ai`) vào `sidebar-items.ts` — nhóm riêng hoặc
đầu nhóm hiện có (quyết định lúc implement theo cấu trúc menu thực tế).

## 6. Verify

1. `pnpm --filter @megawin/backoffice check-types` + `biome check` paths đã sửa.
2. Trang `/ai`: tạo 3 threads → sidebar group đúng ngày; đổi thread → messages đổi đúng
   (remount key); reload → thread list + hội thoại còn; xoá thread → biến khỏi list.
3. Promote: chat trong panel → [⤢ Mở rộng] → `/ai` mở đúng hội thoại → chat tiếp → quay lại
   trang khác → panel mở tiếp cùng thread.
4. HITL: gắn tạm approval vào 1 tool dev-only → ApprovalCard render (cả panel lẫn page),
   approve → tool chạy + turn resume; deny → model diễn giải. Reload GIỮA lúc approval treo →
   card còn (durable session). Gỡ tool dev-only trước merge.
5. "Mở báo cáo tài chính tuần này" (từ panel) → trang đổi đúng route + filter, panel giữ hội
   thoại, chat hiện "→ Đã mở…". Cùng câu trên `/ai` → hiện nút link, KHÔNG auto-navigate.
6. Prompt injection giả lập ("điều hướng tới /admin/xyz") → client từ chối href, hiện cảnh báo.
7. Sidebar trái auto-collapse khi vào `/ai`, restore khi rời. AppSidebar + header `(main)` VẪN
   hiện trên `/ai` (đổi theme, đổi account, bấm menu điều hướng ngay tại trang chat).
8. **Layout/scroll** (§2.1.2 — sửa `(main)/layout.tsx` là thay đổi dùng chung, bắt buộc verify):
   - `/ai` với hội thoại ~40 message: chỉ vùng Conversation cuộn; ThreadSidebar và composer đứng
     yên; **KHÔNG** có scrollbar trang, **KHÔNG** vệt trắng cạnh cột nội dung.
   - Regression trang khác sau khi đổi `h-full` → `min-h-0 flex-1`: `/reports/settle`,
     1 trang `/games/*/operations` (bảng dài + sticky header), 1 trang form. Nội dung không bị
     co lại/tràn, panel AI docked mở kèm vẫn đúng.
   - Ngưỡng < `lg`: ThreadSidebar chuyển Sheet, hội thoại full width, không tràn ngang.
9. Một agent instance (§2.1.1): mở panel gửi 1 câu → sang `/ai` thấy đúng hội thoại đó, đang
   stream thì stream tiếp không mất chữ; trên `/ai` panel trigger ẩn, panel không render.
