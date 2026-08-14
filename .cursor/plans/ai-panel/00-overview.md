# AI Panel — Trợ lý AI cho Backoffice (00-overview)

> **Nguồn:** Thảo luận thiết kế 12/08/2026 (chat UI panel phải + generative UI + AI SDK).
> **Scope chốt:** 12/08/2026 — Phase 1 read-only Q&A trên reports, backend AI SDK (chưa dùng eve).
> **Feature slug:** `ai-panel` · tuân `.cursor/plans/README.md` (thư mục hoá feature nhiều plan).

Feature này gắn **AI Panel** (chat UI) vào `apps/backoffice` để staff hỏi đáp số liệu vận hành
(báo cáo tài chính, outstanding, draw) ngay trong ngữ cảnh trang đang xem. Panel dock bên phải,
thích ứng 4 tầng viewport, giữ nguyên trạng thái hội thoại khi bật/tắt và khi reload.

## Quyết định kiến trúc đã chốt

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Chat UI components | **AI Elements** (`npx ai-elements@latest`) | Registry shadcn chính thức của Vercel — đã verify registry `@shadcn` KHÔNG có chat components (search "chat" → 78 kết quả toàn `chart-*`). AI Elements cài vào `src/components/ai-elements/` như code của mình, theme tự khớp Tailwind v4 CSS variables. |
| Agent backend | **AI SDK v5+ (`ai` + `@ai-sdk/react`)**, route nội bộ `/api/ai/chat` | Phase 1 chỉ cần Q&A + tool call ngắn. eve (durable sessions, HITL, schedules) để Phase sau — UI giữ nguyên khi nâng cấp, chỉ thay transport/hook. |
| Model | **Vercel AI Gateway** (string model ID) | Trên Vercel authenticate qua OIDC; local dùng `AI_GATEWAY_API_KEY`. Không hardcode provider. |
| Tools gọi use-case | **1 class `UseCase` duy nhất, tool gọi `safeRun()`** — KHÔNG tách class `*InternalUseCase` song song | Theo `app-use-case-layering.mdc` §3.3 sau redesign 14/08/2026: `UseCase.run()` trả raw + throw `AppException`; `safeRun()` trả `AppResult` (không throw) — đúng shape tool cần, lỗi không crash turn. Base class `NextApiUseCase` (bẫy "không bao giờ reject", đã sập thật 2026-08) đã bị XOÁ. |
| Generative UI | **Structured tool output → component registry** (map toolName → React component) | Số liệu tài chính render thẳng từ DTO, model không "vẽ lại bằng lời". Deep-link về trang thật qua URL nuqs. |
| Phím tắt | **`⌘I`** (KHÔNG dùng `⌘J` — đã bị `search-dialog.tsx` chiếm) | Tránh conflict. |
| Persist panel state | **Cookie** (open/width) đọc server-side ở layout — theo đúng pattern `sidebar_state` + `getPreference()` hiện có | Anti-flicker khi SSR, đồng nhất với preferences hiện tại. |
| CopilotKit / AG-UI | **KHÔNG dùng** (đánh giá 13/08/2026) | Headless UI (bắt buộc để giữ shadcn-native) là tính năng trả phí Enterprise; bản free `<CopilotChat>` không khớp design system. AI SDK v5 đã có sẵn frontend tools (`onToolCall`+`addToolOutput`) và HITL (`needsApproval`+`addToolApprovalResponse`) — xem p1-01. AG-UI không hỗ trợ eve → chọn nó là rẽ khỏi hướng Vercel-native. Đánh giá lại khi cần: Slack/Teams channel, agent backend ngoài TS (LangGraph…), hoặc shared state đa thiết bị. |
| Multi-channel (Telegram/Slack…) | **eve channels** khi nhu cầu thành thật (P2) — KHÔNG dùng Chat SDK trần, KHÔNG CopilotKit Channels | eve có first-class `telegramChannel`/`slackChannel` + `chatSdkChannel` bridge mọi adapter Chat SDK + durable session/HITL/schedules dùng chung 1 agent definition trên mọi kênh. Chat SDK thuần phải tự quản state/session/approval per-channel. Xem p2-01. |
| **Thiết kế dự phòng multi-channel (áp NGAY từ P0)** | Agent core (tools + system prompt + model) đặt ở `src/ai/` THUẦN — không import gì từ route/Next context | Đây là phần dùng lại 100% khi lên eve (`agent/tools/` import lại từ `src/ai/`). Tool output là DTO không phải markup (web render card, Telegram render text — cùng tool). Tool điều hướng trả `{ href }` để degrade thành deep-link trên bot. |
| Giữ state chat khi toggle | Provider mount cố định ở layout + **React `<Activity>`** (React 19.2 có sẵn) bọc panel body | Đóng/mở panel KHÔNG unmount chat → messages, scroll, input draft giữ nguyên. Reload khôi phục từ sessionStorage. |

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
| --- | --- | --- | --- | --- |
| p0-01-panel-shell | P0 | ⏳ pending | — | Shell + responsive 4 tầng + toggle/persist state. KHÔNG cần backend — làm và test độc lập. |
| p0-02-chat-backend | P0 | ⏳ pending | — | Internal use-cases + `/api/ai/chat` streaming + tools. Song song được với p0-01. |
| p0-03-chat-ui-generative | P0 | ⏳ pending | 01, 02 | AI Elements + conversation/composer + context chip + tool renderers + entry points. |
| p1-01-frontend-tools-hitl | P1 | ⏳ pending | 03 | Agent điều khiển UI (mở trang/set filter qua nuqs URL) + HITL `needsApproval` cho tool nhạy cảm. |
| p2-01-eve-channels | P2 | ⏳ pending | p1-01 + trigger thật | Migrate backend sang eve (`withEve()`) + Telegram channel (allowlist staff) + schedules proactive. Chỉ khởi động khi có nhu cầu kênh ngoài web THẬT. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
p0-01 (shell, độc lập) ──┐
                         ├──► p0-03 (chat UI) ──► p1-01 (frontend tools + HITL) ──► p2-01 (eve + channels)
p0-02 (backend, độc lập) ┘
```

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **KHÔNG tự sinh pattern mới** — mỗi plan có mục "Pattern tham chiếu" trỏ file mẫu hiện hữu.
2. **Composition pattern** — `AiPanelProvider` là nơi DUY NHẤT biết state management (useChat);
   UI components chỉ consume context interface `{state, actions, meta}`. Sau này swap sang
   eve (`useEveAgent`) chỉ đổi provider, không đổi UI.
3. **Layering** — tool KHÔNG chạm repo/DB; chỉ gọi `UseCase.safeRun()` của package
   (`app-use-case-layering.mdc` §3). Route `/api/ai/chat` qua `withApi().auth()` như mọi route khác.
4. **KHÔNG tạo/ghi file `.env*`** — env mới chỉ thêm vào `src/env.ts` + `.env.example`
   (`no-env-file-modification.mdc`).
5. **Const object `as const`** cho mọi tập giá trị đóng (panel mode, tool names…) — không string trần.
6. **Verify** mỗi plan: `pnpm --filter @megawin/backoffice check-types` + `biome check <paths>` trước khi done.

## Định nghĩa "Done" cho toàn feature P0

- Panel bật/tắt bằng nút header + `⌘I` + command palette; trạng thái open/width persist qua cookie,
  reload không flicker.
- Responsive đúng 4 tầng (xem p0-01 §3): docked ≥1600px; docked + auto-collapse sidebar trái
  1024–1600px; overlay non-modal 768–1024px; drawer <768px. Quyết định docked/overlay theo
  **content min-width**, không breakpoint cứng.
- Đóng panel rồi mở lại: messages + scroll position + input draft còn nguyên (Activity).
  Reload trang: hội thoại khôi phục từ sessionStorage.
- Staff hỏi "doanh thu tuần này" → agent gọi tool → render `DailyReportCard` với số thật từ DTO
  + nút deep-link "Mở trong báo cáo →" trỏ `/reports/settle?from=...&to=...`.
- Chỉ `CompanyRole.Staff` trở lên gọi được `/api/ai/chat` (401/403 đúng chuẩn envelope hiện có).
- `pnpm --filter @megawin/backoffice check-types` + lint pass.

## Ngoài scope P0/P1 (ghi nhận, không làm)

- eve migration + Telegram/Slack channels — đã có plan dự phòng **p2-01**; chỉ khởi động khi có
  trigger thật (staff yêu cầu dùng qua bot / cần proactive alert ngoài web).
- CopilotKit / AG-UI — đã đánh giá và loại (xem bảng quyết định); mở lại chỉ khi có 1 trong 3 trigger ghi ở đó.
- Chat SDK (`chat` npm) TRẦN — không dùng trực tiếp; nếu cần adapter kênh lạ, đi qua `chatSdkChannel` của eve (p2-01).
- Audit log tool calls qua `@megawin/audit` — bắt buộc trong p2-01 (bot ngoài web) và trước khi có tool GHI dữ liệu thật.
- Rate limiting per-user cho `/api/ai/chat` — P2.
- Container queries cho content area (cards tự wrap khi panel bóp) — P2, nice-to-have.
- Tool ghi dữ liệu nghiệp vụ (duyệt rút, sửa config…) — mọi tool P0/P1 đều read-only hoặc chỉ điều hướng UI.
