# p2-01 — eve Migration & Multi-Channel: Telegram/Slack, durable sessions, proactive

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md`
> **Phụ thuộc:** p1-01 done + **TRIGGER THẬT** (một trong: staff yêu cầu dùng agent qua
> Telegram/Slack; cần proactive alert đẩy ra ngoài web; cần session sống nhiều ngày).
> **KHÔNG khởi động plan này khi chưa có trigger** — đây là plan dự phòng, viết trước để
> P0/P1 giữ đúng các đường ranh giúp migration rẻ.

Chuyển agent backend từ AI SDK route sang **eve** (`withEve()` — cùng project Vercel với
backoffice), thêm channel Telegram (đầu tiên) + Slack (khi cần), schedules proactive.
**Agent core (`src/ai/`) và toàn bộ chat UI giữ nguyên** — đó là lý do p0-02 tách core khỏi route.

## Nghiên cứu đã chốt (13/08/2026)

| Kết luận | Nguồn |
|---|---|
| eve có first-class channels: Slack, Discord, Teams, **Telegram**, Twilio, GitHub, Linear, web/HTTP | [eve.dev/docs/channels/overview](https://eve.dev/docs/channels/overview) |
| Kênh eve không ship first-class → bridge qua `chatSdkChannel` nhận MỌI adapter Vercel Chat SDK (WhatsApp, email/Resend, iMessage…) | [eve.dev/docs/channels/chat-sdk](https://eve.dev/docs/channels/chat-sdk) |
| Telegram channel: verify `X-Telegram-Bot-Api-Secret-Token`, split 4096 ký tự, **HITL = inline keyboard**, proactive `to(telegram, {chatId}).send()` từ schedules | [eve.dev/docs/channels/telegram](https://eve.dev/docs/channels/telegram) |
| Cross-channel handoff: `ctx.to(slack, …)` — webhook sự cố mở thread điều tra Slack | [eve.dev/docs/channels/custom](https://eve.dev/docs/channels/custom) |
| KHÔNG dùng Chat SDK (`chat` npm) trần: tự quản state/session/dedupe per-channel (Redis/PG), tự dựng approval — eve làm hộ toàn bộ trên durable session | So sánh trong hội thoại thiết kế 13/08 |
| Docs bundled trong package là source of truth theo version: `node_modules/eve/docs/README.md` — ĐỌC TRƯỚC khi viết code eve | Skill `eve` |

## 0. GATE — Spike trước khi commit (1–2 ngày, branch riêng)

Ẩn số kỹ thuật lớn nhất: `withEve()` ghi Build Output `services`/`routes` — phải tương thích
`apps/backoffice/vercel.ts` (`@vercel/config/v1`) + pnpm monorepo + Turbopack.

- [ ] `pnpm --filter @megawin/backoffice add eve`; đọc `node_modules/eve/docs/README.md`.
- [ ] `withEve(nextConfig)` vào `next.config.ts`; dev server chạy được, `/eve/v1/*` mount.
- [ ] Agent tối giản: `agent/instructions.md` + 1 tool import từ `src/ai/tools.ts` (kiểm chứng
      seam dùng lại — đây là mục đích chính của spike).
- [ ] Deploy staging: build pass, routes eve hoạt động, `vercel.ts` branch whitelist còn đúng,
      Vercel Workflow + Fluid Compute enabled trên plan hiện tại.
- [ ] **Fail gate** → ghi kết quả vào plan này, giữ nguyên kiến trúc AI SDK, đánh giá lại sau
      (eve còn beta, API đổi nhanh).

## 1. Cấu trúc sau migration

```
apps/backoffice/
├── agent/                          # eve agent definition (MỚI)
│   ├── instructions.md             # port từ src/ai/system-prompt.ts (phần tĩnh)
│   ├── tools/
│   │   └── reports.ts              # THIN: defineTool wrap aiTools từ src/ai/tools.ts
│   ├── channels/
│   │   ├── eve.ts                  # override auth HTTP channel: better-auth session + Staff
│   │   └── telegram.ts             # telegramChannel + allowlist auth (§3)
│   └── schedules/
│       └── daily-report.ts         # proactive 08:00 → to(telegram, …) (§4)
├── src/ai/                         # GIỮ NGUYÊN — core dùng chung (lý do tách ở p0-02)
└── next.config.ts                  # withEve(nextConfig)
```

Nguyên tắc: `agent/tools/*.ts` là adapter mỏng (map `ctx.session` → gọi hàm/tool trong
`src/ai/`) — logic KHÔNG copy sang. Nếu eve `defineTool` không compose trực tiếp AI SDK `tool()`
shape, viết converter một lần trong `agent/tools/_shared.ts` (đọc bundled docs trước, không đoán API).

## 2. Web UI migration (giữ trải nghiệm, đổi transport)

- `AiPanelProvider`: thay `useChat` bằng `useEveAgent` (từ `eve/react`) — đây là NƠI DUY NHẤT
  biết transport (composition contract p0-01 §2.1 phát huy tại đây).
- Viết adapter map eve stream events → message parts shape mà AI Elements/`renderMessage`
  (p0-03 §4–5) đang dùng (~100–200 dòng, một lần). Tool renderers + registry GIỮ NGUYÊN
  (input là DTO, không đổi).
- Persist: thay sessionStorage messages bằng **session cursor** của eve (`sessionId`,
  `streamIndex` — hội thoại durable nằm server); localStorage chỉ giữ cursor + event log render.
- HITL: `agent.respond()` thay `addToolApprovalResponse` — `ConfirmActionCard` giữ nguyên UI.
- Auth: cookie better-auth same-origin tự đi kèm — không wiring thêm; override policy trong
  `agent/channels/eve.ts` gọi logic tương đương `getSession` của `src/lib/api.ts`.

## 3. Telegram channel — AUTH LÀ VIỆC CHÍNH

Dữ liệu tài chính — bot KHÔNG được trả lời người lạ. Thiết kế:

1. **Allowlist mapping** `telegramUserId → accountId` (collection mới `backoffice_channel_links`,
   qua use-case + repo đúng layering; KHÔNG hardcode env).
2. Flow link account: staff mở backoffice → trang cài đặt cá nhân → "Liên kết Telegram" sinh
   one-time code (TTL 10 phút) → staff nhắn `/link <code>` cho bot → map và lưu. Unlink được.
3. Channel auth hook: message từ user chưa link → trả lời đúng 1 câu hướng dẫn link, KHÔNG
   lộ bất kỳ thông tin nào khác. User đã link → resolve role từ account, đính vào session auth.
4. Tool nhận `ctx.session` auth → các tool read-only check role như web.
5. **Frontend tools degrade**: `navigateToReport` trên Telegram trả **deep-link URL đầy đủ**
   vào backoffice (output `{ href }` đã thiết kế sẵn từ p1-01) — bot gửi link, staff mở web.
6. Markdown: default handler Telegram gửi plain text (không `parse_mode`) — format số tiền
   dạng text thuần trong system prompt khi channel là telegram (eve expose channel qua session
   metadata — xác nhận trong bundled docs).
7. Secrets: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` thêm vào `src/env.ts` +
   `.env.example`; đăng ký webhook `https://<domain>/eve/v1/telegram` thủ công (eve không gọi
   `setWebhook` hộ).
8. **Audit log bắt buộc** (`@megawin/audit`): mọi tool call từ channel ngoài web ghi kèm
   accountId + channel + telegramUserId.

## 4. Schedules — proactive (giá trị lớn nhất của channel)

- `agent/schedules/daily-report.ts`: 08:00 hằng ngày → chạy tool tổng hợp hôm qua →
  `to(telegram, { chatId }).send(...)` cho danh sách staff đã link + opt-in.
- Opt-in per-user (field trong `backoffice_channel_links`), KHÔNG broadcast mặc định.
- eve compile schedules → Vercel Cron tự động khi deploy.
- P2+: alert bất thường (tỷ lệ trả thưởng vượt ngưỡng) — cần định nghĩa ngưỡng từ ops config
  trước, không làm vội trong plan này.

## 5. Slack channel (khi có yêu cầu — sau Telegram)

- `agent/channels/slack.ts` + `slackChannel({ botName })`; auth map Slack user ↔ account
  tái dùng flow link §3 (đổi platform id).
- HITL = Slack buttons; tool output có thể nâng lên Block Kit — renderer riêng phía channel
  handler, KHÔNG đụng `src/ai/`.

## 6. Verify

1. Spike gate §0 pass và được ghi kết quả vào plan này trước mọi việc khác.
2. Web: toàn bộ checklist p0-03 §7 + p1-01 §3 chạy lại với transport eve — hành vi tương đương
   (kể cả đóng/mở panel, reload — giờ dựa trên session cursor).
3. Telegram: user lạ nhắn → chỉ nhận hướng dẫn link; staff link → hỏi số liệu → nhận text +
   deep-link đúng; HITL inline keyboard approve/deny hoạt động; trả lời > 4096 ký tự tự split.
4. Schedule chạy đúng giờ trên staging (Vercel Cron), chỉ gửi cho user opt-in.
5. Session sống qua redeploy: chat Telegram giữa chừng → deploy → nhắn tiếp → agent còn context.
6. `vercel agent-runs` xem được trace turn/tool calls trên production.
7. Audit log đầy đủ cho tool call từ Telegram.
