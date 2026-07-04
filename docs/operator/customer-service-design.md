# MegaWin Operator — Customer Service / Player Support (Design Doc, Brainstorm v0.1)

> **Trạng thái:** Bản brainstorm để team review. Chưa chốt vendor/kỹ thuật chi tiết.
> **Quan hệ:** Đây là chi tiết cho **Bounded Context #14 — Customer Service / Player Support**, bổ sung cho
> [`operator-platform-design.md`](./operator-platform-design.md). Chức năng hỗ trợ khách hàng bị thiếu trong doc gốc
> (doc gốc mới liệt kê 13 context, không có CS) → file này lấp khoảng đó.
> **Mục tiêu:** Player liên hệ dễ nhất — nhanh nhất — ít ma sát nhất; **tối giản nhân lực** bằng AI deflection +
> self-service; agent chỉ xử lý ca thật sự cần người. Tất cả bám sát ưu tiên xuyên suốt của doc gốc:
> **team ít người + tái dùng hạ tầng AWS có sẵn + implement nhanh + không sửa MegaWin core.**

---

## 1. Vì sao CS là bounded context riêng (không phải "gắn thêm một cái chat")

Trong iGaming/casino, hỗ trợ khách hàng **không phải** tính năng phụ — nó là điểm chạm giữ chân player và là
**bề mặt tuân thủ (compliance surface)**: mọi tranh chấp nạp/rút, khiếu nại bonus, yêu cầu tự loại trừ (self-exclusion)
đều đi qua đây và **phải có audit trail bất biến** cho regulator. Ba lý do CS phải là context độc lập:

1. **Người dùng khác nhau:** player (tự phục vụ), agent CS (nhân viên), và AI (tuyến đầu). Ba nhóm, ba surface — đúng
   nguyên tắc tách theo nhóm người dùng của doc gốc (§4).
2. **Tốc độ thay đổi khác nhau:** kịch bản chat/FAQ đổi liên tục; nhưng *action* mà CS gọi xuống (khóa tài khoản, hoàn
   tiền, kích hoạt self-exclusion) là logic tài chính/tuân thủ **không được đổi bừa** → phải cô lập sau một API contract
   ổn định (đúng tư duy §11.3 của doc gốc: tách theo tốc độ thay đổi).
3. **Ranh giới dữ liệu:** CS cần **đọc** ngữ cảnh player (số dư, giao dịch, KYC, flag fraud) nhưng **không được** là nơi
   ghi ledger. CS gọi Wallet/Payment/KYC qua API, không đụng thẳng DB tài chính.

> **Nguyên tắc gốc của context này:** *CS là interface, không phải enforcement engine.* AI/agent **kích hoạt** business
> logic ở backend (Wallet, KYC, Risk, Responsible Gaming) qua contract — CS không tự ý sửa tiền hay trạng thái. Đây là
> chuẩn ngành cho self-exclusion và mọi hành động nhạy cảm (xem §9, Nguồn tham khảo).

---

## 2. Ai dùng chức năng này? (3 nhóm, 3 surface)

| Nhóm | Surface | Nằm ở đâu | Nhu cầu chính |
|---|---|---|---|
| **Player** (khách cuối) | Help Center (self-service) + Live Chat widget + kênh mạng xã hội | **trong `operator-web`** (route group `(support)`) + widget nhúng + Zalo/Telegram | Tự tìm câu trả lời, chat 24/7, mở ticket, theo dõi tiến độ |
| **CS Agent** (nhân viên hỗ trợ) | Agent console (unified inbox) | **service CS riêng** (self-hosted) hoặc SaaS console | Trả lời đa kênh 1 màn hình, thấy 360° player, tạo/định tuyến ticket |
| **AI Agent** (tuyến đầu tự động) | Chatbot + Copilot | backend `support-service` + LLM/RAG | Giải quyết tự động 60–80% câu hỏi lặp, escalate khi cần người |

**Nhân sự vận hành (staff):** ngoài agent còn có **supervisor** (giám sát hàng đợi, SLA, phân quyền maker-checker cho
hoàn tiền/điều chỉnh), và **compliance officer** (đọc audit trail, xử lý dispute/RG). Ba vai này dùng chung console, khác
permission — **không tách app**, tách bằng RBAC.

> **Không** dựng một "web CS riêng" cho player. UI hỗ trợ (Help Center, chat, "My Tickets") sống **trong `operator-web`**,
> chung auth/session/design với phần chơi game — đúng §4 và §11.3 của doc gốc. Cái tách ra là **agent console + backend
> logic**, không phải trải nghiệm của player.

---

## 3. Bức tranh toàn cảnh (đặt CS vào kiến trúc Operator)

```
┌──────────────────────── PLAYER TOUCHPOINTS (đa kênh, ít ma sát) ───────────────────────┐
│  operator-web: Help Center · Live Chat widget · "My Tickets"                            │
│  Zalo OA · Telegram · WhatsApp · Email · (Voice/hotline — sau)                          │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             │  mọi kênh gom về 1 inbox
┌────────────────────────────────────────────▼────────────────────────────────────────────┐
│                         SUPPORT SERVICE (Bounded Context #14 — MỚI)                       │
│  Omnichannel inbox · Ticketing · AI deflection (RAG) · Copilot · Routing/SLA · Audit      │
└──────┬───────────────┬────────────────┬───────────────┬───────────────┬───────────────────┘
       │ read context   │ trigger action │ knowledge      │ notify         │ audit log
       ▼                ▼                ▼               ▼               ▼
┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐
│ wallet-svc  │  │ payment / KYC │  │ CMS/Help    │  │ Notification│  │ @megawin/audit        │
│ (số dư,     │  │ Risk / RG     │  │ (bài viết   │  │ (SNS/SES/   │  │ (nhật ký bất biến,    │
│  giao dịch) │  │ (action)      │  │  FAQ → RAG) │  │  Pinpoint)  │  │  đã có trong repo)    │
└────────────┘  └──────────────┘  └────────────┘  └────────────┘  └──────────────────────┘
```

**Điểm mấu chốt:** `support-service` **đọc** ngữ cảnh và **kích hoạt** action qua API của các context khác (§1). Nó KHÔNG
sở hữu tiền, KYC, hay risk logic — nó orchestrate và ghi audit. Tái dùng `@megawin/audit`, `@megawin/notification`
(SNS/SES/Pinpoint theo §7 doc gốc), `@megawin/cache`.

---

## 4. Tính năng — chia 3 tầng theo mức tự động hoá (giảm nhân lực từ thiết kế)

Triết lý xuyên suốt: **deflect trước, escalate sau.** Mỗi câu hỏi nên được giải ở tầng rẻ nhất có thể. Mục tiêu số:
**60–80% inquiry giải quyết không cần agent** (chuẩn ngành với AI iGaming-specific).

```
TẦNG 0 — SELF-SERVICE (0 agent, 0 chi phí biến đổi)
  Help Center / Knowledge Base · FAQ có search · trạng thái giao dịch tự tra ("nạp của tôi tới đâu?")
  · hướng dẫn theo ngữ cảnh (deep-link tới đúng bước) · form mở ticket async.

TẦNG 1 — AI CHATBOT (deflection tự động, 24/7)
  RAG chatbot trả lời từ knowledge base · tra cứu ngữ cảnh player (số dư, giao dịch gần nhất, trạng thái KYC)
  · thực hiện action an-toàn-thấp (gửi lại OTP, resend email xác thực, giải thích trạng thái rút)
  · phát hiện ý định + cảm xúc → escalate khi bực bội / giá trị cao / rủi ro.

TẦNG 2 — HUMAN AGENT (unified inbox + Copilot)
  Agent xử lý ca AI không giải được · thấy 360° player · Copilot gợi ý câu trả lời + tóm tắt hội thoại
  · maker-checker cho action nhạy cảm (hoàn tiền, điều chỉnh số dư) · SLA + auto-escalation.

TẦNG 3 — SPECIALIST / COMPLIANCE (ca nhạy cảm)
  Dispute nạp/rút · nghi ngờ fraud/bonus abuse · Responsible Gaming (self-exclusion, đặt giới hạn) · AML EDD.
  Bắt buộc con người ký; mọi quyết định vào audit trail bất biến.
```

### 4.1 Danh mục tính năng bắt buộc (MVP → mở rộng)

| Tính năng | Tầng | Mô tả | Ưu tiên |
|---|---|---|---|
| **Help Center / KB** | 0 | Bài viết + FAQ, search, đa ngôn ngữ; đồng thời là nguồn cho RAG | P0 |
| **Live Chat widget** | 0→2 | Nhúng trong `operator-web`; chat với AI, escalate lên agent | P0 |
| **Ticketing** | 0→2 | Tạo/theo dõi ticket, gắn với `playerId`, trạng thái, SLA | P0 |
| **Omnichannel inbox** | 2 | Gom Live Chat + Email + Zalo + Telegram + WhatsApp về 1 console | P1 |
| **360° player context** | 2 | Panel bên cạnh hội thoại: số dư, nạp/rút gần nhất, KYC, flag fraud | P1 |
| **AI chatbot (RAG)** | 1 | Trả lời tự động grounded trên KB; deflect 60–80% | P1 |
| **AI Copilot cho agent** | 2 | Gợi ý reply, tóm tắt, dịch, soạn canned response | P2 |
| **Routing + SLA** | 2 | Định tuyến theo loại vấn đề / ngôn ngữ / giá trị player / độ khẩn | P1 |
| **VIP segmentation** | 2 | Nhận diện player giá trị cao → hàng đợi ưu tiên, agent chuyên | P2 |
| **Proactive messaging** | 1 | Chủ động nhắn khi giao dịch treo, KYC cần bổ sung, khuyến mãi | P2 |
| **RG intervention flow** | 3 | Luồng self-exclusion / đặt giới hạn / cooling-off qua CS | P2 |
| **Audit & compliance log** | mọi tầng | Ghi bất biến mọi hội thoại + action + ai xem dữ liệu gì | P0 |
| **Voice / hotline** | 2 | Tổng đài (Amazon Connect + Lex + Bedrock) — bot trả lời rồi handover | P4 |

### 4.2 Các câu hỏi player hỏi nhiều nhất (thiết kế deflection ưu tiên đúng chỗ)

Bốn nhóm câu hỏi chiếm phần lớn volume trong iGaming — thiết kế Tầng 0/1 phải xử lý gọn 4 nhóm này trước:

1. **Payments (nạp/rút):** "tiền nạp chưa vào", "rút bao lâu", "rút bị treo" → tra trạng thái real-time từ
   `payment/wallet`, giải thích tầng duyệt rút (§6.2 doc gốc). Đây là nhóm volume cao nhất.
2. **KYC / xác minh:** "cần giấy tờ gì", "xác minh tới đâu", "vì sao bị yêu cầu KYC" → tra trạng thái từ KYC context,
   deep-link tới bước upload.
3. **Bonus / khuyến mãi:** "vì sao chưa nhận bonus", "wagering requirement là gì", "vì sao rút bị chặn" → giải thích
   WR + ví bonus tách cash (§5, §12.4 doc gốc).
4. **Account:** đăng nhập, đổi mật khẩu, OTP, khóa/mở tài khoản → phần lớn tự phục vụ được ở Tầng 0/1.

---

## 5. AI deflection & RAG — trái tim của "tối giản nhân lực"

Đây là đòn bẩy lớn nhất để giảm nhân lực: **một chatbot grounded trên knowledge base + ngữ cảnh player** giải quyết
hầu hết câu hỏi lặp mà không cần agent. Nguyên tắc thiết kế:

- **RAG chứ không phải LLM tự do:** câu trả lời phải **grounded** trên KB nội bộ (bài Help Center, policy nạp/rút, terms
  bonus). Không để model "bịa" (hallucination) — cực nguy hiểm khi liên quan tiền/bonus. Guardrail bắt buộc.
- **Tách "trả lời câu hỏi" khỏi "thực hiện hành động".** AI được phép *đọc* ngữ cảnh và *giải thích*; hành động ghi
  tiền/đổi trạng thái phải qua contract có kiểm soát (return-control → gọi API backend), không để LLM tự quyết. Với ca
  nhạy cảm (hoàn tiền, self-exclusion) → **luôn** có human-in-the-loop.
- **Escalate thông minh:** phát hiện player bực bội / giá trị cao / dấu hiệu RG (câu nói tuyệt vọng) → chuyển người ngay.
- **KB là nguồn duy nhất:** Help Center (Tầng 0) và RAG (Tầng 1) **dùng chung một kho bài viết** → viết 1 lần, phục vụ
  cả tự đọc lẫn AI. Cập nhật policy → cả hai tự đồng bộ.

### 5.1 Hai lối triển khai AI (chọn theo tốc độ vs kiểm soát)

| Lối | Cách làm | Ưu | Nhược | Khi nào chọn |
|---|---|---|---|---|
| **A — Managed (AWS Bedrock)** | Bedrock **Knowledge Base** (RAG) + **Guardrails** + Agents; nguồn KB ở S3; vector qua OpenSearch Serverless | Nhanh nhất, ít vận hành, khớp ưu tiên "dùng AWS có sẵn"; data ở trong VPC | Chi phí theo token/scale; phụ thuộc model AWS | **MVP** — khuyến nghị |
| **B — Self-hosted RAG** | pgvector/Qdrant + embedding `bge-m3` (đa ngôn ngữ, tốt tiếng Việt) + LLM open-weight (Qwen/Llama) qua vLLM (OpenAI-compatible) | Tự chủ hoàn toàn, chi phí biên thấp khi volume lớn, kiểm soát data tuyệt đối | Cần DevOps/AI-ops, tự lo scale & tuning | Sau P3 khi volume lớn / cần tự chủ sâu |

**CHỐT khuyến nghị:** **bắt đầu bằng A (Bedrock Knowledge Base + Guardrails)** cho MVP — dựng nhanh, ít người, đúng
tinh thần "dùng managed service cho thứ không phải lợi thế cạnh tranh" (§11.4 doc gốc). Giữ **kiến trúc thay-thế-được**
(abstract lớp LLM sau một interface) để chuyển sang B khi volume/chi phí biện minh.

```
Player hỏi ──► support-service ──► [1] lấy ngữ cảnh player (wallet/KYC, đọc-only)
                                   [2] retrieval: query KB (vector search)
                                   [3] LLM sinh câu trả lời GROUNDED + guardrail
                                   [4] cần action? ──► return-control ──► gọi API backend (có kiểm soát)
                                   [5] không giải được / rủi ro ──► escalate human (kèm tóm tắt hội thoại)
```

---

## 6. Chọn nền tảng CS: Buy (SaaS) vs Build vs Self-host open-source

Đây là quyết định "rẻ lúc quyết đúng, đắt khi sửa sau" — giống 3 quyết định lớn ở §11 doc gốc. Ba phương án:

| Phương án | Đại diện | Chi phí | Tự chủ dữ liệu | Tích hợp PAM/Wallet | Phù hợp team ít người |
|---|---|---|---|---|---|
| **Buy — SaaS** | Zendesk, Intercom, Freshdesk, Crisp; hoặc iGaming-specific (Comm100, Cevro AI) | Per-agent/per-resolution (đắt dần, khó dự toán) | Data ở vendor cloud | Qua API/app marketplace | Nhanh nhất nhưng đắt & lệ thuộc |
| **Self-host OSS** | **Chatwoot** (MIT, self-host, không giới hạn agent) | Chỉ hạ tầng (rẻ) | **Toàn quyền, data ở AWS của mình** | Tự viết integration | Tốt nếu có DevOps |
| **Build từ đầu** | Tự viết inbox + ticketing | Cao (dev time) | Toàn quyền | Native | Không nên — đốt velocity |

### Phân tích cho MegaWin

- **Build từ đầu → LOẠI.** Inbox/ticketing/routing không phải lợi thế cạnh tranh. Tự viết = đốt thời gian team ít người,
  đúng cái §11.4 doc gốc cảnh báo. Chỉ tự viết phần *lõi khác biệt*: lớp **orchestration + context 360° + action
  contract** nối vào Wallet/KYC/Risk của Operator.
- **Buy SaaS thuần → RỦI RO tuân thủ + chi phí.** Sản phẩm giữ tiền thật + game có yếu tố nhạy cảm ở VN. Đẩy toàn bộ hội
  thoại player (chứa PII, dữ liệu tài chính) sang vendor cloud nước ngoài làm phức tạp data residency & audit. Chi phí
  per-agent (Zendesk ~$55/agent/mo) hoặc per-resolution (Intercom Fin $0.99/resolution, Zendesk AI ~$1.50) **khó dự toán**
  khi scale. Chú ý: cả Zendesk lẫn Chatwoot **không hỗ trợ Zalo native** → kênh VN quan trọng nhất phải tự tích hợp dù chọn gì.
- **Self-host Chatwoot → KHUYẾN NGHỊ cho MVP.** MIT license, self-host trên AWS (EC2/ECS/EKS), **không per-seat**, sở hữu
  data (dễ audit + data residency), hỗ trợ sẵn Live Chat + Email + WhatsApp + Telegram + Facebook/Instagram, có API mở
  để nhúng context 360° và ghi audit. Khớp trọn ưu tiên "tự chủ + AWS có sẵn + chi phí thấp + team ít người".

> **CHỐT khuyến nghị (chưa chốt cứng, cần team review):** **Self-host Chatwoot làm inbox/ticketing/agent console** +
> **Bedrock Knowledge Base + Guardrails làm AI deflection** + **lớp `support-service` mỏng tự viết** để nối context 360°,
> action contract, và audit vào Operator. Kênh Zalo OA tự tích hợp qua webhook (mọi phương án đều phải tự làm). Giữ AI
> sau một interface để đổi Bedrock ↔ self-hosted RAG về sau. Cân nhắc iGaming-specific AI (Comm100/Cevro) **sau P3** nếu
> volume lớn và muốn AI "hiểu tiếng casino" sâu hơn — lúc đó là nâng cấp, không nằm trên đường găng.

---

## 7. Kênh liên hệ — dễ nhất cho khách VN (đa kênh, một inbox)

Ưu tiên: **khách liên hệ ở kênh họ đã dùng hằng ngày**, đừng bắt cài app mới. Thứ tự triển khai theo mức phổ biến ở VN
và độ khó tích hợp:

| Kênh | Vai trò | Độ khó | Ưu tiên | Ghi chú |
|---|---|---|---|---|
| **Live Chat (web widget)** | Kênh chính trong app | Thấp (Chatwoot có sẵn) | P0 | Nhúng vào `operator-web`, mang sẵn `playerId` (đã đăng nhập) |
| **Help Center** | Self-service, nguồn RAG | Thấp | P0 | Đa ngôn ngữ; SEO cho câu hỏi phổ biến |
| **Zalo OA** | Kênh phổ biến NHẤT ở VN | Trung (tự webhook) | P1 | KHÔNG vendor nào hỗ trợ native → tự tích hợp qua Zalo OA API |
| **Telegram** | Cộng đồng game/cá cược VN dùng nhiều | Thấp (Chatwoot native) | P1 | Bot + bridge vào inbox |
| **Email** | Kênh async, lưu vết | Thấp | P1 | Qua SES (đã có §7 doc gốc) |
| **WhatsApp** | Player quốc tế | Trung (Business API) | P2 | Chatwoot hỗ trợ; cần WhatsApp Business API |
| **Voice / hotline** | VIP, ca phức tạp | Cao | P4 | Amazon Connect + Lex + Bedrock: bot trả lời rồi handover agent |

**Nguyên tắc "một player, một danh tính xuyên kênh":** dù player nhắn Zalo, Telegram hay web chat, hệ thống phải nhận ra
**cùng một `playerId`** để agent thấy lịch sử thống nhất (360° view) — đúng tinh thần omnichannel: *"player barely notices
they changed channels"*. Đây là lý do cần **identity resolution**: map external channel id (Zalo user id, Telegram id) →
`playerId` nội bộ Operator. Với web chat thì dễ (đã đăng nhập); với social channel cần liên kết lần đầu (gửi mã liên kết
qua chat, hoặc OTP).

---

## 8. Tech stack đề xuất (bám §7 & §11.4 doc gốc — tái dùng AWS + repo có sẵn)

| Layer | Công nghệ | Ghi chú |
|---|---|---|
| Player Help Center + chat widget | Next.js 16 (route group `(support)` trong `operator-web`) + Chatwoot widget SDK | chung auth/session/design (§4, §11.3 doc gốc) |
| Agent console + inbox + ticketing | **Chatwoot self-hosted** trên **ECS Fargate** (Rails + Postgres + Redis) | không per-seat; sở hữu data; đa kênh sẵn |
| Orchestration CS | **`support-service`** (Lambda + Middy + Zod như `api-player`, hoặc gắn vào `operator-api`) | context 360°, action contract, escalate, audit — phần tự viết |
| AI deflection / RAG | **Amazon Bedrock Knowledge Base + Guardrails + Agents** (MVP); nguồn KB ở **S3**, vector **OpenSearch Serverless** | đổi sang self-hosted (pgvector/Qdrant + vLLM + `bge-m3`) về sau |
| Vector / KB store | OpenSearch Serverless (Bedrock) hoặc **pgvector** nếu tự host | KB = Help Center articles, đồng bộ 1 nguồn |
| Context data (đọc-only) | API của `wallet-service`, `payment`, KYC, Risk | CS KHÔNG đụng thẳng DB tài chính (§1) |
| Kênh Zalo OA | Zalo OA API + webhook → `support-service` → Chatwoot inbox | tự tích hợp (không vendor nào native) |
| Notification chủ động | **SNS / SES / Pinpoint** (`@megawin/notification`) | đã có trong §7 doc gốc |
| Audit / compliance | **`@megawin/audit`** (nhật ký bất biến — đã có trong repo) | ghi mọi hội thoại nhạy cảm + action + truy cập dữ liệu |
| Voice (sau) | **Amazon Connect + Amazon Lex + Bedrock** | bot voice trả lời từ KB → escalate agent (Contact Flow) |
| Cache / session chat | **ElastiCache Redis** (`@megawin/cache`) | Chatwoot cần Redis; dùng chung stack |
| Secrets (token Zalo/WhatsApp/PSP) | **Secrets Manager + KMS** | như §11.4 doc gốc |
| Infra | Turborepo (deploy độc lập `--filter`), Serverless Framework, AWS | như core |

**Cấu trúc đề xuất trong monorepo (thêm vào, không sửa core):**

```
apps/
  operator-web/                # (đã có §11.1) — thêm route group (support): Help Center, chat, My Tickets
  chatwoot/                    # deploy config self-hosted Chatwoot (hoặc infra riêng) — agent console
  support-service/             # Lambda/Fargate — orchestration: context 360°, action contract, escalate, audit
  worker-support-*/            # workers async: sync context, index KB → vector, proactive messaging
packages/
  support-core/                # domain types CS dùng chung (Ticket, Conversation, Channel, EscalationReason...)
  support-ai/                  # abstraction lớp AI/RAG (Bedrock adapter | self-hosted adapter) — thay thế được
  channel-adapters/            # adapter Zalo OA / Telegram / WhatsApp / Email → chuẩn hoá về 1 message shape
```

---

## 9. Quy trình nghiệp vụ nhạy cảm (CS là interface, backend là enforcement)

### 9.1 Dispute nạp/rút (khiếu nại giao dịch)
```
[1] Player khiếu nại qua chat/ticket ("nạp 500k chưa vào")
[2] AI/agent tra REAL-TIME từ payment/wallet (đọc-only): trạng thái intent, webhook PSP, ledger
[3] Giải thích được ngay?  → Tầng 1 đóng (giao dịch đang chờ webhook / đã vào / đã hoàn)
[4] Cần điều chỉnh tiền?    → KHÔNG để AI/agent tự sửa. Tạo ticket "financial adjustment"
                             → maker-checker: agent đề xuất, supervisor duyệt theo hạn mức (§6.3 doc gốc)
                             → action gọi Wallet API (idempotent tx), ghi ledger đảo/hoàn
[5] Mọi bước vào audit trail: ai xem dữ liệu gì, ai đề xuất, ai duyệt, lý do
```
**Nguyên tắc:** CS đọc ngữ cảnh và *đề xuất*; **ghi tiền luôn qua Wallet contract có idempotency + maker-checker** — không
có "sửa tay trong DB". Đây là nơi audit trail bất biến là bắt buộc cho regulator.

### 9.2 Responsible Gaming qua CS (self-exclusion / đặt giới hạn / cooling-off)
```
[1] Player yêu cầu tự loại trừ / đặt giới hạn qua chat
[2] AI phát hiện ý định RG → KHÔNG tự xử → escalate specialist NGAY + hiện thông tin hỗ trợ (signposting)
[3] Specialist xác nhận → gọi Responsible Gaming context (KHÔNG phải CS tự làm):
      → khóa NGAY, lan truyền trạng thái tới game/payment/marketing (lockout không bypass được)
      → bất biến trong thời gian loại trừ; chặn tạo account mới / đăng nhập lại
[4] Audit đầy đủ: yêu cầu, thời điểm, hành động hệ thống — chuẩn regulator (không bypass qua đổi thiết bị)
```
**Cực kỳ quan trọng:** *self-exclusion KHÔNG phải tính năng CS — nó là cơ chế an toàn được quản lý.* CS chỉ là **cửa vào**;
enforcement nằm ở Responsible Gaming context với lockout tức thì, non-bypassable, audit-ready. AI **tuyệt đối không** tự
quyết ca RG — luôn human-in-the-loop + signposting tới dịch vụ hỗ trợ.

### 9.3 Maker-checker & phân quyền (giảm rủi ro nội bộ)
- **Agent:** trả lời, đóng ticket thường, action an-toàn-thấp (resend OTP/email).
- **Supervisor:** duyệt financial adjustment tới hạn mức X; giám sát SLA/hàng đợi.
- **Compliance officer:** dispute cấp cao, RG, AML EDD; đọc audit trail.
- Action nhạy cảm (hoàn tiền, điều chỉnh số dư, RG) **luôn** maker-checker + audit — đồng bộ §6.3 doc gốc.

---

## 10. Roadmap giảm rủi ro (khớp roadmap P0–P5 doc gốc)

- **P1 (cùng Player MVP)** — **CS-P0:** Help Center/KB cơ bản + Live Chat widget (Chatwoot self-host) trong `operator-web`;
  ticketing gắn `playerId`; audit hội thoại. Đủ để hỗ trợ khi bắt đầu có player thật.
- **P2 (cùng Payment & Ops)** — **CS-P1:** AI chatbot RAG (Bedrock KB + Guardrails) deflect 4 nhóm câu hỏi (§4.2); context
  360° trong agent console; routing + SLA; kênh Email + Telegram. Dispute nạp/rút với maker-checker.
- **P3 (cùng Affiliate)** — **CS-P2:** Zalo OA + WhatsApp; AI Copilot cho agent; VIP segmentation; proactive messaging
  (giao dịch treo, KYC nhắc). RG intervention flow qua CS.
- **P4** — **CS-P3:** Voice/hotline (Amazon Connect + Lex + Bedrock) cho VIP/ca phức tạp; cân nhắc iGaming-specific AI nếu
  volume lớn; đánh giá chuyển RAG sang self-hosted (chi phí biên).

---

## 11. Rủi ro & lưu ý sớm

- **AI hallucination về tiền/bonus:** model bịa câu trả lời sai về nạp/rút/WR = mất tiền + mất niềm tin. **Bắt buộc RAG
  grounded + Guardrails**, và AI chỉ *giải thích* — không tự thực hiện action tài chính.
- **Data residency & PII trong hội thoại:** chat chứa PII + dữ liệu tài chính. Ưu tiên self-host (data ở AWS của mình) để
  dễ audit & tuân thủ VN. Nếu dùng SaaS → cân nhắc kỹ nơi lưu dữ liệu.
- **Zalo không được vendor hỗ trợ native:** kênh VN quan trọng nhất phải **tự tích hợp** — tính vào effort ngay từ đầu.
- **Self-exclusion bị bypass:** nếu enforcement lỏng (chỉ ẩn UI, không chặn thật) = vi phạm nghiêm trọng. Lockout phải ở
  RG context, non-bypassable, cross-device — CS không được là điểm enforcement.
- **Identity resolution xuyên kênh:** map sai Zalo/Telegram id → `playerId` = lộ dữ liệu player khác. Cần liên kết an toàn
  (mã liên kết/OTP) trước khi hiển thị context 360°.
- **Chi phí AI khó dự toán:** per-resolution (Intercom/Zendesk AI) đội chi phí khi scale. Bedrock theo token cũng cần theo
  dõi. Đặt alarm chi phí; giữ khả năng chuyển self-hosted.
- **Vận hành Chatwoot self-host:** cần DevOps (upgrade, backup, scale Rails/Postgres/Redis). Không "free" hoàn toàn — đổi
  chi phí license lấy chi phí vận hành. Team ít người phải cân nhắc.

---

## 12. Điểm còn mở (cần chốt với team)

- Chatwoot self-host hay SaaS (Zendesk/Intercom/Freshdesk) hay iGaming-specific (Comm100/Cevro)? → **khuyến nghị: Chatwoot
  self-host + Bedrock AI cho MVP**, review lại sau P3.
- AI: Bedrock Knowledge Base (managed) hay self-hosted RAG (pgvector + vLLM + `bge-m3`)? → **khuyến nghị: Bedrock trước,
  giữ interface thay thế được.**
- `support-service` là Lambda riêng hay gắn vào `operator-api` BFF? → cần chốt theo tải & ranh giới.
- Kênh nào ưu tiên sau Live Chat: Zalo OA hay Telegram trước? (phụ thuộc chân dung player thực tế)
- Ngưỡng escalate AI→human: theo sentiment, giá trị player, hay loại vấn đề? Chốt rule ban đầu.
- Hạn mức maker-checker cho financial adjustment qua CS (đồng bộ §6.3 doc gốc).
- SLA mục tiêu theo kênh & theo tầng player (VIP vs thường).
- Có tích hợp registry self-exclusion tập trung (nếu quy định VN yêu cầu) không?

---

## Nguồn tham khảo (chuẩn ngành)
- Omnichannel iGaming CX & 360° player view (integrate PAM/CRM/payment, unified inbox) — Zendesk iGaming blog, Comm100
- Support platform integration (Zendesk/Intercom/Freshdesk nối PAM, context trong agent workflow) — iGaming.cx
- iGaming-specific AI agents (deflect 80–90%, hiểu thuật ngữ casino/bonus/KYC, VIP, đa GEO/ngôn ngữ) — Comm100, Cevro AI
- So sánh vendor & pricing (Zendesk per-agent ~$55; Intercom Fin $0.99/resolution; Freshdesk; Crisp per-workspace) — Zendesk, CompareTiers, Quickchat AI
- Self-host open-source (Chatwoot MIT, không per-seat, WhatsApp/Telegram native, không Zalo native, deploy AWS) — Chatwoot, GitHub chatwoot/chatwoot, useconverge
- Self-hosted vs cloud trade-offs (data sovereignty, compliance, AI gap) — Supp blog
- Self-hosted RAG (pgvector/Qdrant + vLLM + `bge-m3` đa ngôn ngữ, OpenAI-compatible, tiếng Việt) — UpCloud, Tensoria, vietnamese-rag-system, techopsasia
- AWS AI support stack (Bedrock Knowledge Base + Guardrails + Agents; Lex; Connect voice + handover; OpenSearch Serverless) — AWS Connect/Bedrock docs, Rootquotient
- Kênh VN (Zalo OA / Telegram / Facebook flows, pgvector RAG) — Datazen-AI, NextX
- Self-exclusion airtight & audit-ready (PAM là source of truth, lockout tức thì non-bypassable, CS là interface không phải enforcement) — wizards.us, cadencewavez, SDLC CORP


