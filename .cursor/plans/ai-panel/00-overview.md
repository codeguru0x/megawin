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
| Tri thức sản phẩm game (p1-02) | **Tài liệu dạy CƠ CHẾ (eve skills, không chứa số) + config cấp SỐ (tool `getGameConfig`)** — KHÔNG nạp `.cursor/rules/*-game-rules.mdc` vào agent | 3 lý do đo được: (1) 7 file `.mdc` = ~145 KB (~36–40k token) → nhồi vào instructions là chi phí đó **mỗi model call**, và system-role nằm ngoài history nên compaction không cắt được; (2) `.mdc` là dev-facing (collection, path, tên class) — staff không cần, ăn token; (3) `.mdc` **cố ý chứa giá trị mặc định tham khảo** ("2 tỷ", "20% revenue") → nạp vào là dạy agent đúng thứ ta đang cấm nó nói. Skill static markdown của eve không cần sandbox (`skills.mdx:12`) nên chi phí luôn-bật chỉ là 8 dòng description. Tài liệu đặt ở `packages/ops-docs` để **một bản, hai người đọc**: staff qua `/guides`, model qua `load_skill` — doc sai thì staff phát hiện, không phải chờ agent trả lời sai mới biết. |

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
| --- | --- | --- | --- | --- |
| p0-01-panel-shell | P0 | ✅ done | — | Shell + responsive 4 tầng + toggle/persist. **Không đổi gì theo revision eve** — vốn transport-agnostic. |
| p0-02-eve-foundation | P0 | ✅ done (local, verify UI thật xong) | — | GATE spike PASS local (`withEve()` boot, `/eve/v1/health` 200, auth fail-closed verify bằng 401). `agent/` core xong: `agent.ts`, `instructions.md`, `channels/eve.ts` (auth better-auth, KHÔNG `localDev()`), 3 tools report (`safeRun()` verify chạy thật với Mongo). Turn thật qua UI browser + session Cognito thật (16/08): tool call đúng, số khớp Mongo, agent tự chặn câu hỏi/tool ngoài phạm vi đúng rule. **CHƯA deploy staging** (§0 mục deploy/session-resume của GATE chưa test — cần Vercel project settings, xem phần "Cấu hình Vercel" bên dưới; không phải blocker cho P1). |
| p0-03-chat-ui-generative | P0 | ✅ done (local, verify UI thật xong) | 01, 02 | Panel chat trên `useEveAgent` + AI Elements adapter `EveMessage` + context `prepareSend` + tool renderers + resume qua session cursor. **Bug phát hiện khi test thật 16/08 → p0-04.** |
| p0-04-sandbox-chat-ux | P0 | ✅ done (verify UI thật xong) | 03 | Sandbox thật (`bash` chạy được, `deny-all` + assertion tự động) + `web_fetch` allowlist (approval `always()` + domain block verify qua UI thật) + fix nút Stop (verify qua UI thật: submitted/streaming/orphaned) + redesign UI ngang tầm ChatGPT/Claude (verify U1-U10 qua UI thật, kể cả dark mode) + render tool 3 tầng + context thời gian VN & state trang + `serializeDates`/`WireType` thay `json-safe.ts` + ẩn nội thất tool khỏi UI staff. Sinh ra từ bug report thật của user 16/08. |
| p1-01-ai-page-threads-hitl | P1 | ⏳ pending | 04 | Trang `/ai` full-page kiểu ChatGPT + thread sidebar + promote từ panel + HITL native eve + tool điều hướng. **Đổi phụ thuộc 03 → 04** để kế thừa UI đã đẹp, không redesign 2 lần. |
| p1-02-game-knowledge-config-truth | P1 | ⏳ pending | 04 (**song song p1-01**) | Tri thức 7 sản phẩm game cho agent: 24 doc staff-facing ở `packages/ops-docs` (dạy CƠ CHẾ, **không chứa số, không chứa tên field**) nạp qua eve skills + tool `getGameConfig`/`getGameJackpot` trả **payload tự giải thích** (`label`/`unit`/`note` đi kèm từng giá trị) làm nguồn số DUY NHẤT. Chặn agent trả lời bằng số mặc định/số Vietlott/số cũ trong hội thoại. Có GATE (§0: doc `.md` vào skill bằng đường nào) + §5.0 giải trình vì sao "1 skill/game" chưa đủ + 3 lớp guard. Sinh từ yêu cầu user 16/08. |
| p1-03-ops-data-visibility | P1 | ⏳ pending | 04 (**song song p1-01/p1-02**) | Phủ dữ liệu vận hành cho Mira: 13 tool đọc mới (2 wave) theo nguyên tắc "tool sinh theo CÂU HỎI staff, không theo route" — draws/ops realtime, settle drill-down, tenant config+report, jackpot history, player, audit, integration health. Kiến trúc 3 tầng (tool mỏng → dispatcher `server/ai/<domain>/` switch 7 game → package use-case), read-only enforce bằng grep guard, ngân sách token đo thật, trigger đo được để mở subagent (p2-02). Sinh từ yêu cầu user 17/08. |
| p1-04-turn-latency | P1 | ⏳ pending | — (**độc lập, trục hạ tầng**) | Lượt trả lời trên Vercel chậm hơn local (user báo 18/08). Plan **đo trước, sửa sau**: 3 GATE (region thật của service eve · cache nóng/lạnh · so local-Vercel cùng điều kiện) rồi mới phân nhánh hành động. Đã loại một hướng bằng số đo: gộp tool call để giảm step là **vô ích** vì trung vị đã là 2 model call/lượt = sàn lý thuyết (§5.1). Đòn bẩy thật nếu cần: 32k prefix bất biến mỗi call. |
| p2-01-channels | P2 | ⏳ pending | p1-01 + **trigger đã có** (user 18/08) | Telegram channel cho staff. Viết lại chi tiết 18/08 (2 đợt) sau khi verify trực tiếp `node_modules/eve/dist/**/*.d.ts` (22 kết luận có file nguồn). **Phạm vi v1**: chat riêng 1-1 = hỏi-đáp · group = **chỉ broadcast một chiều** (`dailyReport` 12:00 VN) · chỉ text · read-only. Trọng tâm dễ bỏ sót: (a) `uploadPolicy: "disabled"` — eve mặc định NHẬN ảnh/PDF 25MB nên "chỉ text" phải tắt tường minh; (b) guard chain fail-closed trong `onMessage`, người lạ **drop im lặng** (`defaultTelegramAuth` của eve là fail-open); (c) **F-20**: nút HITL dispatch với `auth: null` không qua `onMessage` ⇒ trong group ai bấm Approve cũng được, **không vá được từ userland** ⇒ tool nguy hiểm phải `denied` không `ask`, và hỏi-đáp group hoãn sang G4; (d) instructions phải phân biệt kênh — `50-answer-shape.md` nói "hệ thống tự dựng bảng" là SAI trên Telegram. Data: collection `channel_links` ở `packages/identity` (Slack dùng lại), one-time code hash-at-rest trong Redis. **Audit chỉ ghi sự kiện QUYỀN** (link/unlink/linkFailed/revokedByPolicy) — bỏ `agentTurn`, hoạt động hội thoại thuộc `vercel agent-runs`; mỗi lượt chỉ chạm `lastSeenAt`. UI admin (cột "Kết nối" + unlink hộ ở `/accounts/company`) nâng lên **bắt buộc v1**. Proactive DM cá nhân + hỏi-đáp group + Slack đẩy sang gate sau. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
━━━ IMPLEMENT NGAY (P0 — batch 1) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
p0-02 §0 GATE spike (0.5–1 ngày, ĐI ĐẦU — fail gate là đổi hướng sớm nhất có thể)
   │ pass
p0-01 (shell, độc lập)  ──┐
p0-02 §1–4 (agent core)  ─┴──► p0-03 (panel chat UI)  ──► p0-04 (sandbox + Stop + UI đẹp)
━━━ BATCH 2 (ngay sau P0 — UI ChatGPT là yêu cầu chính, KHÔNG chờ trigger) ━━
p0-04 ──┬──► p1-01 (trang /ai + threads + HITL)
        ├──► p1-02 (tri thức 7 game + tool config)   ← song song, giao nhau 2 file
        └──► p1-03 (13 tool dữ liệu vận hành)        ← song song, giao nhau 2 file
━━━ CHỜ TRIGGER THẬT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
p1-01 ──► p2-01 (Telegram/Slack channels + schedules)
p1-03 ──► p2-02 (subagents — chỉ khi 1 trong 3 trigger đo được ở p1-03 §6 kích hoạt)
━━━ ĐỘC LẬP, LÀM ĐƯỢC BẤT KỲ LÚC NÀO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
p1-04 (đo & tối ưu latency lượt trên Vercel — trục hạ tầng, không giao file với p1-01/02/03)
```

**p1-01, p1-02 và p1-03 song song được:** khác trục (p1-01 = UI/transport, p1-02 = tri thức/tool
config, p1-03 = tool dữ liệu vận hành). Cả ba chỉ giao nhau ở 2 file — `agent/instructions.md`
và `tool-renderers/registry.tsx` (`AiToolName` + `AI_TOOL_LABELS`). Ai làm sau rebase, không ai
chờ ai.

**Ranh giới batch 1:** p0-01, p0-02, p0-03, **p0-04**. Prerequisite backend (redesign use-case
`run()/safeRun()`) **ĐÃ XONG trong codebase** (verify 14/08/2026). Spike gate của p0-02 là việc
ĐẦU TIÊN của toàn feature — nếu fail hard blocker, fallback về kiến trúc AI SDK (bộ plan cũ nằm
trong git history của thư mục này, commit trước revision 14/08).

**p0-04 sinh ra 16/08/2026** từ bug report thật khi user test p0-03 trên dev: `bash` treo do sandbox
chưa bootstrap, nút Stop không dừng được, UI chưa đạt chuẩn app chat. p0-04 có GATE riêng (§1.1 —
microsandbox boot được không) vì §1/§2 phụ thuộc sandbox chạy thật; §3 (Stop) độc lập, làm song song
được nếu GATE chờ cài Docker.

**Kết quả p0-04 (16/08, cùng ngày):** GATE pass sau khi đổi base image sang `debian:stable-slim`
(image gốc `ghcr.io/vercel/eve:latest` không tải nổi trên mạng dev — đo 5/5 lần đứt giữa dòng).
Phát hiện ngoài dự kiến: **allowlist network theo domain không được enforce** trên microsandbox
0.6.9 dù log nói ngược lại → chuyển sang `deny-all` và **assert bằng probe trong `bootstrap`**
(p0-04 §1.6). Bài học chung cho mọi plan sau: **policy an ninh phải được đo, không chỉ được khai
báo** — và chỗ đo đúng là `bootstrap` (ngoài turn user, fail-closed).

**Verify UI thật (16/08, browser + session Cognito thật):** cả 3 khoản còn treo đã pass —
(1) nút Stop: `sleep 8s` trong `bash` → click "Dừng tạo câu trả lời" giữa lúc streaming → turn dừng
đúng, composer về idle, không orphan; (2) UI redesign U1-U10 (bubble, reasoning, tool card, copy/
resend, 3-dot menu, panel width, dark mode) — dark mode ban đầu tưởng sai do thumbnail preview của
IDE hiển thị nhầm, verify lại bằng `browser_cdp` đọc computed style + sample pixel PNG thật thì
đúng; (3) `web_fetch` allowlist: approval card hiện đúng `{"url": "..."}` khi `approval-requested`,
sau khi Approve vẫn bị chặn ở tầng `execute` cho domain ngoài allowlist (`example.com`), model tự
diễn giải đúng phạm vi cho phép, không cố lách. Tiện thể verify luôn 2 khoản treo từ p0-02 §5 (turn
thật qua UI + agent tự chặn câu hỏi ngoài phạm vi).

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
- Agent hiểu 7 sản phẩm game: hỏi cách chơi/nội dung đặt cược/điều kiện trúng → load đúng skill game
  và giải thích đúng cơ chế; hỏi bất kỳ con số cấu hình → gọi `getGameConfig`, số khớp DB, kèm mốc
  `version`/`updatedAt`. Hỏi giá trị mà Vietlott có số nổi tiếng trong lúc config test đặt **khác** →
  agent trả số của config (p1-02).

## Ngoài scope P0/P1 (ghi nhận, không làm)

- Telegram/Slack channels + schedules proactive — p2-01, chờ trigger thật.
- Self-host eve (Nitro + Postgres workflow world) — chỉ khi data policy đổi; agent definition
  portable nên không cần chuẩn bị gì thêm ngoài việc KHÔNG hardcode phụ thuộc Vercel trong tools.
- Tool ghi dữ liệu nghiệp vụ (duyệt rút, sửa config…) — mọi tool P0/P1 read-only hoặc điều hướng.
  Khi có tool ghi thật: bắt buộc HITL approval + audit log `@megawin/audit` (khung đã có ở p1-01).
- ~~Sandbox/subagents/evals của eve~~ — **sandbox ĐÃ VÀO SCOPE ở p0-04** (16/08/2026): user cần
  `bash` + `web_fetch` để agent lấy thông tin hữu ích/mới. **Evals ĐÃ VÀO SCOPE ở p1-02 §7.2** (16/08):
  policy "agent không được trả số mặc định/số Vietlott" là loại policy **chỉ đo được bằng eval** — lint
  tài liệu chặn được số trong doc, nhưng không chặn được model tự nhớ số. Subagents vẫn ngoài scope —
  trigger đo được để mở (`p2-02-subagents`) đã định nghĩa ở p1-03 §6 (17/08).
- Audit log cho tool call `bash`/`web_fetch` — ghi nhận ở p0-04 §9, làm khi lên production thật.
- Rate limit số sandbox VM per staff — P2, cùng mục rate limiting bên dưới.
- Thread registry lên Mongo (cross-device/search) — P2.
- Rate limiting per-user — P2.
