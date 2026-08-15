# p2-01 — Multi-Channel: Telegram (đầu tiên) + Slack, schedules proactive

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` (revision eve-first 14/08/2026).
> **Phụ thuộc:** p1-01 done + **TRIGGER THẬT** (một trong: staff yêu cầu dùng agent qua
> Telegram/Slack; cần proactive alert đẩy ra ngoài web). KHÔNG khởi động khi chưa có trigger.
> **Revision 14/08:** eve đã chạy từ P0 → plan này KHÔNG còn phần migration (mục 0–2 cũ đã
> xoá). Thêm channel = thêm file trong `agent/channels/` + auth mapping + schedules.

## Nghiên cứu đã chốt (13/08/2026)

| Kết luận | Nguồn |
|---|---|
| eve first-class channels: Slack, Discord, Teams, **Telegram**, Twilio, GitHub, Linear, web/HTTP | eve.dev/docs/channels/overview |
| Kênh không first-class → bridge `chatSdkChannel` nhận mọi adapter Vercel Chat SDK | eve.dev/docs/channels/chat-sdk |
| Telegram: verify `X-Telegram-Bot-Api-Secret-Token`, split 4096 ký tự, HITL = inline keyboard, proactive `to(telegram, {chatId}).send()` | eve.dev/docs/channels/telegram |
| Cross-channel handoff: `ctx.to(slack, …)` | eve.dev/docs/channels/custom |
| Docs bundled trong package là source of truth theo version: `node_modules/eve/docs/` | Skill `eve` |

## 1. Cấu trúc bổ sung

```
apps/backoffice/agent/
├── channels/
│   ├── eve.ts                  # ĐÃ CÓ từ p0-02 (web HTTP + better-auth)
│   └── telegram.ts             # MỚI — telegramChannel + allowlist auth (§2)
└── schedules/
    └── daily-report.ts         # MỚI — proactive 08:00 (§3)
```

Tools (`agent/tools/`) dùng nguyên — output là DTO (`AppResult<O>`): web render card,
Telegram render text; `navigateToReport` trả `{ href }` → bot gửi deep-link (thiết kế
output-driven từ p1-01 §4 phát huy tại đây, không sửa gì).

## 2. Telegram channel — AUTH LÀ VIỆC CHÍNH

Dữ liệu tài chính — bot KHÔNG được trả lời người lạ:

1. **Allowlist mapping** `telegramUserId → accountId` — collection mới `backoffice_channel_links`
   (use-case + repo đúng layering; KHÔNG hardcode env).
2. Flow link: staff mở backoffice → cài đặt cá nhân → "Liên kết Telegram" sinh one-time code
   (TTL 10 phút) → nhắn `/link <code>` cho bot → map + lưu. Unlink được.
3. Channel auth hook: user chưa link → trả đúng 1 câu hướng dẫn link, KHÔNG lộ gì khác.
   Đã link → resolve role từ account, đính session auth.
4. Tool nhận `ctx.session` auth → check role như web.
5. Markdown: default handler Telegram gửi plain text — instructions bổ sung nhánh format số
   dạng text thuần khi channel là telegram (channel expose qua session metadata — xác nhận
   bundled docs).
6. Secrets: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` vào `src/env.ts` + `.env.example`;
   đăng ký webhook `https://<domain>/eve/v1/telegram` thủ công (eve không gọi `setWebhook` hộ).
7. **Audit log bắt buộc** (`@megawin/audit`): mọi tool call từ channel ngoài web ghi kèm
   accountId + channel + telegramUserId.
8. HITL trên Telegram = inline keyboard (eve tự render approval) — verify hoạt động với tool
   có approval từ p1-01.

## 3. Schedules — proactive (giá trị lớn nhất của channel)

- `agent/schedules/daily-report.ts`: 08:00 hằng ngày → tool tổng hợp hôm qua →
  `to(telegram, { chatId }).send(...)` cho staff đã link + **opt-in** (field trong
  `backoffice_channel_links`) — KHÔNG broadcast mặc định.
- eve compile schedules → Vercel Cron tự động khi deploy (`withEve` preserve cron của Next app).
- P2+: alert bất thường (tỷ lệ trả thưởng vượt ngưỡng) — cần định nghĩa ngưỡng từ ops config
  trước, không làm vội.

## 4. Slack (khi có yêu cầu — sau Telegram)

- `agent/channels/slack.ts` + `slackChannel({ botName })`; auth map Slack user ↔ account tái
  dùng flow link §2 (đổi platform id).
- HITL = Slack buttons; tool output có thể nâng Block Kit — renderer phía channel handler,
  KHÔNG đụng tools.

## 5. Verify

1. User lạ nhắn bot → chỉ nhận hướng dẫn link, không lộ thông tin.
2. Staff link → hỏi số liệu → nhận text + deep-link đúng; trả lời >4096 ký tự tự split.
3. HITL inline keyboard approve/deny hoạt động; session park/resume đúng.
4. Schedule chạy đúng giờ trên staging (Vercel Cron), chỉ gửi user opt-in.
5. Session sống qua redeploy: chat Telegram giữa chừng → deploy → nhắn tiếp → còn context.
6. `vercel agent-runs` xem được trace turn/tool từ channel Telegram.
7. Audit log đầy đủ cho mọi tool call từ Telegram.
