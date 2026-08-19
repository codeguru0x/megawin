# p2-01 — Channel Telegram cho agent (Slack + schedules proactive sau)

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` (revision eve-first 14/08/2026).
> **Phụ thuộc:** p1-01 done + **TRIGGER THẬT** — đã có (user yêu cầu 18/08/2026: staff cần dùng
> agent qua Telegram ngoài chat UI).
> **Revision 18/08 (đợt 1):** viết lại toàn bộ §2 cũ (8 dòng gạch đầu dòng) thành plan thi hành được, sau
> khi verify TRỰC TIẾP trên `node_modules/eve/docs/` **và** `node_modules/eve/dist/**/*.d.ts` của
> đúng version đang dùng. Mọi kết luận ở §1 đều có file nguồn — không suy đoán từ kiến thức chung
> về eve/Telegram.
> **Revision 18/08 (đợt 2)** — trả lời 8 câu hỏi của user, có **đổi quyết định**:
> 1. **Group** (§0.1): CHỈ broadcast một chiều; hỏi-đáp group hoãn G4 — lý do kỹ thuật cứng F-20.
> 2. **Ảnh/file** (§0.2): giữ TẮT, 5 rủi ro cụ thể A-1..A-5.
> 3. **Naming** (§5.0): `channel_links`/`ChannelLink`, KHÔNG `channel` trần — `channel` đã bị eve chiếm nghĩa.
> 4. **Audit** (§8.1): **BỎ `agentTurn` khỏi audit** → observability; audit chỉ ghi sự kiện QUYỀN.
> 5. **Người lạ** (§0.3): **drop IM LẶNG** (đổi từ "trả 1 câu hướng dẫn"), trừ `/start`/`/help`/`/link`.
> 6. Bot đã tạo → §10.1 chỉ còn cấu hình.
> 7. **`dailyReport`** (§11): 12:00 VN = `0 5 * * *` UTC, T+1h sau khi ngày tài chính lật (11:00 VN).
> 8. **UI admin** (§6.5b): nâng từ P2.1 lên **BẮT BUỘC v1** — cột "Kết nối" + admin unlink hộ.
> Thêm 3 phát hiện verify mới: **F-20** (nút HITL ai bấm cũng được), **F-21** (group session theo tin),
> **F-22** (eve tự chèn `username` vào context ⇒ bề mặt injection).

---

## 0. Phạm vi v1 (chốt trước khi code)

| Hạng mục | v1 | Lý do |
|---|---|---|
| Kênh | Telegram bot: **chat riêng 1-1 (`private`) = hỏi-đáp** + **group/channel = CHỈ NHẬN broadcast một chiều** | Hỏi-đáp trong group hoãn sang G4: F-20 cho thấy nút HITL trong group ai bấm cũng được, và mọi member (kể cả chưa link) **đọc được** câu trả lời — rủi ro không nằm ở code mà ở thành viên group. |
| Loại tin nhắn nhận | **CHỈ text** (`uploadPolicy: "disabled"`) | Yêu cầu user. eve mặc định NHẬN ảnh/file (§1 F-03) → phải TẮT tường minh. Phân tích rủi ro đầy đủ ở §0.2. |
| Tool | Dùng lại toàn bộ tool đọc của web, **KHÔNG** tool sandbox/ghi | Tool đã output-driven (DTO) nên không sửa gì; sandbox qua Telegram là leo thang đặc quyền (§9 T-09). |
| Auth | Allowlist `telegramUserId → accountId`, link bằng one-time code từ backoffice | §5, §6. |
| Người lạ | **Drop im lặng** (không trả lời gì) — trừ đúng 3 lệnh `/start`, `/help`, `/link` | Chốt theo user. Chi tiết + đánh đổi ở §0.3. |
| Proactive (schedules) | **CÓ** — `dailyReport` 12:00 VN vào group công ty (§11) | Đây là yêu cầu nghiệp vụ thật (user 18/08). Một chiều, không cần allowlist ⇒ không phụ thuộc độ chín của link flow. |
| Slack | Không | §15. |

**Nguyên tắc xuyên suốt:** Telegram là kênh **tin cậy thấp hơn web** (không MFA, thiết bị cá nhân,
message nằm trên hạ tầng Telegram). Vì vậy quyền trên Telegram là **tập con** của quyền web, không
bằng. Mọi chỗ nghi ngờ → fail-closed.

### 0.1 Group / channel — tách 2 bài toán khác nhau (trả lời câu hỏi 1)

Câu hỏi gộp 2 việc mà rủi ro **lệch nhau một trời một vực**. Phải tách:

| | A. Broadcast (bot GỬI vào group) | B. Hỏi-đáp (member NHẮN bot trong group) |
|---|---|---|
| Chiều dữ liệu | Một chiều, **ta chọn trước** nội dung gửi | Hai chiều, **member chọn** hỏi gì |
| Ai đọc được | Cả group — nhưng nội dung do ta duyệt trước | Cả group — nội dung **không đoán trước được** |
| Ai điều khiển được | Chỉ schedule của ta | Bất kỳ member (F-04: group dispatch khi `@bot`/command/reply) |
| Nút Approve/HITL | Không có | **Ai trong group cũng bấm được (F-20)** — kể cả người chưa link |
| Rủi ro thật | Thấp — tương đương gửi email nội bộ | **Cao** — 1 câu hỏi vô ý ("doanh thu tenant X tháng này") là rò số liệu cho toàn group |
| Quyết định v1 | ✅ **LÀM** (§11 dailyReport) | ❌ **HOÃN** sang G4 |

**Vì sao B không "chỉ cần check allowlist là xong":**

1. **Người hỏi được allowlist ≠ người đọc được câu trả lời.** Kiểm tra `from.id` chỉ chặn *ai gõ*.
   Câu trả lời hiện trong group ⇒ mọi member đọc. Bảo mật ở đây phụ thuộc **thành phần group**, thứ
   ta không kiểm soát bằng code (admin group thêm người bất kỳ lúc nào, Telegram không cho bot chặn).
2. **F-20 là lỗ không vá được từ userland.** HITL callback dispatch với `auth: null` và return trước
   khi gọi `onCallbackQuery` ⇒ ta **không** chèn được kiểm tra "người bấm có phải người hỏi". Trong
   private chat điều này vô hại (chỉ có 1 người); trong group thì bất kỳ ai bấm Approve của người
   khác. Đây là lý do kỹ thuật **cứng**, không phải sự thận trọng chủ quan.
3. **Ranh giới role tan biến.** Web có `roles`/`SUPER_ROLES` phân quyền theo account; group thì mọi
   người thấy chung một output ⇒ hiệu lực là "quyền của người hỏi cao nhất trong group".

**Nếu sau này thật cần B (thiết kế sẵn cho G4 — không code ở v1):**

- **Group phải được đăng ký tường minh** — thêm `channel_groups` collection (`chatId`, `title`,
  `allowedAccountIds[]`, `visibilityTier`), **không** cho phép mọi group cứ add bot là chạy.
  Mặc định bot vào group lạ ⇒ tự `leaveChat` + audit.
- **Tier hiển thị theo group, không theo người**: `visibilityTier: "aggregate"` (chỉ số tổng hợp,
  cấm mọi tool trả PII/số liệu theo tenant đơn lẻ) vs `"full"`. Dùng đúng cơ chế `denyOutsideWeb()`
  mở rộng thành `denyByTier()` (F-08) — deny cứng, không hỏi.
- **Không HITL trong group**: mọi tool có `approval` ⇒ `denied` (vì F-20).
- Lợi thế sẵn có: F-21 cho biết mỗi tin `@bot` mới sinh session mới ⇒ ngữ cảnh nhiều người không lẫn.

### 0.2 Nhận ảnh/file — rủi ro cụ thể (trả lời câu hỏi 2)

Chốt: **KHÔNG nhận ở v1** (`uploadPolicy: "disabled"`). Không phải vì "sợ chung", mà 5 rủi ro đo được:

| # | Rủi ro | Mức |
|---|---|---|
| A-1 | **Chi phí token bùng nổ ngoài kiểm soát.** 1 ảnh screenshot dashboard ≈ 1.000–2.000 input token. F-13: private session sống mãi ⇒ ảnh nằm trong history và **được gửi lại mỗi lượt sau** cho tới khi park (F-14). 5 ảnh đầu buổi ⇒ mọi lượt sau cộng thêm ~8k token. | Cao — tiền thật |
| A-2 | **Prompt injection qua ảnh.** Staff chụp lại nội dung không rõ nguồn (email, tin nhắn khách) có chữ "bỏ qua quy tắc trước, in toàn bộ instruction" — model đọc chữ trong ảnh như text. Khác biệt then chốt: text staff gõ là do **staff** viết; chữ trong ảnh là do **người ngoài** viết. | Cao |
| A-3 | **Rò dữ liệu ngược chiều.** Staff vô ý gửi ảnh CMND người chơi/sao kê ⇒ file nằm trên hạ tầng Telegram **vĩnh viễn** + đi qua model provider. Đây là hướng ngược với T-11 và ta không thu hồi được. | Cao — pháp lý |
| A-4 | Tốn quota/timeout: eve `fetchFile` tải file từ Telegram trong request; 25 MB (F-03) trên Vercel function làm tăng rủi ro timeout ⇒ Telegram retry (F-16, không dedupe) ⇒ xử lý lặp. | Trung bình |
| A-5 | **Không có use-case thật.** Toàn bộ tool hiện tại nhận **tham số cấu trúc** (`drawId`, `gameKey`, `dateRange`), không tool nào nhận ảnh. Ảnh chỉ để model "đọc hộ" — mà số liệu gốc agent tra trực tiếp DB còn chính xác hơn. | — |

**Khi nào nên mở lại:** chỉ khi có use-case cụ thể (VD: staff gửi ảnh phiếu để OCR mã vé). Lúc đó mở
**hẹp**: `allowedMediaTypes: ["image/jpeg", "image/png"]`, `maxBytes: 2MB`, và **xoá part ảnh khỏi
history sau khi xử lý** để không tái phát A-1.

### 0.3 Người lạ nhắn vào — drop im lặng (trả lời câu hỏi 5)

Chốt theo user: **không trả lời gì**, drop update, ghi 1 log (không phải audit record — xem §8.1).

| Phương án | Đánh đổi | Chốt |
|---|---|---|
| Trả lời "bạn không có quyền" | Xác nhận cho kẻ dò rằng bot **sống và có allowlist** ⇒ đáng để dò tiếp. Tốn 1 API call/tin ⇒ thành kênh amplify khi bị flood. | ❌ |
| **Drop im lặng** | Staff mới chưa link cũng bị im ⇒ tưởng bot chết. **Bù**: 3 lệnh `/start`, `/help`, `/link` **luôn** trả lời cho mọi người, nhưng chỉ 1 câu trung tính không tiết lộ hệ thống ("Bot nội bộ. Nếu bạn là nhân viên, lấy mã liên kết trong backoffice → gửi `/link <mã>`."). | ✅ |
| Drop hoàn toàn kể cả `/link` | Không link được ⇒ vô dụng. | ❌ |

Xử lý ở **G4** của guard chain (§4) — trả `null` từ `onMessage` (F-05) ⇒ **không tạo session, không
gọi model, 0 token**. Log qua `console.warn` (đi CloudWatch/Vercel log), **không** ghi `audit_logs`
để tránh biến bảng nghiệp vụ thành nơi hứng rác từ internet (§8.1).

---

## 1. Nghiên cứu đã verify (18/08/2026) — có file nguồn

| # | Kết luận | Nguồn (trong `apps/backoffice/node_modules/eve/`) | Hệ quả cho plan |
|---|---|---|---|
| F-01 | Channel = 1 file `agent/channels/telegram.ts` export default `telegramChannel(...)`; route mount `POST /eve/v1/telegram`. eve **KHÔNG** gọi `setWebhook` hộ. | `docs/channels/telegram.mdx` | §9 phải có bước curl `setWebhook` thủ công + verify `getWebhookInfo`. |
| F-02 | Env đúng tên: `TELEGRAM_BOT_TOKEN` + **`TELEGRAM_WEBHOOK_SECRET_TOKEN`**. | `docs/channels/telegram.mdx`, `dist/.../telegram/verify.d.ts` (`resolveTelegramWebhookSecretToken`) | **SỬA plan cũ**: §6 bản cũ ghi `TELEGRAM_WEBHOOK_SECRET` — sai tên, eve fallback theo tên có `_TOKEN`. |
| F-03 | `DEFAULT_UPLOAD_POLICY` = **25 MB, `allowedMediaTypes` không giới hạn**. Không set `uploadPolicy` ⇒ ảnh/PDF/document ĐƯỢC nhận. | `dist/src/public/channels/upload-policy.d.ts` | **BẮT BUỘC** `uploadPolicy: "disabled"`. Đây là điểm chí tử của yêu cầu "chỉ text". |
| F-04 | Dispatch mặc định: bỏ qua bot khác + chat `channel`; private thì text/caption/ảnh/file đều vào; group chỉ khi command / `@bot` / reply vào tin của bot. Điều kiện dispatch là `text.trim() ≠ ""` **HOẶC** `attachments.length > 0`. | `dist/src/public/channels/telegram/defaults.js` (`shouldDispatchTelegramMessage`) | Ảnh không kèm caption vẫn dispatch (text rỗng) ⇒ guard G1 phải chặn theo `attachments.length`, không chỉ theo text. |
| F-05 | `onMessage(ctx, message)` trả `{ auth, context?, title? }` \| `null`. `null` = **drop update, không tạo session/turn**. | `dist/.../telegramChannel.d.ts` (`TelegramInboundResult`) | Toàn bộ guard chain (§4) sống ở đây. |
| F-06 | `ctx.telegram` có `post/sendMessage/startTyping/request/answerCallbackQuery` — dùng được **trong `onMessage`**, tức trả lời được mà KHÔNG tạo session. | `dist/.../telegramChannel.d.ts` (`TelegramHandle`, `TelegramContext`) | `/link`, `/help`, thông báo từ chối đều xử lý không tốn 1 turn model (không tốn token, không tạo session rác). |
| F-07 | `SessionAuthContext` = `{ authenticator, principalId, principalType, attributes: Record<string, string \| readonly string[]>, issuer?, subject? }`. | `dist/src/channel/types.d.ts` | Danh tính staff + `channel: "telegram"` đính vào `attributes` → tool/approval/instructions đọc được, **không giả mạo được** (server tự dựng). |
| F-08 | Approval policy là hàm `(ctx: ApprovalContext) => ApprovalStatus`; `ApprovalContext extends SessionContext` (có `session.auth`); trả `{ type: "denied", reason }` = **chặn thẳng**, không hỏi người. | `dist/src/public/definitions/approval.d.ts` | Cơ chế chuẩn để deny tool nguy hiểm theo channel (§6.6) — dùng API của eve, không tự bịa guard. |
| F-09 | Tool `execute(input, ctx: ToolContext)`, `ToolContext = SessionContext & {...}` ⇒ tool đọc được `ctx.session.auth.current.attributes`. | `dist/src/public/definitions/tool.d.ts` | `navigateTo` biết mình đang chạy trên Telegram → trả link tuyệt đối (§7.3). |
| F-10 | Instructions động: `defineDynamic({ events: { "session.started" } })` trả `defineInstructions({ content })`, đọc được `ctx.session.auth`. | `docs/guides/dynamic-capabilities.md` §Dynamic instructions | Cách đúng để nạp khối instruction riêng cho Telegram, thay vì nhồi thêm vào 5 file `.md` dùng chung (§7). |
| F-11 | HITL: option → inline keyboard, freeform → `ForceReply`; eve tự `answerCallbackQuery`; `callback_data` nén trong channel state (Telegram cap 64 byte). | `docs/channels/telegram.mdx`, `dist/.../telegram/hitl.js` | `web_fetch` (`approval: always()`) là ca test HITL sẵn có — verify được ngay, không cần viết tool mới. |
| F-12 | Delivery: handler `message.completed` mặc định gửi **plain text, KHÔNG `parse_mode`** ⇒ markdown hiện literal. Text >4096 tự split theo `\n` rồi tới khoảng trắng. | `dist/.../telegram/defaults.js`, `api.js` (`splitTelegramMessageText`) | Instruction Telegram phải cấm markdown (`**`, `|` table, `###`) — không phải "nên tránh" mà là **hiện ra rác**. |
| F-13 | Continuation token private chat = `` `${chatId}::` `` ⇒ **mỗi chat riêng = ĐÚNG 1 durable session, sống mãi**. Session Telegram **tách biệt** session web (`/ai`), không dùng chung history. | `dist/.../telegram/api.js` (`telegramContinuationToken`), `docs/concepts/sessions-runs-and-streaming.md` | (a) Không có "thread mới" trên Telegram ⇒ §12 rủi ro R-02. (b) Staff hỏi trên Telegram không thấy ngữ cảnh đang chat ở web — phải nói rõ với staff, tránh kỳ vọng sai. |
| F-14 | Chạm `maxInputTokensPerSession` ⇒ eve **park session + hiện continuation prompt Approve/Stop**, trên Telegram render thành inline keyboard. | `agent/agent.ts` (JSDoc `limits`), `dist/src/harness/session-limit-continuation.js` | Session Telegram sống mãi (F-13) sẽ chạm trần sau ~300 lượt → staff bấm Approve là tiếp tục. Không phải bug; ghi vào tài liệu hướng dẫn staff. |
| F-15 | `HookContext` có `channel.kind` + `channel.continuationToken`. | `docs/guides/hooks.md` §Hook structure | Audit hook lọc đúng lượt đến từ Telegram mà không phải truyền cờ thủ công (§8). |
| F-16 | eve **KHÔNG** dedupe `update_id` của Telegram (grep `update_id` trong `dist/` = 0 hit). Telegram retry webhook khi không nhận 2xx. | grep `dist/` | Route phải luôn trả 2xx nhanh; guard chain không được `await` việc chậm trước khi trả lời (§11.3). |
| F-17 | `turnPolicy: "steer" \| "queue"` — staff nhắn tiếp khi turn đang chạy. | `dist/src/channel/types.d.ts`, `telegramChannel.d.ts` | Chốt `"queue"` (§6.1): trên Telegram staff hay gõ nhiều dòng liên tiếp; `steer` sẽ làm câu trả lời đang chạy bị đổi hướng giữa dòng. |
| F-18 | Proactive: `to(telegram, { chatId }).send(msg, { auth })` từ schedule `run`; `ScheduleHandlerArgs` có `to`/`waitUntil`/`appAuth`. | `dist/src/public/definitions/schedule.d.ts` | §11 dùng đúng shape này; `appAuth` là principal của chính agent (không mượn danh staff). |
| F-19 | Channel context trong `onMessage` **không** có `continuation.rekey` (chỉ event handler mới có `ChannelContinuationOps`). | `dist/src/public/definitions/channel.d.ts` | Không làm được `/new` (reset hội thoại) ở v1 — ghi rõ ở §12 R-02, không hứa với staff. |

**Bổ sung 18/08 (đợt 2) — 3 phát hiện quyết định câu trả lời cho group chat:**

| # | Kết luận | Nguồn | Hệ quả cho plan |
|---|---|---|---|
| **F-20** | **`callback_query` (nút inline) đi nhánh RIÊNG, KHÔNG qua `onMessage`, và dispatch với `auth: null`.** eve tuyệt đối **không** kiểm tra `query.from.id` có phải người đã tạo lượt hay không. Nếu `data` bắt đầu bằng `TELEGRAM_HITL_CALLBACK_PREFIX` thì `config.onCallbackQuery` **không được gọi** (return sớm) ⇒ **không vá được từ userland**. | `dist/.../telegramChannel.js` — `dispatchCallbackQuery`: `.respond([telegramCallbackInputResponse(...)], { auth: null })` | (a) Guard chain §4 **không** bảo vệ nút bấm. (b) Trong group: **bất kỳ member nào cũng bấm được Approve của người khác.** ⇒ Củng cố §6.6: trên Telegram tool cần approval phải **`denied` cứng**, tuyệt đối không `ask` — không có prompt thì không có nút để bấm sai. |
| **F-21** | Group: `conversationId = replyToMessage.messageId` nếu reply tin bot, **ngược lại = `messageId` của chính tin vừa gửi**. Continuation token = `` `${chatId}::${conversationId}` ``. | `dist/.../telegramChannel.js` — `conversationIdForMessage`, `continuationTokenFromState`, `stateFromMessage` | Trong group, **mỗi tin `@bot` mới = session MỚI** (context sạch); muốn hỏi tiếp phải **reply vào câu trả lời của bot**. Đây là hành vi TỐT cho group (không lẫn ngữ cảnh giữa nhiều người) và tự giải R-03 (session không phình vô hạn như private chat F-13). |
| **F-22** | eve **tự** chèn context block mỗi lượt: `chatId`, `chatType`, `chatTitle`, `messageId`, `userId`, `username`, `botUsername`. | `dist/.../telegram/inbound.js` — `formatTelegramContextBlock`, gọi tại `dispatchMessage` | Model **luôn** biết ai gửi & ở đâu ⇒ không cần ta tự bơm; nhưng cũng có nghĩa `username` do người dùng tự đặt **đi vào prompt** ⇒ là bề mặt prompt-injection (T-10 phải nói rõ). |

Giữ nguyên từ bản 13/08: eve có channel first-class cho Telegram/Slack/Discord/Teams/Twilio/GitHub/
Linear; kênh khác bridge qua `chatSdkChannel`; cross-channel handoff bằng `ctx.to(...)`; **docs
bundled trong `node_modules/eve/docs/` là source of truth theo version**.

---

## 2. Kiến trúc luồng

**Luồng A — reactive (staff hỏi, bot trả lời):**

```
Telegram Bot API
      │  POST update (message | callback_query)
      ▼
/eve/v1/telegram                       ← eve mount, verify X-Telegram-Bot-Api-Secret-Token (F-01/F-02)
      │  header sai → reject, KHÔNG chạm DB
      │
      ├─ callback_query (nút HITL) ──► ⚠️ NHÁNH RIÊNG, KHÔNG qua onMessage, auth: null (F-20)
      │                                 ⇒ guard chain KHÔNG bảo vệ được ⇒ tool nguy hiểm phải `denied`
      ▼
onMessage()  ← agent/channels/telegram.ts       [GUARD CHAIN §4 — fail-closed]
      │  G0 drop group · G4 drop người lạ IM LẶNG (§0.3)
      │  drop (null) + trả lời ngắn qua ctx.telegram.post()  (F-05/F-06)
      │
      └─ pass → { auth: SessionAuthContext(staff), context: [danh tính, thời gian, kênh] }
                    │
                    ▼
        durable session per chat (F-13)  ──► tool loop (tool đọc dùng CHUNG với web)
                    │                            │
                    │                            ├─ approval policy chặn tool nguy hiểm (F-08)
                    │                            └─ HITL → inline keyboard (F-11)
                    ▼
        message.completed → sendMessage plain text, tự split 4096 (F-12)
                    │
                    └─ hook turn.completed: chạm lastSeenAt (§8.2) — KHÔNG ghi audit_logs (§8.1)
```

**Luồng B — proactive broadcast (`dailyReport`, §11) — hoàn toàn tách khỏi A:**

```
Vercel Cron 05:00 UTC (= 12:00 VN, T+1h sau khi ngày tài chính lật lúc 11:00 VN)
      ▼
agent/schedules/daily-report.ts
      │  SETNX daily-report:<financialDate>  ← idempotency, cron không exactly-once (§11.3)
      ▼
buildDailyReportUseCase  ← số liệu tính bằng use-case XÁC ĐỊNH, KHÔNG qua model (§11.2)
      ▼
formatDailyReportText    ← plain text, cấm markdown (F-12)
      ▼
to(telegram, { chatId: env.TELEGRAM_REPORT_CHAT_ID }).send(text, { auth: appAuth })   (F-18)
      ▼
Group công ty  ← MỘT CHIỀU: bot chỉ GHI. Member gõ @bot ⇒ G0 drop (không hỏi-đáp được, §11.1)
```

Điểm mấu chốt: **không có nhánh code riêng cho Telegram trong tool**. Khác biệt kênh chỉ nằm ở 3
chỗ: `onMessage` (auth + context), approval policy (deny theo channel), instructions động (hình
dạng câu trả lời). Đó là đúng thiết kế eve khuyến nghị (`docs/channels/overview.mdx`: cùng runtime,
channel chỉ normalize input + decide delivery). Luồng B thậm chí **không dùng model** ⇒ không chịu
ảnh hưởng của instruction hay tool nào.

---

## 3. Cấu trúc file (thêm/sửa)

```
apps/backoffice/
├── agent/
│   ├── channels/
│   │   ├── eve.ts                        # ĐÃ CÓ (web + better-auth) — KHÔNG sửa
│   │   └── telegram.ts                   # MỚI §6.1 — telegramChannel + guard chain
│   ├── instructions/
│   │   ├── 20-time-context.md            # SỬA §7.1 — "clientContext" → "context của lượt"
│   │   └── 90-channel.ts                 # MỚI §7.2 — dynamic instructions theo channel
│   ├── hooks/
│   │   └── channel-audit.ts              # MỚI §8.2 — chạm lastSeenAt (KHÔNG ghi audit_logs)
│   ├── schedules/
│   │   └── daily-report.ts               # MỚI §11.2 — broadcast 12:00 VN vào group công ty
│   ├── lib/
│   │   ├── telegram-guards.ts            # MỚI §6.2 — G0..G6, thuần logic, unit-test được
│   │   ├── channel-principal.ts          # MỚI §6.3 — dựng SessionAuthContext + context blocks
│   │   ├── channel-approval.ts           # MỚI §6.6 — denyOutsideWeb() cho tool nguy hiểm
│   │   └── daily-report-format.ts        # MỚI §11.2 — formatDailyReportText, plain text (F-12)
│   └── tools/
│       ├── navigateTo.ts                 # SỬA §7.3 — href tuyệt đối khi channel ≠ web
│       ├── bash.ts · write_file.ts · read_file.ts · glob.ts · grep.ts   # SỬA — approval: denyOutsideWeb()
│       └── web_fetch.ts                  # KHÔNG sửa — always() đã đúng, dùng làm ca test HITL
├── src/
│   ├── env.ts                            # SỬA §10.2 — 4 biến Telegram (+ .env.example)
│   ├── server/use-cases/
│   │   └── reports/build-daily-report.ts # MỚI §11.2 — gom số liệu, dùng lại use-case report sẵn có
│   ├── app/api/me/channels/telegram/
│   │   ├── link-code/route.ts            # MỚI — POST sinh one-time code
│   │   ├── route.ts                      # MỚI — GET trạng thái link
│   │   └── unlink/route.ts               # MỚI — DELETE huỷ link
│   ├── app/api/accounts/company/[accountId]/channels/telegram/
│   │   └── route.ts                      # MỚI §6.5b — DELETE admin unlink hộ (roles: [Admin])
│   ├── app/(main)/me/channels/           # MỚI — trang "Kênh liên kết" (§6.5)
│   └── app/(main)/accounts/company/
│       ├── _components/accounts-table.tsx  # SỬA §6.5b — thêm cột "Kết nối"
│       └── _components/row-actions.tsx     # SỬA §6.5b — hành động "Huỷ liên kết Telegram"
└── test/
    ├── telegram-guards.test.ts           # MỚI §14 — test guard chain
    └── daily-report-format.test.ts       # MỚI §14 — test format plain text + độ dài

packages/
├── identity/src/entities/channel-link.ts             # MỚI §5.1 — entity + enums
├── identity-application/src/
│   ├── infras/repos/channel-link-repo.ts             # MỚI §5.2
│   ├── infras/mappers/channel-link-mapper.ts         # MỚI
│   ├── indexes/channel-link.ts                       # MỚI §5.3 (mẫu: packages/audit/src/indexes)
│   └── use-cases/channels/                           # MỚI §6.4
│       ├── issue-telegram-link-code.ts
│       ├── redeem-telegram-link-code.ts
│       ├── resolve-staff-by-telegram-user.ts
│       ├── unlink-telegram.ts                        # dùng cho cả self và ByAdmin (§6.5b)
│       ├── touch-channel-link-last-seen.ts           # MỚI §8.2
│       └── get-my-channel-links.ts
├── identity-application/src/use-cases/accounts/      # SỬA §6.5b
│   ├── list-company-accounts.ts                      # join channel_links (1 query, Map — không N+1)
│   └── dto/list-company-accounts.dto.ts              # + AccountChannelLinkItem
├── shared/src/utils/date.ts                          # SỬA §11.0 — + financialDateYesterdayVN()
└── audit/src/entities/                               # SỬA §8.2 — thêm category/action/targetType `channel`
```

**Quyết định vị trí data (§5) — chọn `identity`, KHÔNG tạo package mới, KHÔNG prefix `backoffice_`:**
mapping "identity nền tảng ngoài → account nội bộ" là bài toán của identity, không của backoffice
(sau này Slack/Zalo dùng lại y nguyên, và `apps/api-*` cũng có thể cần). Nó nằm cùng DB
`megawin-identity` với `accounts` nên resolve staff không phải cross-DB. Plan cũ ghi
`backoffice_channel_links`: bỏ — prefix theo tên app là sai trục (collection thuộc domain, không
thuộc app), và `identity_` prefix cũng không cần vì đã tách DB.

---

## 4. Guard chain trong `onMessage` — fail-closed, thứ tự cố định

Mỗi guard trả 1 trong 3: **DROP** (`null`, im lặng), **REPLY+DROP** (`ctx.telegram.post` rồi `null`),
**PASS** (đi tiếp). Không guard nào được throw — throw ⇒ non-2xx ⇒ Telegram retry vô hạn (F-16).

| # | Guard | Điều kiện | Kết quả | Vì sao |
|---|---|---|---|---|
| G0 | `chat.type !== "private"` | group/supergroup/channel | **DROP im lặng** | v1 group chỉ nhận broadcast một chiều (§0.1, §11.1). Im lặng, KHÔNG báo "bot không hoạt động ở đây" — trả lời trong group là tự khai bot tồn tại cho người ngoài. **Đây là lớp chặn THẬT** cho T-07, không phải cấu hình BotFather (Allow Groups phải bật để §11 hoạt động). |
| G1 | `message.attachments.length > 0` | có ảnh/file | **REPLY+DROP** *(chỉ khi đã link — xem G4)*: "Mình chỉ xử lý tin nhắn văn bản." | Yêu cầu user (§0.2). Kết hợp `uploadPolicy: "disabled"` (F-03) = 2 lớp: policy chặn eve fetch file, guard chặn cả tin ảnh-không-caption (F-04). |
| G2 | `text.trim() === ""` | sticker/location/poll… | **DROP im lặng** | Không có gì để xử lý. |
| G3 | `text` khớp `/^\/(start\|help\|link)/` | 3 lệnh **public** | **REPLY+DROP** (xử lý ở §6.4) — trả lời cho **mọi người**, kể cả chưa link | (a) Không tốn token; (b) code link không bao giờ vào history/transcript; (c) người CHƯA link vẫn phải dùng được `/link`. Nội dung trả lời **trung tính** (§0.3), không tiết lộ hệ thống. |
| G3b | `text` khớp `/^\/(unlink\|whoami)/` | 2 lệnh **cần link** | Đã link → REPLY+DROP; **chưa link → DROP im lặng** | `/whoami` trả lời cho người lạ = xác nhận có allowlist. Chỉ người đã link mới đáng được phản hồi. |
| G4 | Tra `channel_links` theo `platformUserId` | không có / `status ≠ active` | **DROP IM LẶNG** + `console.warn` | **ĐỔI so với bản trước** (§0.3, chốt theo user): không trả lời gì. Trả lời "bạn chưa có quyền" là xác nhận bot sống + có allowlist ⇒ đáng dò tiếp, và thành kênh amplify khi bị flood. Người cần hướng dẫn đã có G3 (`/help`, `/link`). **Không** ghi `audit_logs` (§8.1) — lượng không kiểm soát được. |
| G5 | Load account theo `accountId` | `status = Suspended` HOẶC không còn role Staff/super | **REPLY+DROP**: "Tài khoản không còn quyền truy cập." + đánh dấu link `revoked` | Người này **đã từng** link ⇒ là staff thật, xứng đáng biết lý do (khác G4). **Thu hồi tức thì**: khoá account trên BO là mất luôn quyền Telegram, không cần nhớ đi unlink. Đây là lý do phải load account MỖI lượt chứ không snapshot role lúc link. |
| G6 | Rate limit Redis theo `platformUserId` | vượt 20 tin/5 phút | **REPLY+DROP**: "Bạn đang gửi quá nhanh, thử lại sau ít phút." | Chặn cả lạm dụng vô ý (spam câu hỏi) và chi phí model khi thiết bị bị chiếm. |
| G7 | — | pass | **PASS**: `{ auth, context, title }` | `auth` = principal staff đã verify; `context` = 3 khối §6.3; `title` = 60 ký tự đầu để `vercel agent-runs` đọc được. |

⚠️ **Thứ tự G1 vs G4 — cân nhắc có chủ đích.** G1 (ảnh) đứng trước G4 (allowlist) trong bảng, nhưng
**chỉ được REPLY khi đã link**. Người lạ gửi ảnh ⇒ im lặng. Cách triển khai: G1 chỉ *ghi nhận* có
attachment, còn quyết định REPLY hay DROP dời xuống **sau** G4. Nếu triển khai theo thứ tự bảng một
cách máy móc thì người lạ gửi ảnh sẽ nhận được câu trả lời — rò rỉ đúng thứ §0.3 muốn tránh.

Thứ tự có chủ đích: G0-G2 (rẻ, không đụng I/O) → G3 (chuỗi, không đụng DB) → G4-G5 (DB) → G6
(Redis). Người lạ spam bot chỉ tốn 1 query Mongo/tin, không tốn model call nào.

**Cập nhật `lastSeenAt`** của link: gộp vào hook `turn.completed` (§8.2), ghi `void` không `await` để
không chặn đường nóng. Đây là thứ **duy nhất** ghi DB mỗi lượt — audit `agentTurn` đã bị bỏ (§8.1).

---

## 5. Data model

### 5.0 Naming: vì sao `channel_links` / `ChannelLink`, không phải `channel` (trả lời câu hỏi 3)

Ý user đúng về **chức năng** (nối account web ↔ id app ngoài) nhưng tên **`channel` trần là sai** —
3 lý do, xếp theo mức nghiêm trọng:

1. **`channel` đã bị chiếm nghĩa trong chính codebase này, bởi eve.** `ChannelContext`,
   `defineChannel`, `ctx.channel.kind`, `agent/channels/telegram.ts` — trong ngữ cảnh eve, "channel"
   = **đường vận chuyển tin nhắn** (web/telegram/slack), là khái niệm **runtime, không có state ở DB**.
   Nếu `packages/identity` cũng có entity tên `Channel`, thì `import { Channel }` trong cùng một file
   agent sẽ tối nghĩa: đang nói đường truyền hay bản ghi liên kết? Đây đúng loại va chạm mà
   `operator-monorepo-structure.mdc` §2 đã chỉ ra với `agent`/`wallet`/`core`.
2. **Tên phải mô tả *cái được lưu*, không phải *lĩnh vực*.** Ta không lưu "một channel" (Telegram tồn
   tại độc lập với DB của ta) — ta lưu **một liên kết** giữa `accountId` và `platformUserId`, có
   `status`, `linkedAt`, `revokedReason`. Danh từ đúng là **link**. So sánh với entity đã có:
   `audit_logs` (không phải `audits`), `mfa_devices` (không phải `mfa`).
3. **`platform` vs `channel` — tách 2 trục.** `platform` = *sản phẩm ngoài* (`telegram`, `slack`,
   `zalo`) → thuộc entity. `channel` = *đường vào agent* (`web`, `telegram`) → thuộc runtime eve và
   `session.auth.attributes.channel`. Trộn 2 trục vào một chữ sẽ hỏng ngay khi Slack có 2 đường vào
   (DM vs slash-command).

**Chốt tên:**

| Thứ | Tên | Vị trí |
|---|---|---|
| Collection Mongo | `channel_links` | DB `megawin-identity` |
| Entity | `ChannelLinkEntity` | `packages/identity/src/entities/channel-link.ts` |
| Repo | `ChannelLinkRepository` | `packages/identity-application/src/infras/repos/` |
| Enum nền tảng | `ChannelPlatform` (`telegram`) | cùng file entity |
| Attribute runtime | `session.auth.attributes.channel = "web" \| "telegram"` | agent (F-07) |

Đặt trong `packages/identity` (không tạo package mới): liên kết này **là thuộc tính của danh tính**,
cùng vòng đời với account (account bị suspend ⇒ link phải revoke — §4 G5). Tách package sẽ tạo phụ
thuộc vòng `identity ↔ channel`.

### 5.1 Mongo — `channel_links` (DB `megawin-identity`)

Bền vững, phải query được theo cả 2 chiều (`platformUserId → account` cho webhook; `accountId →
links` cho trang cá nhân). **Không** đặt trong Redis: mất mapping = mất quyền truy cập của cả team.

```ts
// packages/identity/src/entities/channel-link.ts
/** Nền tảng nhắn tin ngoài được phép liên kết với account nội bộ. */
export const ChannelPlatform = {
  Telegram: "telegram",
} as const;
export type ChannelPlatform = (typeof ChannelPlatform)[keyof typeof ChannelPlatform];

/** Trạng thái liên kết. `revoked` giữ lại record để forensic — KHÔNG xoá cứng. */
export const ChannelLinkStatus = {
  Active: "active",
  Revoked: "revoked",
} as const;
export type ChannelLinkStatus = (typeof ChannelLinkStatus)[keyof typeof ChannelLinkStatus];

/** Ai/điều gì thu hồi liên kết — phân biệt staff tự huỷ với hệ thống tự thu hồi. */
export const ChannelRevokeReason = {
  ByOwner: "by_owner",
  ByAdmin: "by_admin",
  AccountSuspended: "account_suspended",
  RoleRemoved: "role_removed",
} as const;
export type ChannelRevokeReason = (typeof ChannelRevokeReason)[keyof typeof ChannelRevokeReason];

export interface ChannelLinkEntity extends BaseEntity {
  platform: ChannelPlatform;
  /** User id trên nền tảng (Telegram numeric id, dạng string). Khoá tra cứu của webhook. */
  platformUserId: string;
  /** `@username` Telegram lúc link — CHỈ để hiển thị. KHÔNG dùng để auth (đổi được tuỳ ý). */
  platformUsername?: string;
  /** Chat id 1-1 với bot — cần cho proactive DM (§11.6). Private chat: bằng `platformUserId`. */
  platformChatId: string;
  /** accountId nội bộ. Khoá ổn định — KHÔNG lưu role/username làm nguồn phân quyền (§4 G5). */
  accountId: string;
  /** Snapshot chỉ để hiển thị/audit, không dùng để phân quyền. */
  usernameSnapshot: string;
  status: ChannelLinkStatus;
  /** Opt-in nhận tin chủ động qua DM (§11.6). Mặc định `false` — KHÔNG broadcast theo mặc định. */
  proactiveOptIn: boolean;
  linkedAt: Date;
  /** IP + user-agent của request sinh code (không phải của Telegram) — forensic. */
  linkedFromIp?: string;
  lastSeenAt?: Date;
  revokedAt?: Date;
  revokeReason?: ChannelRevokeReason;
}
```

### 5.2 Repo

```ts
// packages/identity-application/src/infras/repos/channel-link-repo.ts
export class ChannelLinkRepository extends IdentityBaseRepo<ChannelLinkEntity, ChannelLinkMapper> {
  constructor() {
    super({ collName: "channel_links", dataMapper: new ChannelLinkMapper() });
  }

  /** Đường nóng của webhook — 1 query, hit unique index. */
  public async findActiveByPlatformUser(platform, platformUserId): Promise<ChannelLinkEntity | null>;
  public async listByAccount(accountId: string): Promise<ChannelLinkEntity[]>;
  /**
   * Batch cho bảng admin (§6.5b) — MỘT query cho N account, tránh N+1 trên đường render trang.
   * Caller join in-memory bằng `Map<accountId, ChannelLinkEntity[]>`.
   */
  public async listActiveByAccountIds(accountIds: readonly string[]): Promise<ChannelLinkEntity[]>;
  /** Upsert khi redeem code: 1 staff ↔ 1 telegram account (unique 2 chiều, §5.3). */
  public async upsertLink(input: {...}): Promise<ChannelLinkEntity | null>;
  public async revoke(platform, platformUserId, reason: ChannelRevokeReason): Promise<boolean>;
  public async touchLastSeen(platform, platformUserId): Promise<boolean>;
}
```

`AccountRepository` hiện **không có** finder theo `accountId` (chỉ `getAccountByUsername`) → thêm
`findCompanyAccountByAccountId(accountId)` cho G5. Dùng `accountId` chứ không `username` vì username
có thể đổi, `accountId` là khoá ổn định (cùng lý do §5.1).

### 5.3 Index (tạo THỦ CÔNG — theo đúng convention `packages/audit/src/indexes`)

```js
use("megawin-identity");
db.channel_links.createIndexes([
  // Đường nóng webhook. Unique: 1 telegram user KHÔNG map được vào 2 account.
  { key: { platform: 1, platformUserId: 1 }, name: "platform_user_unique", unique: true },
  // Unique: 1 account KHÔNG link 2 telegram khác nhau (link mới thay link cũ, có audit).
  { key: { platform: 1, accountId: 1 }, name: "platform_account_unique", unique: true },
  // Trang "Kênh liên kết" + schedules quét danh sách opt-in.
  { key: { accountId: 1 }, name: "account" },
  { key: { platform: 1, status: 1, proactiveOptIn: 1 }, name: "proactive_targets" },
  // Bảng admin (§6.5b): listActiveByAccountIds — $in accountId + filter status.
  { key: { platform: 1, status: 1, accountId: 1 }, name: "admin_list" },
]);
```

Unique 2 chiều là **guard tầng DB** cho quy tắc "1 staff ↔ 1 Telegram": không dựa vào việc use-case
nhớ kiểm tra. Duplicate key → dùng `duplicate-key-error.ts` của `@megawin/data` để trả lỗi nghiệp vụ
tử tế.

### 5.4 Redis — one-time code + rate limit + chống brute-force

Dữ liệu **ephemeral có TTL chính xác** → Redis, không phải Mongo TTL (Mongo xoá theo background job
~60s/lần, không đủ chặt cho code bảo mật). Namespace dùng lại `CacheNamespace.Identity`.

| Khoá | TTL | Giá trị | Ghi chú |
|---|---|---|---|
| `identity:tg-link-code:v1:<sha256(code)>` | **600s** | `{ accountId, username, ip }` | **Lưu HASH của code, không lưu code trần** — dump Redis không lấy được code dùng được. |
| `identity:tg-link-issued:v1:<accountId>` | 600s | `sha256(code)` | Sinh code mới ⇒ **xoá code cũ** (1 code hiệu lực/account). Chặn tích trữ code. |
| `identity:tg-rl:v1:<platformUserId>` | 300s | counter | G6: `INCR` + `EXPIRE` lần đầu; >20 ⇒ chặn. |
| `identity:tg-linkfail:v1:<platformUserId>` | 3600s | counter | ≥5 lần `/link` sai ⇒ chặn `/link` 1 giờ (chống dò code). |
| `identity:daily-report:v1:<financialDate>` | **48h** | `sentAt` | **§11.3** — `SETNX` trước khi gửi. Vercel Cron không exactly-once ⇒ nếu key đã có thì bỏ qua. TTL 48h (không 24h) để không mở lại cửa gửi trùng ở biên ngày. |

**Code format:** 8 ký tự Crockford base32 (bỏ `0 O 1 I L U`) sinh từ `randomBytes(8)` — 32^8 ≈ 1,1e12
không gian; kèm TTL 10 phút + 5 lần thử là đủ. Hiển thị dạng `XXXX-XXXX` cho dễ đọc, chuẩn hoá (bỏ
`-`, upper) trước khi hash. Redeem = **atomic**: `GETDEL` (hoặc `GET` + `DEL` rồi kiểm tra `DEL` trả
1) — cấm dùng lại 1 code 2 lần kể cả khi 2 update về cùng lúc.

---

## 6. Code chi tiết

### 6.1 `agent/channels/telegram.ts`

```ts
/**
 * Channel Telegram cho agent vận hành — chỉ chat riêng 1-1, chỉ text, chỉ staff đã liên kết.
 *
 * TOÀN BỘ quyết định "có cho tin nhắn này vào agent hay không" nằm ở `onMessage` (guard chain
 * §4 của plan p2-01). Tin bị chặn KHÔNG tạo session và KHÔNG gọi model — trả lời trực tiếp bằng
 * `ctx.telegram.post()`, nên người lạ spam bot chỉ tốn 1 query Mongo, không tốn token.
 *
 * `uploadPolicy: "disabled"` là BẮT BUỘC, không phải cho chắc: mặc định của eve là 25 MB + mọi
 * media type (`upload-policy.d.ts` → `DEFAULT_UPLOAD_POLICY`), tức không set là bot NHẬN ảnh/PDF.
 * Guard G1 chặn thêm ở tầng tin nhắn vì tin ảnh không caption vẫn được eve dispatch
 * (`shouldDispatchTelegramMessage`: `attachments.length > 0` là đủ điều kiện).
 *
 * `turnPolicy: "queue"` (không phải `steer` mặc định): trên Telegram staff hay gõ tách 2-3 tin
 * liên tiếp cho cùng một ý; `steer` sẽ chèn tin mới vào lượt đang chạy và đổi hướng câu trả lời
 * giữa dòng. `queue` xử lý lần lượt — chậm hơn một nhịp, nhưng câu trả lời không bị trộn.
 */

import { telegramChannel } from "eve/channels/telegram";

import { handleTelegramCommand, isTelegramCommand } from "../lib/telegram-commands";
import { buildTelegramPrincipal, buildTurnContext } from "../lib/channel-principal";
import { runTelegramGuards } from "../lib/telegram-guards";

export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME,
  uploadPolicy: "disabled",
  turnPolicy: "queue",

  onMessage: async (ctx, message) => {
    const gate = await runTelegramGuards(message); // G0..G6 — thuần logic + I/O đọc
    if (gate.kind === "drop") {
      return null;
    }
    if (gate.kind === "reply") {
      await ctx.telegram.post(gate.text);
      return null;
    }
    if (gate.kind === "command") {
      await ctx.telegram.post(await handleTelegramCommand(gate.command, message));
      return null;
    }

    // PASS — gate.staff là account đã verify Active + role Staff/super Ở LƯỢT NÀY.
    await ctx.telegram.startTyping();
    return {
      auth: buildTelegramPrincipal(gate.staff, message),
      context: buildTurnContext(gate.staff, message),
      title: message.text.slice(0, 60),
    };
  },
});
```

### 6.2 `agent/lib/telegram-guards.ts`

Trả về union rõ ràng để `onMessage` không có `if` lồng nhau, và để **unit-test được không cần
Telegram thật** (§12):

```ts
export type TelegramGate =
  | { kind: "drop" }
  | { kind: "reply"; text: string }
  | { kind: "command"; command: TelegramCommand }
  | { kind: "pass"; staff: LinkedStaff };
```

Toàn bộ text từ chối lấy từ 1 const object (`TELEGRAM_REPLIES`) — để review được **một chỗ** rằng
không câu nào lộ thông tin nội bộ (§7 T-04). Ví dụ nội dung G4:

> "Bạn chưa được liên kết với hệ thống. Vui lòng liên kết từ trang cá nhân trong hệ thống nội bộ,
> rồi gửi lại lệnh `/link <mã>`."

KHÔNG viết "MegaWin Backoffice", KHÔNG nêu URL, KHÔNG nêu tên phòng ban.

### 6.3 `agent/lib/channel-principal.ts`

```ts
/**
 * Dựng principal + context blocks cho lượt Telegram.
 *
 * VÌ SAO Ở SERVER: cùng lý do `staffContext` trong `channels/eve.ts` — danh tính không bao giờ
 * lấy từ payload do client/nền tảng gửi. Ở đây còn nghiêm hơn: `message.from.username` là thứ
 * người dùng Telegram tự đổi được, nên nó CHỈ để hiển thị, `accountId` mới là khoá thật.
 */
export function buildTelegramPrincipal(staff: LinkedStaff, message: TelegramMessage): SessionAuthContext {
  return {
    authenticator: "telegram-link",     // KHÁC "app" (web) → `staffContext` của eve.ts tự bỏ qua
    principalType: "user",
    principalId: staff.accountId,       // KHÔNG phải `telegram:<id>` như defaultTelegramAuth
    attributes: {
      channel: "telegram",              // ← khoá mà approval policy + instructions động đọc
      telegramUserId: message.from!.id,
      telegramChatId: message.chat.id,
      username: staff.username,
      name: staff.name,
      roles: staff.roles,
      accountStatus: staff.accountStatus,
    },
  };
}
```

**3 khối `context` mỗi lượt** (`readonly string[]`, không vào history vĩnh viễn — eve chèn lại mỗi
lượt):

1. **Danh tính** — y hệt `staffContext` của web: `accountId · username · tên · vai trò`.
2. **Mốc thời gian** — `now`/`today`/`financialDate`/`timezone` tính bằng
   `formatVNDateTime` / `formatVNDate` / `financialDateTodayVN` từ `@megawin/shared/utils`.
   **Đây là gap phải bịt**: web đưa mốc thời gian qua `clientContext` (`ai-panel-provider.tsx`),
   Telegram KHÔNG có `clientContext` ⇒ không bịt thì model tự đoán ngày (instruction
   `20-time-context.md` rule 9 nói rõ ngày trong kiến thức huấn luyện là SAI) → mọi câu hỏi
   "hôm nay" trả sai. Bonus: clock server đúng hơn clock browser.
3. **Kênh** — "Kênh: Telegram, chat riêng. Không có trang nào đang mở nên không có `route`/`filters`/
   `page`; nếu câu hỏi cần ngữ cảnh trang thì hỏi lại." Nếu không nói, model sẽ đi tìm `filters`
   và im lặng suy đoán.

### 6.4 Use-cases + lệnh bot

| Lệnh | Xử lý | Ghi chú bảo mật |
|---|---|---|
| `/start`, `/help` | Trả hướng dẫn ngắn (cùng text G4 nếu chưa link; nếu đã link thì gợi ý 3 câu hỏi mẫu) | Không nêu danh sách tool/năng lực chi tiết cho người chưa link. |
| `/link <mã>` | `RedeemTelegramLinkCodeUseCase`: normalize → hash → `GETDEL` Redis → không có/hết hạn ⇒ tăng counter fail; có ⇒ `upsertLink` + audit `channel.link` | Code chỉ dùng 1 lần (atomic). Sau khi link, khuyên staff **xoá tin nhắn chứa mã** — mã đã vô hiệu nhưng tránh tạo thói quen để mã trong lịch sử chat. |
| `/unlink` | `UnlinkTelegramUseCase(reason: ByOwner)` + audit | Cho phép huỷ **từ Telegram** (mất quyền BO vẫn tự cắt được); huỷ từ BO cũng có (§6.5). |
| `/whoami` | Trả `username` + vai trò của account đang link | Chỉ khi đã link. Giúp staff tự phát hiện link sai người. |

`IssueTelegramLinkCodeUseCase` (gọi từ route BO): sinh code → xoá code cũ của account → set 2 khoá
Redis (§5.4) → **trả code trần đúng 1 lần** cho UI. Server không lưu code trần ở đâu.

### 6.5 UI + route BO (`/me/channels`)

Theo đúng mẫu `/me/mfa` (`withApi().auth({ roles: [CompanyRole.Staff] })`, use-case ở
`@megawin/identity-application/use-cases/channels`):

- `GET /api/me/channels/telegram` → trạng thái: chưa link / đã link (`@username`, `linkedAt`,
  `lastSeenAt`, `proactiveOptIn`).
- `POST /api/me/channels/telegram/link-code` → `{ code, expiresInSec: 600, botUsername }`. UI hiện
  code + đồng hồ đếm ngược + nút copy + link `https://t.me/<bot>` (deep link `?start=` **không**
  dùng: `/start` payload sẽ nằm trong history chat và trong log Telegram; bắt staff gõ `/link` là
  đánh đổi 1 nhịp UX cho 1 lớp rò rỉ ít hơn).
- `DELETE /api/me/channels/telegram/unlink`.
- Toggle `proactiveOptIn` (mặc định OFF) — chuẩn bị cho §11.6, không cần chờ.

### 6.5b UI admin — cột kết nối trong danh sách tài khoản công ty (trả lời câu hỏi 8)

**Nâng từ "P2.1, không chặn v1" lên BẮT BUỘC trong v1.** Lý do đổi quyết định: không có view này thì
admin **không có cách nào** biết ai đang truy cập dữ liệu tài chính qua Telegram — mà đó chính là câu
hỏi đầu tiên khi có sự cố. `/me/channels` chỉ cho staff thấy link của **chính mình**; thiếu góc nhìn
admin là thiếu một nửa cơ chế kiểm soát, không phải thiếu một tiện ích.

**Vị trí:** `apps/backoffice/src/app/(main)/accounts/company/` — bảng đã có sẵn
(`_components/accounts-table.tsx`), thêm 1 cột.

**Thay đổi backend (3 file):**

| File | Thay đổi |
|---|---|
| `packages/identity-application/src/use-cases/accounts/dto/list-company-accounts.dto.ts` | Thêm field `channels: AccountChannelLinkItem[]` vào `CompanyAccountItem`. |
| `packages/identity-application/src/use-cases/accounts/list-company-accounts.ts` | Sau `repo.listCompanyAccounts()`, gọi **1 lần** `channelLinkRepo.listActiveByAccountIds(ids)` rồi join in-memory bằng `Map` (§code-quality 7.2). **Tuyệt đối không** query trong `.map()` — đó là N+1 trên đường render trang. |
| `apps/backoffice/src/app/api/accounts/company/route.ts` | Không sửa — DTO tự lan ra vì `GET` đã trả nguyên output use-case. |

```ts
/** Thông tin liên kết kênh ngoài của 1 account — dùng cho cột "Kết nối" ở danh sách admin. */
export interface AccountChannelLinkItem {
  /** Nền tảng: hiện chỉ `telegram`. */
  platform: ChannelPlatform;
  /** `@username` Telegram — CHỈ hiển thị. Có thể rỗng nếu staff không đặt username. */
  platformUsername?: string;
  /**
   * Telegram user id đã che: chỉ 4 số cuối (VD `…7890`).
   * Che vì id đầy đủ là thứ kẻ tấn công cần để giả mạo/nhắm mục tiêu; admin chỉ cần đủ để đối chiếu.
   * Muốn xem đầy đủ → trang chi tiết account, và lượt xem đó tự ghi audit.
   */
  platformUserIdMasked: string;
  /** Thời điểm liên kết (ISO 8601). */
  linkedAt: string;
  /** Lượt dùng gần nhất qua kênh này (ISO 8601). Rỗng = đã link nhưng chưa dùng. §8.2 */
  lastSeenAt?: string;
  /** Có nhận báo cáo chủ động qua DM hay không. §11.6 */
  proactiveOptIn: boolean;
}
```

**UI (`accounts-table.tsx`) — cột "Kết nối":**

| Trạng thái | Hiển thị |
|---|---|
| Chưa link | dấu `—` xám (không dùng badge "Chưa kết nối" — làm nhiễu bảng khi phần lớn account chưa link) |
| Đã link, có dùng | badge Telegram + `@username` + tooltip `linkedAt` / `lastSeenAt` / `…7890` |
| Đã link, chưa dùng | badge outline (phân biệt link "cắm rồi để đó" — ứng viên dọn dẹp) |
| `lastSeenAt` > 90 ngày | badge cảnh báo nhạt "ngủ" — gợi ý revoke |

**Hành động admin (row action):** "Huỷ liên kết Telegram" → `DELETE /api/accounts/company/:accountId/channels/telegram`,
`auth({ roles: [CompanyRole.Admin] })` (**Admin, không Staff** — thu hồi quyền của người khác là hành
động đặc quyền), ghi audit `channel.unlink` với `revokedReason: ByAdmin`, `actorId` = admin,
`targetId` = account bị huỷ. Có dialog xác nhận nêu rõ tên account.

**Không làm ở v1:** admin **tạo code link hộ** người khác. Đó là đường để admin cắm Telegram của mình
vào account người khác mà nạn nhân chỉ biết qua `/me/activity`. Staff tự sinh code cho chính mình là
đủ, và giữ được nguyên tắc "chỉ chủ tài khoản mở được quyền truy cập của tài khoản đó".

### 6.6 Chặn tool nguy hiểm ngoài web — `agent/lib/channel-approval.ts`

```ts
/**
 * Approval policy: DENY thẳng khi lượt không đến từ web.
 *
 * Dùng `{ type: "denied", reason }` (API của eve — `approval.d.ts`) chứ không `always()`: `always()`
 * là "hỏi người rồi cho chạy", trên Telegram thành inline keyboard mà staff bấm Approve là chạy
 * `bash` trong sandbox từ điện thoại — đúng thứ ta muốn cấm. `denied` là chặn cứng, model đọc
 * `reason` và tự giải thích cho staff.
 */
export function denyOutsideWeb(label: string): ApprovalPolicy {
  return (ctx) => {
    const channel = ctx.session.auth.current?.attributes.channel;
    if (channel !== undefined && channel !== "web") {
      return { type: "denied", reason: `${label} chỉ dùng được trong giao diện web của hệ thống.` };
    }
    return undefined; // để policy sẵn có của tool (nếu có) quyết định
  };
}
```

Áp cho: `bash`, `write_file`, `read_file`, `glob`, `grep` (nhóm sandbox). `web_fetch` giữ
`always()` — đây là ca test HITL trên Telegram (§14.8). Tool đọc dữ liệu nghiệp vụ (`get*`,
`list*`, `searchAuditLogs`, `navigateTo`) **không** đổi.

⚠️ Để `denyOutsideWeb` phân biệt được web, `channels/eve.ts` phải thêm `channel: "web"` vào
`attributes` của `appSession()` — 1 dòng. Không thêm thì `channel === undefined` và policy cho qua
(chọn `undefined` làm "web" là **fail-open**, nên chốt: thêm dòng đó, và §14.7 test đúng ca này).

⚠️ **F-20 củng cố lựa chọn `denied` thay vì `ask`:** callback query của inline keyboard dispatch với
`auth: null` và **không** đi qua `onMessage` ⇒ ta không kiểm tra được ai bấm. Trong private chat chỉ
có 1 người nên `ask` (HITL) vẫn dùng được cho `web_fetch`; nhưng với tool nguy hiểm thì `denied` là
lựa chọn duy nhất đúng — **không sinh nút thì không có nút để bấm sai** (R-08).

---

## 7. Instructions phải phân biệt kênh — gap lớn nhất về chất lượng trả lời

Đây là phần dễ bị bỏ qua nhất và cũng là phần khiến agent "chạy được nhưng trả lời vô dụng" trên
Telegram. Ba instruction hiện tại giả định **môi trường web**:

| File | Câu giả định web | Trên Telegram thành |
|---|---|---|
| `20-time-context.md` rule 8-9 | "Mốc thời gian LUÔN lấy từ `clientContext`" | Không có `clientContext` ⇒ model không có mốc nào ⇒ hoặc hỏi lại staff mỗi câu, hoặc tự đoán ngày (rule 9 cấm nhưng nó không còn lựa chọn). |
| `50-answer-shape.md` §"Kết quả tra cứu đã được hiển thị sẵn" | "hệ thống tự dựng bảng số liệu ngay trong hội thoại" | **SAI hoàn toàn** — Telegram không render card. Model tuân lệnh "CẤM liệt kê lại bảng" ⇒ staff nhận câu trả lời thiếu số. |
| `50-answer-shape.md` §"thẻ nằm TRƯỚC phần chữ" | "thẻ điều hướng tự ghi trang đã mở" | Không có thẻ nào. `navigateTo` trả `href` tương đối → model không đưa link, staff không mở được gì. |

### 7.1 Sửa `20-time-context.md`

Đổi mọi chỗ "`clientContext`" → "**context của lượt**", và ghi rõ nguồn: "Trong giao diện web,
context này do client đính kèm (kèm `route`/`filters`/`page`); ở kênh ngoài (Telegram) do server
đính kèm và **không có** `route`/`filters`/`page`." Rule 9 (bảng `now`/`today`/`financialDate`, mốc
11:00 giờ VN) giữ nguyên chữ — đúng cho cả hai kênh vì §6.3 đã cấp đủ 4 field.

### 7.2 `agent/instructions/90-channel.ts` (dynamic — F-10)

```ts
/**
 * Instruction riêng theo kênh — nạp ở `session.started` (F-10).
 *
 * VÌ SAO DYNAMIC, KHÔNG THÊM VÀO FILE .md DÙNG CHUNG: 5 file `.md` hiện tại là system prompt của
 * MỌI session. Nhồi thêm "nếu bạn đang ở Telegram thì..." vào đó là dạy model một nhánh điều kiện
 * mà nó phải tự đoán đang ở nhánh nào — dạng lỗi kinh điển. Dynamic thì mỗi session chỉ thấy đúng
 * một khối, không có nhánh nào để đoán sai.
 *
 * Dùng `session.started` (không phải `turn.started`): giá trị ổn định suốt session ⇒ giữ được
 * prompt cache prefix (docs dynamic-capabilities.md §Dynamic instructions cảnh báo đúng điểm này).
 */
export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      if (ctx.session.auth.current?.attributes.channel !== "telegram") {
        return null; // web: không thêm gì
      }
      return defineInstructions({ content: TELEGRAM_INSTRUCTIONS });
    },
  },
});
```

Nội dung `TELEGRAM_INSTRUCTIONS` (viết dưới dạng **ghi đè tường minh**, nêu rõ nó thay thế mục nào):

1. **Không có thẻ/bảng nào được render.** Mục "Kết quả tra cứu đã được hiển thị sẵn" và "Mọi thẻ
   nằm TRƯỚC phần chữ" của `50-answer-shape.md` **không áp dụng ở kênh này**. Con số nào cần thì
   phải nằm trong chữ. Nhưng vẫn giữ nguyên tinh thần gọn: trả lời đúng thứ được hỏi, không đổ cả
   bảng cấu hình vào tin nhắn.
2. **Không markdown.** Tin nhắn gửi dạng plain text (F-12) nên `**đậm**`, `# tiêu đề`, bảng `|...|`
   hiện nguyên ký tự. Dùng gạch đầu dòng `-`, xuống dòng, và số dạng `1.234.567 VND`.
3. **Giới hạn độ dài.** Nhắm ≤ 1.200 ký tự/câu trả lời; nhiều số thì nêu 3-5 mốc quan trọng nhất
   rồi gửi link trang chi tiết. (Trần cứng 4096 do eve tự split, nhưng 3 tin nhắn liên tiếp trên
   điện thoại là không đọc được.)
4. **Link phải là URL đầy đủ**, dán trực tiếp vào chữ (Telegram tự bắt link). Không viết "bấm nút
   bên dưới", không viết "xem bảng phía trên" — không có nút, không có bảng.
5. **Không có trang đang mở**: câu hỏi kiểu "kỳ này", "trang này" ⇒ hỏi lại đúng một câu, KHÔNG suy
   từ `filters`/`page` (không tồn tại ở đây).
6. **Không đọc lại nguyên văn tin nhắn của staff** và không nhắc lại danh tính họ mỗi lượt.

### 7.3 `navigateTo` — href tuyệt đối ngoài web (F-09)

```ts
execute: async (input, ctx) => {
  const result = buildNavHref(...);
  if (!result.ok) { return result; }
  // Ngoài web không có router client để push → href tương đối vô dụng, phải là URL bấm được.
  const isWeb = ctx.session.auth.current?.attributes.channel === "web";
  return {
    ok: true,
    href: isWeb ? result.href : `${env.NEXT_PUBLIC_SITE_URL}${result.href}`,
    label: result.appliedLabel,
    autoNavigate: isWeb ? NAV_REGISTRY[input.page].autoNavigate : false,
  };
}
```

`autoNavigate: false` ngoài web vì không có gì để auto-navigate; để `true` sẽ khiến model nghĩ trang
đã tự mở và nói "đã mở trang cho bạn" — sai sự thật.

---

## 8. Audit — chỉ ghi sự kiện QUYỀN, không ghi hoạt động hội thoại

### 8.1 Audit vs observability — phân giới theo *câu hỏi cần trả lời* (trả lời câu hỏi 4)

User đúng khi nghi ngờ: bản plan trước ghi `channel.agentTurn` vào `audit_logs` là **sai chỗ**.
Sửa quyết định. Tiêu chí phân giới không phải "quan trọng hay không" mà là **ai sẽ đi tìm nó, và tìm
để làm gì**:

| | `audit_logs` (Mongo, `packages/audit`) | Observability (Vercel agent-runs / Langfuse) |
|---|---|---|
| Câu hỏi phục vụ | "**Ai được cấp quyền gì, khi nào, do ai?**" | "Lượt này chạy sao? Vì sao chậm/sai/tốn token?" |
| Người đọc | Admin, compliance, chính staff (`/me/activity`) | Dev, khi debug |
| Vòng đời | **Giữ lâu** — bằng chứng | TTL ngắn (14–30 ngày), rẻ, xoá được |
| Số lượng | Ít, mỗi record là 1 quyết định | Nhiều, mỗi record là 1 bước kỹ thuật |
| Mất đi thì sao | **Không truy vết được sự cố bảo mật** | Chỉ khó debug hơn |

Áp vào Telegram:

| Sự kiện | Ghi ở đâu | Lý do |
|---|---|---|
| `channel.link` (staff link Telegram) | ✅ **audit** | **Cấp quyền truy cập mới** vào dữ liệu tài chính từ 1 thiết bị mới. Tương đương `enableMfa`. Nếu account bị chiếm, đây là dòng duy nhất chỉ ra kẻ đã cắm Telegram của nó vào lúc nào. |
| `channel.unlink` | ✅ audit | Thu hồi quyền — cần cặp với link để dựng timeline. |
| `channel.linkFailed` (code sai) | ✅ audit (`status: failure`) | Tín hiệu **dò code**. Nhưng có rate limit 5 lần/1h (§5.4) nên **không** phình. |
| `channel.revokedByPolicy` (account suspend ⇒ tự revoke) | ✅ audit | Hành động tự động của hệ thống lên quyền — phải giải trình được. |
| **Mỗi lượt hỏi-đáp (`agentTurn`)** | ❌ **BỎ khỏi audit** → observability | Đây là **hoạt động**, không phải thay đổi quyền. Ghi vào audit thì 20 staff × 30 lượt/ngày = **600 record/ngày = ~18k/tháng** chỉ để nói "staff đã hỏi gì" — trong khi Vercel agent-runs đã có sẵn **đầy đủ hơn** (full transcript, từng tool call, token, latency) mà không tốn write của ta. |
| Người lạ bị drop (G4) | ❌ audit → `console.warn` | Lượng không kiểm soát được (internet). Đưa vào audit là mở cửa cho người ngoài **ghi vào bảng nghiệp vụ** của ta — đó là amplification vector, không phải tính năng. |

**Vì sao vẫn cần audit cho link/unlink chứ không đẩy hết sang Langfuse:** observability là hạ tầng
**dev**, TTL ngắn, không có UI cho staff/compliance, và không ai coi log Vercel là bằng chứng khi
điều tra. Ngược lại `/me/activity` (đã có) là nơi **chính staff** phát hiện "Telegram của tôi bị ai
link" — chức năng bảo mật thật, không thay được bằng trace.

**Lượng write thêm vào `audit_logs`:** ≈ **1 record/staff/lần link** (một lần duy nhất, có thể vài
năm không đổi) + vài `linkFailed`. Tức gần như **bằng 0** — đúng như user lo ngại, và giải quyết bằng
cách bỏ `agentTurn`, không bằng cách bỏ audit.

### 8.2 Vẫn cần một thứ ở tầng giữa: `lastSeenAt`

Bỏ `agentTurn` thì mất khả năng biết "link này còn dùng không" (để dọn link chết). Thay bằng **1 field
`lastSeenAt` trên chính `channel_links`** — cập nhật `void` không `await` (không chặn đường nóng),
ghi đè chứ không cộng dồn ⇒ **O(1) storage**, không phình.

```ts
// apps/backoffice/agent/hooks/channel-audit.ts
export default defineHook({
  events: {
    "turn.completed"(_event, ctx) {
      // F-15: chỉ lượt đến từ Telegram. KHÔNG ghi audit_logs (§8.1) — chỉ chạm lastSeenAt.
      if (ctx.channel.kind !== "telegram") {
        return;
      }
      const telegramUserId = ctx.session.auth.current?.attributes.platformUserId;
      if (typeof telegramUserId !== "string") {
        return;
      }
      // void: lỗi ghi lastSeenAt không được làm hỏng lượt trả lời của staff.
      void touchLastSeenUseCase.run({ platform: ChannelPlatform.Telegram, platformUserId });
    },
  },
});
```

**Bổ sung vào `packages/audit`** (`Record` type ép buộc nên quên label sẽ lỗi compile —
xem `audit-log.enums.ts` quy tắc mở rộng số 3):

- `AuditCategory.Channel = "channel"`
- `AuditTargetType.ChannelLink = "channel_link"`
- `AUDIT_ACTIONS.channel = { link, unlink, linkFailed, revokedByPolicy }` — **không có `agentTurn`**.
- Label tương ứng trong `packages/audit/src/entities/labels.ts`.
- `SELF_ACTIVITY_ACTIONS`: **thêm** `channel.link` + `channel.unlink` — đúng tinh thần "sự kiện bảo
  mật SELF" của trang `/me/activity` (actor = target, giống `enableMfa`): staff phải tự thấy được
  "Telegram của tôi vừa được liên kết" để phát hiện bị chiếm tài khoản.

`channel.linkFailed` ghi cả khi code sai (`status: failure`, `actorId: "system"` vì chưa biết ai) —
đây là tín hiệu dò code cần thấy được.

---

## 9. Bảo mật — threat model & đối phó

| # | Nguy cơ | Đối phó | Verify |
|---|---|---|---|
| T-01 | Người lạ tìm ra bot và nhắn | Allowlist G4 fail-closed ⇒ **drop im lặng** (§0.3); chỉ `/start`/`/help`/`/link` trả 1 câu trung tính | §14.1, §14.1b |
| T-02 | Giả webhook (POST trực tiếp vào `/eve/v1/telegram`) | eve verify `X-Telegram-Bot-Api-Secret-Token` trước mọi xử lý (F-01) | curl không header → reject (§14.2) |
| T-03 | Bot token bị lộ ⇒ kẻ khác đọc được update, gửi tin danh nghĩa bot | Token chỉ trong Vercel env (không `.env` commit, không log). **Rotate quy trình**: BotFather `/revoke` → set env mới → `setWebhook` lại | quy trình vận hành |
| T-04 | Rò thông tin qua câu từ chối | Mặc định là **im lặng** (không có câu từ chối để rò). 3 lệnh public dùng text tập trung 1 const (§6.2); instruction `30-security.md` đã cấm lộ tên tool/field | §14.1b |
| T-05 | Code liên kết bị chia sẻ / dò | TTL 600s · 1 code/account · single-use atomic (`GETDEL`) · hash-at-rest · 5 lần sai = chặn 1h · audit `linkFailed` | §14.3, §14.5 |
| T-06 | Staff bị khoá/mất role nhưng vẫn dùng Telegram | G5 load account MỖI lượt (không snapshot) → tự revoke link + audit | §14.12, §14.13 |
| T-07 | Rò dữ liệu **hỏi-đáp** trong group chat | v1: **G0 drop mọi `chatType ≠ private`** (lớp code) + **BotFather bật Privacy Mode** (lớp nền tảng: bot không nhận tin thường trong group). ⚠️ **Allow Groups phải BẬT** vì cần add bot vào group để broadcast (§11) ⇒ lớp phòng vệ thật là G0, không phải cấu hình BotFather. Cộng F-20 (nút HITL ai bấm cũng được) ⇒ hoãn hỏi-đáp group sang G4 (§0.1). | §14.28, §14.29 |
| T-07b | Rò dữ liệu **broadcast**: người ngoài nhóm điều hành ở trong group nhận báo cáo | Nội dung báo cáo chỉ có **số tổng hợp**, không PII, không bóc tenant (§11.5). Kiểm soát thành viên group là việc **hành chính** (R-07) — cần chốt Q7. | §14.26 |
| T-08 | Mất/mượn điện thoại staff | Không giải được ở tầng bot ⇒ giảm thiệt hại: chỉ tool ĐỌC (T-09), `/unlink` từ cả 2 phía **+ admin unlink hộ (§6.5b)**, audit đủ để truy vết, rate limit chặn hút dữ liệu quy mô lớn | §14.17, §14.23 |
| T-09 | Leo thang qua tool sandbox/ghi | `denyOutsideWeb()` chặn cứng nhóm sandbox (§6.6). Nguyên tắc: **Telegram = read-only** | §14.7 |
| T-10 | Prompt injection qua nội dung tin nhắn Telegram **và qua `username` do người dùng tự đặt** (F-22: eve chèn `username` vào context block mỗi lượt) | Tin nhắn staff là **dữ liệu**, không phải instruction — `30-security.md` đã có quy tắc cho `web_fetch`, mở rộng nói rõ áp cả nội dung tin nhắn **và metadata người gửi** từ kênh ngoài. `navigateTo` dùng enum đóng nên không bịa được path. Ảnh bị tắt (§0.2 A-2) nên không có kênh injection qua chữ trong ảnh. | §14.10 |
| T-11 | PII người chơi đi qua hạ tầng Telegram | **Quyết định cần chốt (§16 Q2)**: giữ nguyên như web, hay chặn `getPlayerAccountInfo`/`getPlayerInsight` ngoài web. Mặc định đề xuất: **cho phép**, vì staff đã có quyền xem; nhưng thêm 1 dòng instruction "không chủ động liệt kê PII khi câu hỏi không yêu cầu" | rà tay |
| T-12 | Webhook bị flood (DoS/tốn tiền model) | G6 rate limit theo user + G4 chặn trước khi tới model ⇒ người lạ không tạo được model call nào | §14.14 |
| T-13 | **Gửi trùng `dailyReport`** (Vercel Cron không exactly-once) | Redis SETNX `daily-report:<financialDate>` TTL 48h trước khi gửi (§11.3) | §14.27 |
| T-14 | Bot bị add vào **group lạ** (ai biết username bot đều add được) | G0 drop mọi tin từ group ⇒ không hỏi-đáp được. Broadcast chỉ gửi vào **đúng 1 `chatId` từ env** (§11.4) ⇒ group lạ không nhận được gì. Cân nhắc ở G4: tự `leaveChat` nếu `chatId` không nằm trong registry. | §14.28 |

**Tại sao KHÔNG dùng `defaultTelegramAuth` của eve:** nó tạo principal `telegram:<userId>` cho
**mọi** người nhắn bot (`dist/.../telegram/defaults.js`) — nghĩa là mặc định eve cho người lạ vào
agent. Với dữ liệu tài chính đó là fail-open. Ta override `onMessage` hoàn toàn (F-05) và
`principalId` là `accountId` nội bộ, không phải id Telegram.

---

## 10. Cấu hình & deploy

### 10.1 BotFather (làm trước khi code)

| Bước | Giá trị |
|---|---|
| `/newbot` | 1 bot cho **staging**, 1 bot cho **production** — KHÔNG dùng chung (staging trả số liệu thật cho nhóm test là rò dữ liệu; và 1 bot chỉ đăng ký được 1 webhook URL). |
| `/setprivacy` | **Enabled** (bot chỉ thấy tin nhắn nhắc tới nó trong group) |
| `/setjoingroups` | **Enabled** — ⚠️ **ĐỔI so với bản trước**: §11 cần add bot vào group công ty để broadcast. Lớp chặn hỏi-đáp group là **guard G0 trong code** (drop mọi `chatType ≠ private`), không phải cấu hình này (T-07). |
| `/setcommands` | `link`, `unlink`, `whoami`, `help` |
| `/setdescription` | Trung tính: "Trợ lý nội bộ. Cần liên kết tài khoản trước khi sử dụng." — không nêu tên công ty/hệ thống |

### 10.2 Env — `src/env.ts` + `.env.example`

```ts
/**
 * Telegram channel (`agent/channels/telegram.ts`). Bắt buộc CÙNG NHAU:
 * thiếu token thì không gửi được tin, thiếu secret token thì eve reject mọi webhook (fail-closed
 * đúng ý — xem `verify.d.ts`). Optional để deployment chưa bật kênh này vẫn build được; khi bật
 * thì phải set cả hai.
 *
 * ⚠️ Tên `TELEGRAM_WEBHOOK_SECRET_TOKEN` là do eve quy định (fallback trong
 * `resolveTelegramWebhookSecretToken`) — KHÔNG đổi thành `..._SECRET`.
 */
TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(32).optional(),
/** Username bot (không có `@`) — để eve nhận diện mention; v1 private-only nên chỉ để phòng sau. */
TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
/**
 * Chat id của group công ty nhận `dailyReport` (§11.4). Group id là **số ÂM** dạng string
 * (VD `-1001234567890`) — dùng `z.string()`, KHÔNG `z.number()`.
 *
 * Rỗng ⇒ schedule KHÔNG gửi cho ai (fail-closed, §11.4) — không fallback sang DM.
 * Lưu ở env chứ không DB vì chỉ 1 group, đổi rất ít, và tránh việc trỏ báo cáo sang group lạ qua UI.
 */
TELEGRAM_REPORT_CHAT_ID: z.string().min(1).optional(),
```

⚠️ `.env.example`: **chỉ thêm dòng khoá rỗng, KHÔNG tạo/ghi đè `.env*` nào** (rule
`no-env-file-modification.mdc`). Secret token sinh bằng `openssl rand -hex 32`.

### 10.3 Đăng ký webhook (thủ công — F-01)

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<domain>/eve/v1/telegram",
       "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
       "allowed_updates":["message","callback_query"],
       "drop_pending_updates":true}'

# Verify — phải thấy đúng url, pending_update_count thấp, last_error_message rỗng
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

`allowed_updates` giới hạn 2 loại: `message` (tin) + `callback_query` (HITL inline keyboard). Không
mở `edited_message` — staff sửa tin cũ sẽ tạo lượt lặp mà eve không biết là bản sửa.
`drop_pending_updates: true` khi đăng ký lại để không xử lý hàng đợi tin cũ.

**Chạy local:** Telegram cần HTTPS public ⇒ `ngrok http 3000` rồi `setWebhook` vào URL ngrok với bot
**dev riêng** (bot thứ 3). Đây là lý do cần ≥2 bot, thực tế là 3.

### 10.4 Vercel

- Region: `vercel.ts` đã pin `sin1` (gần MongoDB Atlas `ap-southeast-1`) — Telegram không đổi gì.
- `withEve()` trong `next.config.ts` đã mount mọi channel ⇒ **không cần thêm route Next.js nào**.
- Env set ở Vercel project (staging/production **token khác nhau**).
- Timeout: mặc định 300s (Fluid Compute) đủ cho lượt agent; không cần cấu hình riêng.

---

## 11. `dailyReport` — broadcast tổng kết ngày tài chính (trả lời câu hỏi 7)

### 11.0 Chốt giờ chạy — 12:00 VN, và vì sao

User yêu cầu "sau 12h sáng, sau khi ngày tài chính mới đã qua 1 tiếng". Khớp đúng với hằng số hệ
thống: `financialDateTodayVN()` (`packages/shared/src/utils/date.ts:182`) đổi ngày tài chính lúc
**11:00 VN**. Vậy 12:00 VN = **T+1 giờ** sau khi ngày tài chính lật ⇒ mọi entry của "ngày hôm qua"
đã đóng và settle xong.

```
cron: "0 5 * * *"   // 05:00 UTC = 12:00 VN. Vercel Cron chạy theo UTC — KHÔNG ghi "0 12 * * *".
```

**Ngày báo cáo = `financialDateYesterdayVN()`**, tức khi cron chạy lúc 12:00 ngày N thì
`financialDateTodayVN()` đã trả `N` ⇒ ngày cần tổng kết là `N-1`. **Không** dùng `yesterdayVN()`
(ngày lịch) — sai 1 ngày và sai theo cách khó phát hiện. Nếu helper `financialDateYesterdayVN()` chưa
có thì **thêm vào `packages/shared/src/utils/date.ts`** cạnh `financialDateTodayVN()`, không tự tính
tay trong schedule.

### 11.1 Kiến trúc: 2 luồng TÁCH BIỆT, dùng chung 1 bot

Điểm dễ sai nhất: gộp broadcast vào cùng cơ chế với hỏi-đáp. **Phải tách.**

```
[Cron 05:00 UTC] → schedule dailyReport
                   ├─ use-case tổng hợp số liệu (thuần server, KHÔNG qua model)
                   ├─ format text thuần (F-12: không markdown)
                   └─ to(telegram, { chatId: REPORT_CHAT_ID }).send(text, { auth: appAuth })
                                                  ↑
                            group công ty — KHÔNG cần link, KHÔNG cần allowlist
                            (một chiều: bot chỉ GHI vào group, không ĐỌC từ group)

[Webhook] → onMessage → guard chain §4 → G0 drop mọi chat ≠ private
                                          ↑ group KHÔNG hỏi-đáp được ở v1 (§0.1)
```

**Hệ quả trực tiếp cho câu hỏi "người lạ trong group có gọi/thực hiện lệnh được không":**
**KHÔNG.** Guard G0 drop toàn bộ `chatType ≠ "private"` **trước** mọi thứ khác. Trong group, bot là
**loa một chiều**: gõ `@bot doanh thu hôm nay` ⇒ không phản hồi, không tạo session, 0 token. Người đã
link cũng vậy — muốn hỏi thì mở chat riêng với bot. Cộng thêm lớp nền tảng: **BotFather bật Privacy
Mode** ⇒ bot còn không *nhận* được tin thường trong group (chỉ nhận command và reply vào chính nó).
Hai lớp độc lập.

### 11.2 Nội dung báo cáo — tính bằng use-case, KHÔNG hỏi model

**Quyết định quan trọng:** số liệu báo cáo được tính bởi **use-case xác định (deterministic)**, không
để model tự gọi tool rồi tự viết văn. Lý do:

| | Use-case tính sẵn (chọn) | Để model tự tổng hợp |
|---|---|---|
| Tính đúng số | Đảm bảo — cùng code với trang report | Model có thể diễn giải/làm tròn sai |
| Ổn định định dạng | Cố định, so sánh được giữa các ngày | Đổi câu chữ mỗi ngày |
| Chi phí | ~0 | 1 lượt agent/ngày |
| Lỗi khi model down | Không ảnh hưởng | Mất báo cáo |

Model chỉ nên tham gia ở phần **bình luận bất thường** (nếu muốn) ở G3.5 — không phải v1 của báo cáo.

```ts
// apps/backoffice/agent/schedules/daily-report.ts
export default defineSchedule({
  cron: "0 5 * * *", // 05:00 UTC = 12:00 VN — 1 giờ sau khi ngày tài chính lật (11:00 VN)
  async run({ to, waitUntil, appAuth }) {
    const financialDate = financialDateYesterdayVN();

    // Tính số liệu bằng use-case xác định — KHÔNG qua model (§11.2).
    const report = await buildDailyReportUseCase.run({ financialDate });

    // F-12: delivery mặc định là plain text, KHÔNG parse_mode ⇒ tuyệt đối không markdown.
    const text = formatDailyReportText(report);

    // waitUntil: cron chỉ cần trả 2xx nhanh, gửi Telegram không chặn response.
    waitUntil(
      to(telegram, { chatId: env.TELEGRAM_REPORT_CHAT_ID })
        .send(text, { auth: appAuth }), // F-18: principal của agent, KHÔNG mượn danh staff
    );
  },
});
```

**Nội dung tối thiểu** (dùng lại đúng use-case của các trang report đang có — không viết lại phép
tính): doanh thu, số vé/entry, payout, GGR, jackpot contribution, top game theo doanh thu, số draw đã
settle / còn treo, cảnh báo settle stuck. Chi tiết chốt sau khi rà `apps/backoffice/src/server/use-cases`.

**Định dạng:** text thuần, dùng khoảng trắng căn cột, **cấm** `|` table và `**bold**` (F-12 — hiện ra
literal). Giữ dưới 4096 ký tự để không bị split giữa bảng (`splitTelegramMessageText` cắt theo `\n`).

### 11.3 Idempotency — cron có thể chạy 2 lần

Vercel Cron **không đảm bảo exactly-once**. Gửi trùng báo cáo vào group công ty là lỗi thấy ngay.
Chốt: **Redis SETNX** `daily-report:<financialDate>` TTL 48h **trước khi** gửi; đã có key ⇒ bỏ qua và
log. Dùng `packages/cache` namespace hiện có, không tự viết client.

### 11.4 Cấu hình group nhận báo cáo

| Việc | Cách làm |
|---|---|
| Lấy `chatId` của group | Add bot vào group → gửi 1 tin bất kỳ → `getUpdates` đọc `chat.id`. Group id là **số âm** (VD `-1001234567890`) — lưu dạng string. |
| Lưu ở đâu | **Env `TELEGRAM_REPORT_CHAT_ID`** (không phải DB) ở v1: 1 group duy nhất, đổi rất ít, và env tránh được việc ai đó trỏ báo cáo sang group lạ qua UI. Khi cần nhiều group → chuyển sang collection `channel_report_targets` ở G3.5. |
| Quyền bot trong group | Chỉ cần quyền gửi tin. **Không** cấp admin. |
| Nhầm group | Thêm guard: nếu `TELEGRAM_REPORT_CHAT_ID` rỗng ⇒ schedule **không gửi** + log error (fail-closed, không fallback sang DM ai cả). |

### 11.5 Thành viên group chưa link — có sao không?

Không sao, **vì thiết kế một chiều**: họ chỉ **đọc** được nội dung ta đã chủ động duyệt. Nhưng phải ý
thức rõ: **nội dung báo cáo = mức bảo mật thấp nhất của group.** Ai vào được group là đọc được số liệu
tổng hợp toàn công ty. Vì vậy:

- Báo cáo **chỉ chứa số tổng hợp** — **không** PII người chơi, **không** số liệu bóc theo từng tenant
  cụ thể nếu group có người không được xem tenant đó.
- Group nhận báo cáo do **admin quản lý thành viên** — đây là kiểm soát **hành chính**, không phải kỹ
  thuật. Ghi rõ vào tài liệu vận hành (§12 R-07).

### 11.6 Proactive gửi cho cá nhân (opt-in) — vẫn hoãn sang G3

Khác với broadcast group, gửi DM cho từng staff cần allowlist chín + `proactiveOptIn` (§5.1):

```ts
const targets = await listProactiveTargets(); // status=active AND proactiveOptIn=true
```

3 điểm phải nhớ khi bật:

1. **Opt-in mới gửi** — mặc định `false` (§5.1). Không broadcast vào DM.
2. **`auth: appAuth`** là principal của chính agent (F-18), KHÔNG mượn danh staff ⇒ nếu sau này có
   tool ghi, không có đường để schedule hành động dưới danh nghĩa người thật.
3. Proactive send vào **cùng chat riêng** ⇒ **cùng continuation token** ⇒ nối vào **cùng session** đang
   chat (F-13). Nghĩa là báo cáo chèn vào giữa hội thoại hôm qua, và ăn vào cùng
   `maxInputTokensPerSession` (F-14). Phải đo lại trần token trước khi bật.
   *Lưu ý:* broadcast **group** không gặp vấn đề này (F-21: group có conversationId riêng theo tin).

---

## 12. Rủi ro & việc chưa giải được (ghi để không bất ngờ)

| # | Vấn đề | Trạng thái |
|---|---|---|
| R-01 | Session Telegram **tách** session web (F-13) — staff hỏi trên Telegram không nối tiếp được hội thoại đang chat ở `/ai` | Giới hạn thiết kế của eve (channel-local continuation). Ghi vào hướng dẫn staff. Bridge được về lý thuyết nhưng phức tạp & rủi ro rò ngữ cảnh chéo ⇒ KHÔNG làm. |
| R-02 | Không có `/new` (reset hội thoại): `onMessage` không có `continuation.rekey` (F-19) | v1 chấp nhận. Cách vòng: dùng event handler + `rekey`, hoặc chờ eve mở API. Hệ quả: hội thoại dài dồn vào 1 session → gặp R-03. |
| R-03 | Session sống mãi ⇒ chạm `maxInputTokensPerSession` (20M) sau ~300 lượt ⇒ eve park + hỏi Approve/Stop (F-14) | Hành vi đúng của eve, không phải bug. Ghi vào hướng dẫn: "bấm Approve để tiếp tục". Theo dõi thực tế trước khi nghĩ tới nâng trần. |
| R-04 | eve không dedupe `update_id` (F-16); Telegram retry khi không nhận 2xx | Guard chain nhanh + không throw. Nếu thực tế thấy lượt lặp: thêm SETNX Redis `tg-update:<update_id>` TTL 300s trong `onMessage`. |
| R-05 | ~~Chưa có UI admin xem/huỷ link của người khác~~ | ✅ **Đã giải** — nâng vào v1 ở §6.5b (user yêu cầu, câu hỏi 8). |
| R-06 | Tin nhắn & câu trả lời (có số liệu tài chính) nằm trên hạ tầng Telegram, ngoài kiểm soát | **Rủi ro chấp nhận có ý thức** — đánh đổi để có tính tiện dụng. Giảm thiểu: read-only, không PII chủ động, độ dài câu trả lời ngắn. Cần nêu rõ khi trình bày với người quyết định. |
| R-07 | Group nhận `dailyReport`: ai vào group là đọc được số tổng hợp toàn công ty (§11.5) | Kiểm soát **hành chính** (admin quản lý thành viên), không phải kỹ thuật — Telegram không cho bot lọc người đọc. Giảm thiểu: báo cáo chỉ chứa số tổng hợp, không PII, không bóc theo tenant. Ghi vào tài liệu vận hành. |
| R-08 | **F-20: nút HITL ai bấm cũng được**, eve dispatch callback với `auth: null` và không gọi `onCallbackQuery` cho prefix HITL ⇒ không vá được từ userland | Trong private chat: vô hại (1 người). Trong group: là lý do **cứng** để hoãn hỏi-đáp group (§0.1). Đối phó ở v1: mọi tool nguy hiểm dùng `denied` **không** `ask` (§6.6) ⇒ không sinh nút để bấm sai. Nếu G4 cần HITL group → phải chờ eve mở API kiểm tra người bấm. |

---

## 13. Thứ tự thi hành (gate — không nhảy bước)

**G1 — Data + link flow (chưa cần bot chạy).**
`packages/identity` entity → repo/mapper → index (tạo tay) → 5 use-case → 3 route BO → trang
`/me/channels` → **cột "Kết nối" + unlink-by-admin ở `/accounts/company` (§6.5b)** → audit enums.
*Xong khi:* sinh code, xem trạng thái, unlink (tự + admin) hoạt động trên web; audit `channel.link`
xuất hiện ở cả `/me/activity` và `/audit-logs`.

**G2 — Channel Telegram reactive (phần chính).**
`env.ts` → BotFather (3 bot, **bật Privacy Mode**; **Allow Groups vẫn BẬT** vì §11 cần add bot vào
group — lớp chặn hỏi-đáp group là guard G0 trong code, xem T-07) → `telegram-guards.ts` +
test → `channel-principal.ts` → `channels/telegram.ts` → `channel-approval.ts` + gắn vào 5 tool
sandbox + `channel: "web"` cho `eve.ts` → `90-channel.ts` → sửa `20-time-context.md` + `navigateTo` →
`channel-audit.ts` hook (chỉ `lastSeenAt`, §8.2) → ngrok test local → deploy staging + `setWebhook`.
*Xong khi:* §14 mục 1-19 xanh trên staging (+ 20-25 đã xanh từ G1).

**G3 — `dailyReport` broadcast vào group công ty (§11).** Chạy **sau** G2 (không song song): guard G0
drop group phải có trong code TRƯỚC khi bot được add vào group thật.
Thứ tự: `financialDateYesterdayVN()` vào `packages/shared` → `buildDailyReportUseCase` (dùng lại
use-case report sẵn có) → `formatDailyReportText` (plain text, F-12) → SETNX idempotency (§11.3) →
`env.TELEGRAM_REPORT_CHAT_ID` → `schedules/daily-report.ts` → chạy tay 1 lần bằng cách gọi endpoint
cron trên staging trước khi bật cron thật.
*Xong khi:* §14 mục 26-32 xanh.

**G3.5 — Proactive DM cá nhân (opt-in).** Chỉ sau khi G2 chạy ổn ≥1 tuần và có staff opt-in thật (§11.6).

**G4 — Hỏi-đáp trong group.** Chỉ khi có yêu cầu thật. **Điều kiện tiên quyết** (§0.1): registry
`channel_groups` + `visibilityTier` + **không HITL trong group** (R-08). Không làm nếu chỉ để "cho tiện".

**G5 — Slack.** §15.

---

## 14. Verify (checklist chạy trên staging)

| # | Ca | Kỳ vọng |
|---|---|---|
| 1 | Người lạ nhắn "doanh thu hôm nay bao nhiêu" | **Im lặng hoàn toàn** (§0.3), không tạo session, 0 model call, chỉ 1 dòng `console.warn`. Audit `channel_links` KHÔNG có record mới. |
| 1b | Người lạ gửi `/help` và `/link abc` | Trả đúng 1 câu trung tính, không tên hệ thống, không xác nhận có allowlist |
| 2 | `curl POST /eve/v1/telegram` không header secret | Reject (không 2xx business), không tạo session, không query DB |
| 3 | `/link` mã sai 5 lần | Lần 6 bị chặn 1 giờ; 5 audit `channel.linkFailed` |
| 4 | Link đúng → hỏi "doanh thu hôm nay" | Trả số đúng **ngày tài chính** (không phải `today`); `lastSeenAt` được cập nhật; `audit_logs` **KHÔNG** có record cho lượt này (§8.1) |
| 5 | Cùng lượt: mã đã dùng gửi lại | Từ chối (single-use) |
| 6 | Gửi ảnh + gửi PDF | "chỉ xử lý tin nhắn văn bản"; KHÔNG có model call, KHÔNG có file nào được fetch |
| 7 | Hỏi "chạy `ls` trong sandbox" | Model báo không dùng được ở kênh này (approval `denied`), KHÔNG có inline keyboard |
| 8 | Câu hỏi khiến gọi `web_fetch` | Inline keyboard Approve/Deny; Approve → chạy tiếp; Deny → model giải thích (HITL, F-11) |
| 9 | Hỏi "mở trang báo cáo tài chính" | Trả **URL đầy đủ** `https://<domain>/...` bấm được; không nói "đã mở trang" |
| 10 | Câu hỏi cần nhiều số (cấu hình game) | Text thuần, không `**`/`\|`, ≤ ~1.200 ký tự, có link chi tiết |
| 11 | Câu trả lời > 4096 ký tự (ép bằng câu hỏi rộng) | Tự split thành nhiều tin, không mất chữ |
| 12 | Admin suspend account đó → nhắn tiếp | Bị từ chối ngay lượt sau; link chuyển `revoked` + audit `revokedByPolicy` |
| 13 | Gỡ role Staff → nhắn tiếp | Như mục 12 |
| 14 | Gửi 25 tin trong 1 phút | Tin 21+ bị chặn kèm thông báo; không sinh model call |
| 15 | Chat giữa chừng → redeploy → nhắn tiếp | Còn ngữ cảnh (durable session sống qua deploy) |
| 16 | `vercel agent-runs` | Thấy trace lượt Telegram đầy đủ (tool call, token, latency) — đây là nơi thay `agentTurn` audit (§8.1) |
| 17 | `/unlink` rồi nhắn tiếp | Về trạng thái chưa link; audit `channel.unlink`; hiện ở `/me/activity` |
| 18 | Cùng account link Telegram thứ 2 | Link cũ bị thay (unique index), có audit; Telegram cũ mất quyền |
| 19 | Telegram user đã link account A, thử link account B | Từ chối (unique `platform_user_unique`) |

**Ca cho UI admin (§6.5b — G1):**

| # | Ca | Kỳ vọng |
|---|---|---|
| 20 | Mở `/accounts/company` khi 20 account, 3 đã link | Cột "Kết nối" đúng; **chỉ 1 query** cho toàn bộ link (kiểm bằng log/explain — không N+1) |
| 21 | Account chưa link | Hiện `—`, không badge |
| 22 | Account đã link nhưng chưa dùng | Badge outline, tooltip `lastSeenAt` rỗng |
| 23 | Admin bấm "Huỷ liên kết Telegram" của staff X | Dialog xác nhận có tên account; sau khi OK: link `revoked`/`ByAdmin`, audit có `actorId`=admin + `targetId`=X, staff X nhắn bot bị từ chối ngay |
| 24 | Staff (không Admin) gọi thẳng API unlink của người khác | 403 — `auth({ roles: [CompanyRole.Admin] })` |
| 25 | Xem `platformUserIdMasked` | Chỉ 4 số cuối, không lộ id đầy đủ trên bảng danh sách |

**Ca cho `dailyReport` (§11 — G3):**

| # | Ca | Kỳ vọng |
|---|---|---|
| 26 | Chạy tay schedule lúc 12:05 VN ngày N | Gửi 1 tin vào group; số liệu đúng của ngày tài chính `N-1` (đối chiếu tay với trang report) |
| 27 | Chạy tay lần 2 cùng ngày | **Không gửi** (SETNX idempotency §11.3), có log "đã gửi" |
| 28 | Member group **chưa link** gõ `@bot doanh thu hôm nay` | **Không phản hồi** (G0 drop group), 0 model call |
| 29 | Member group **đã link** gõ `@bot ...` trong group | Cũng **không phản hồi** — phải mở chat riêng (§11.1) |
| 30 | `TELEGRAM_REPORT_CHAT_ID` rỗng/sai | Schedule log error, **không** fallback gửi cho ai; không crash cron |
| 31 | Báo cáo dài | Text thuần không markdown; nếu >4096 tự split đúng chỗ, bảng không bị cắt giữa dòng |
| 32 | Bot bị kick khỏi group rồi cron chạy | Log error rõ ràng (Telegram trả 403), không retry vô hạn, không crash |

---

## 15. Slack (khi có yêu cầu — sau Telegram)

Tái dùng **toàn bộ** §5 (`platform: "slack"`, đã là const object mở rộng được), §6.3 (`channel:
"slack"`), §6.6, §7.2 (thêm nhánh Slack: Block Kit render markdown nên khác Telegram), §8. Việc mới
chỉ còn `agent/channels/slack.ts` + flow link đổi platform id. Đây chính là lợi ích của việc **không**
đặt tên `telegram_*` cho collection và **không** hardcode `"telegram"` rải rác.

---

## 16. Câu cần chốt trước khi code

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Bao nhiêu staff dùng v1? Ai được phép link? | Mọi account role Staff/super (dùng lại đúng điều kiện của `channels/eve.ts`) — không thêm allowlist thủ công. |
| Q2 | Cho tra PII người chơi qua Telegram? (T-11) | **Cho phép** + instruction "không chủ động liệt kê PII". Nếu compliance nói không → thêm `getPlayerAccountInfo`/`getPlayerInsight` vào `denyOutsideWeb`. |
| Q3 | ~~Group chat có cần không?~~ | ✅ **Đã chốt (18/08)**: group = **chỉ broadcast** `dailyReport` (§11); hỏi-đáp trong group hoãn G4 (§0.1). |
| Q4 | Ai vận hành bot (BotFather owner, rotate token)? | Cần 1 người chịu trách nhiệm — token là bí mật cấp production. |
| Q5 | Trần rate limit 20 tin/5 phút hợp lý? | Bắt đầu ở đó, đo bằng `vercel agent-runs` (không phải audit — §8.1) sau 1 tuần rồi điều chỉnh. |

**Còn lại cần user chốt:**

| # | Câu | Vì sao cần chốt trước khi code |
|---|---|---|
| **Q6** | **Nội dung `dailyReport` gồm những chỉ số nào?** Đề xuất: doanh thu, số vé, payout, GGR, jackpot contribution, top 3 game, số draw settle/treo, cảnh báo settle stuck. | Quyết định `buildDailyReportUseCase` gọi lại use-case report nào. Thêm chỉ số sau thì dễ; nhưng nếu cần **bóc theo tenant** thì đụng R-07 (group đọc được hết) ⇒ phải biết trước. |
| **Q7** | Group nhận báo cáo có gồm người **ngoài** nhóm điều hành (VD: nhân viên CS, đối tác)? | Nếu có → báo cáo phải cắt bớt (chỉ số tổng, không GGR/tenant). Đây là quyết định **nghiệp vụ**, code không đoán được. |
| **Q8** | Có cần báo cáo **thêm** vào DM của một vài người (VD: giám đốc) ngay ở G3? | Nếu có, làm chung G3 rẻ hơn tách G3.5 (§11.6) — nhưng cần `proactiveOptIn` bật tay cho các account đó. |



