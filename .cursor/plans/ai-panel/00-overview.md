# AI Panel — Trợ lý AI cho Backoffice (00-overview)

> **Nguồn:** Thảo luận thiết kế 12–14/08/2026.
> **REVISION LỚN 14/08/2026:** đổi nền tảng từ "AI SDK P0 → eve P2" sang **eve NGAY TỪ P0**
> (deploy Vercel managed) + **UI 2-surface** (panel + trang `/ai` kiểu ChatGPT). Lý do ở bảng dưới.
> **Feature slug:** `ai-panel` · tuân `.cursor/plans/README.md` (thư mục hoá feature nhiều plan).

Feature này gắn trợ lý AI vào `apps/backoffice` cho staff hỏi đáp số liệu vận hành và thao tác
nhanh trên trang. Hai surface, MỘT engine:

- **Surface A — Docked panel** (phải, p0-01): hỏi nhanh trong ngữ cảnh trang đang xem — context
  chip từ nuqs, suggestion theo trang, generative cards, composer gọn.
- **Surface B — Trang `/ai`** (p1-01): full-page kiểu ChatGPT/Claude — thread sidebar (lịch sử
  hội thoại), conversation centered, HITL card, dành cho phiên làm việc dài.
- Nút **[⤢ Mở rộng]** trên panel promote sang `/ai?thread=<id>` — CÙNG durable session, hội thoại
  liền mạch (khả thi vì session sống server-side trong eve, không phải client state).

## Quyết định kiến trúc đã chốt

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Agent backend | **eve NGAY TỪ P0** — `withEve()` mount vào chính project backoffice, deploy Vercel managed | Đảo quyết định cũ (13/08: AI SDK trước, eve P2) vì scope mới yêu cầu chính các thứ eve có sẵn mà AI SDK phải TỰ XÂY: (1) thread history + resume sau reload/redeploy = durable sessions; (2) HITL first-class (`input.requested` → `respond()`, session park chờ duyệt); (3) skills/subagents/evals filesystem; (4) channel Telegram/Slack sau này = thêm 1 file, KHÔNG migration. Đi AI SDK trước thì phần vứt đi khi lên eve là toàn bộ persistence + HITL wiring + transport — đúng cái "mất công sửa sau" cần tránh. |
| Session storage | **Vercel Workflows** (managed, mặc định khi deploy Vercel) | User đã chấp nhận data policy 14/08/2026 (hội thoại + tool output chứa số liệu tài chính nằm trong Vercel storage — backoffice nội bộ, project vốn đã deploy Vercel). Đường lui vẫn mở: eve self-host Nitro + Postgres workflow world (`@workflow/world-postgres`) nếu policy đổi — agent definition portable, chỉ đổi deployment. |
| Rủi ro eve beta | **Chấp nhận có kiểm soát**: pin version, GATE spike ở p0-02 §0 (fail → fallback AI SDK, plan cũ còn trong git history) | eve đang beta, API có thể đổi. Giảm thiểu: UI cách ly sau provider (composition), tools là lớp mỏng trên `UseCase.safeRun()` — 2 lớp này bất biến với backend. |
| Chat UI components | **AI Elements** (`npx ai-elements@latest`) + **adapter cho `EveMessage`** | Registry shadcn chính thức, cài vào repo như code của mình. LƯU Ý: `EveMessage[]` theo convention render của AI SDK `UIMessage` nhưng KHÔNG tráo type được (eve thêm authorization/HITL metadata, file part có thể thiếu url) — viết renderer theo shape part của eve ngay từ đầu, KHÔNG cast. |
| Tools gọi use-case | **`agent/tools/*.ts` gọi `UseCase.safeRun()`** — 1 class UseCase duy nhất (redesign 14/08) | `safeRun()` trả `AppResult` không throw — đúng shape tool cần. Lớp này độc lập hoàn toàn với eve/AI SDK. |
| Context trang | **`prepareSend` + `clientContext`** của `useEveAgent` (built-in) | Thay thiết kế tự chế `body.context` + Zod schema cũ. `clientContext` là ephemeral per-turn — không phình durable history, đúng semantics cần. |
| Generative UI | **Structured tool output → component registry** (map toolName → React component) | Số liệu render thẳng từ DTO, model không "vẽ lại bằng lời". Deep-link về trang thật qua URL nuqs. Tool output là DTO thuần — web render card, Telegram (P2) render text, CÙNG tool. |
| Thread registry | **Zustand persist localStorage** (P1): `{id, title, session cursor, updatedAt}` — messages thật nằm durable phía eve | Registry chỉ là mục lục. Nâng lên Mongo collection khi cần cross-device/search — không phải bây giờ. |
| Phím tắt | **`⌘I`** (KHÔNG `⌘J` — đã bị `search-dialog.tsx` chiếm) | Tránh conflict. |
| Persist panel state | **Cookie** (open/width) đọc server-side ở layout — pattern `sidebar_state` + `getPreference()` hiện có | Anti-flicker SSR. |
| Giữ state chat khi toggle panel | Provider mount cố định ở layout + React `<Activity>` bọc panel body | Đóng/mở KHÔNG unmount → stream đang chạy không đứt. Reload khôi phục bằng **session cursor + event log** (eve resumable sessions) thay vì sessionStorage messages tự chế. |
| CopilotKit / AG-UI | **KHÔNG dùng** (đánh giá 13/08/2026) | Headless UI là tính năng trả phí Enterprise; AG-UI không hỗ trợ eve. Đánh giá lại chỉ khi: agent backend ngoài TS (LangGraph…) hoặc shared-state đa thiết bị phức tạp. |
| Multi-channel | **eve channels** (P2) — thêm file `agent/channels/telegram.ts`, KHÔNG còn khái niệm "migration" | Lợi ích trực tiếp của eve-first: p2-01 thu gọn từ "migration + channels" xuống chỉ còn "channels". |

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
| --- | --- | --- | --- | --- |
| p0-01-panel-shell | P0 | ⏳ pending | — | Shell + responsive 4 tầng + toggle/persist. **Không đổi gì theo revision eve** — vốn transport-agnostic. |
| p0-02-eve-foundation | P0 | ⏳ pending | — | GATE spike `withEve()` → `agent/` (instructions, tools `safeRun()`, channel auth better-auth) → deploy staging. Song song được với p0-01. |
| p0-03-chat-ui-generative | P0 | ⏳ pending | 01, 02 | Panel chat trên `useEveAgent` + AI Elements adapter `EveMessage` + context `prepareSend` + tool renderers + resume qua session cursor. |
| p1-01-ai-page-threads-hitl | P1 | ⏳ pending | 03 | Trang `/ai` full-page kiểu ChatGPT + thread sidebar + promote từ panel + HITL native eve + tool điều hướng. |
| p2-01-channels | P2 | ⏳ pending | p1-01 + trigger thật | Telegram channel (allowlist staff) + schedules proactive + Slack khi cần. Chỉ khởi động khi có nhu cầu kênh ngoài web THẬT. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
━━━ IMPLEMENT NGAY (P0 — batch 1) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
p0-02 §0 GATE spike (0.5–1 ngày, ĐI ĐẦU — fail gate là đổi hướng sớm nhất có thể)
   │ pass
p0-01 (shell, độc lập)  ──┐
p0-02 §1–4 (agent core)  ─┴──► p0-03 (panel chat UI)
━━━ BATCH 2 (ngay sau P0 — UI ChatGPT là yêu cầu chính, KHÔNG chờ trigger) ━━
p0-03 ──► p1-01 (trang /ai + threads + HITL)
━━━ CHỜ TRIGGER THẬT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
p1-01 ──► p2-01 (Telegram/Slack channels + schedules)
```

**Ranh giới batch 1:** p0-01, p0-02, p0-03. Prerequisite backend (redesign use-case
`run()/safeRun()`) **ĐÃ XONG trong codebase** (verify 14/08/2026). Spike gate của p0-02 là việc
ĐẦU TIÊN của toàn feature — nếu fail hard blocker, fallback về kiến trúc AI SDK (bộ plan cũ nằm
trong git history của thư mục này, commit trước revision 14/08).

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **KHÔNG tự sinh pattern mới** — mỗi plan có mục "Pattern tham chiếu" trỏ file mẫu hiện hữu.
2. **Composition pattern** — `AiPanelProvider` là nơi DUY NHẤT biết transport (`useEveAgent`);
   UI components chỉ consume context interface `{state, actions, meta}`. Panel và trang `/ai`
   dùng chung bộ compound components, khác nhau chỉ ở layout wrapper.
3. **Layering** — tool KHÔNG chạm repo/DB; chỉ gọi `UseCase.safeRun()` của package
   (`app-use-case-layering.mdc` §3). Auth channel eve verify better-auth session, fail-closed.
4. **Đọc bundled docs trước khi viết code eve** — `node_modules/eve/docs/README.md` là source
   of truth theo đúng version cài; KHÔNG code eve theo trí nhớ/web (API beta đổi nhanh).
5. **KHÔNG tạo/ghi file `.env*`** — env mới chỉ thêm vào `src/env.ts` + `.env.example`.
6. **Const object `as const`** cho mọi tập giá trị đóng (panel mode, tool names, thread status…).
7. **Verify** mỗi plan: `pnpm --filter @megawin/backoffice check-types` + `biome check <paths>`.

## Định nghĩa "Done" cho toàn feature P0

- GATE spike pass: `withEve()` chạy dev + deploy staging, `/eve/v1/health` OK, 1 turn thật hoàn tất.
- Panel bật/tắt bằng nút header + `⌘I` + command palette; open/width persist cookie, không flicker.
- Responsive đúng 4 tầng (p0-01 §3).
- Staff hỏi "doanh thu tuần này" → agent gọi tool → `DailyReportCard` render số thật từ DTO +
  deep-link `/reports/settle?from=...&to=...`.
- Đóng/mở panel giữa lúc streaming: stream không đứt (Activity). Reload: hội thoại khôi phục
  từ session cursor + event log (eve resumable).
- Chỉ staff đã đăng nhập (better-auth session, role Staff+) gọi được routes `/eve/v1/*` —
  user lạ nhận 401 (channel fail-closed).
- `pnpm --filter @megawin/backoffice check-types` + lint pass.

## Định nghĩa "Done" cho P1 (trang /ai)

- Trang `/ai` đủ chuẩn app chat: thread sidebar nhóm theo ngày, new chat, đổi thread (remount
  `key={thread.id}`), conversation centered max-w-3xl, composer auto-grow, stop, copy.
- Panel → [⤢ Mở rộng] → `/ai?thread=<id>` cùng session, hội thoại liền mạch.
- HITL: tool gắn approval → card Duyệt/Từ chối trong chat (cả panel lẫn trang), `respond()`
  resume turn; từ chối → model diễn giải lại.
- Tool điều hướng: agent mở đúng trang + filter, panel giữ nguyên hội thoại.

## Ngoài scope P0/P1 (ghi nhận, không làm)

- Telegram/Slack channels + schedules proactive — p2-01, chờ trigger thật.
- Self-host eve (Nitro + Postgres workflow world) — chỉ khi data policy đổi; agent definition
  portable nên không cần chuẩn bị gì thêm ngoài việc KHÔNG hardcode phụ thuộc Vercel trong tools.
- Tool ghi dữ liệu nghiệp vụ (duyệt rút, sửa config…) — mọi tool P0/P1 read-only hoặc điều hướng.
  Khi có tool ghi thật: bắt buộc HITL approval + audit log `@megawin/audit` (khung đã có ở p1-01).
- Sandbox/subagents/evals của eve — có sẵn trong framework, dùng khi có nhu cầu thật (evals nên
  cân nhắc sớm ở P1+ khi system prompt bắt đầu phức tạp).
- Thread registry lên Mongo (cross-device/search) — P2.
- Rate limiting per-user — P2.
