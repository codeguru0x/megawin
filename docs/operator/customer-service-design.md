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
| **AI Agent** (tuyến đầu tự động) | Chatbot + Copilot | backend `operator-support-api` + LLM/RAG | Giải quyết tự động 60–80% câu hỏi lặp, escalate khi cần người |

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

**Điểm mấu chốt:** `operator-support-api` **đọc** ngữ cảnh và **kích hoạt** action qua API của các context khác (§1). Nó KHÔNG
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
Player hỏi ──► operator-support-api ──► [1] lấy ngữ cảnh player (wallet/KYC, đọc-only)
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
| **Self-host OSS** | **Chatwoot** / **Zammad** (self-host, không giới hạn agent) | Chỉ hạ tầng (rẻ) | **Toàn quyền, data ở AWS của mình** | Tự viết integration | Tốt nếu có DevOps |
| **Build từ đầu** | Tự viết inbox + ticketing | Cao (dev time) | Toàn quyền | Native | Không nên — đốt velocity |

### 6.1 Phân tích cho MegaWin

- **Build từ đầu → LOẠI.** Inbox/ticketing/routing không phải lợi thế cạnh tranh. Tự viết = đốt thời gian team ít người,
  đúng cái §11.4 doc gốc cảnh báo. Chỉ tự viết phần *lõi khác biệt*: lớp **orchestration + context 360° + action
  contract** nối vào Wallet/KYC/Risk của Operator.
- **Buy SaaS thuần → RỦI RO tuân thủ + chi phí + PHÁP LÝ.** Sản phẩm giữ tiền thật + game có yếu tố nhạy cảm ở VN. Đẩy
  toàn bộ hội thoại player (chứa PII, dữ liệu tài chính) sang vendor cloud nước ngoài làm phức tạp data residency & audit.
  Chi phí per-agent (Zendesk ~$55/agent/mo) hoặc per-resolution (Intercom Fin $0.99/resolution, Zendesk AI ~$1.50) **khó
  dự toán** khi scale. **Nghiêm trọng hơn: nhiều SaaS lớn CẤM gambling trong Acceptable Use Policy** — xem §6.3 (Intercom).
  Chú ý: cả Zendesk lẫn Chatwoot/Zammad **không hỗ trợ Zalo native** → kênh VN quan trọng nhất phải tự tích hợp dù chọn gì.
- **Self-host OSS → KHUYẾN NGHỊ cho MVP.** Không per-seat, sở hữu data (dễ audit + data residency), không lệ thuộc AUP của
  vendor (không ai cấm được ta vì ngành gambling), API mở để nhúng context 360° và ghi audit. Khớp trọn ưu tiên "tự chủ +
  AWS có sẵn + chi phí thấp + team ít người". Còn lại là chọn **Chatwoot hay Zammad** — xem §6.2.

### 6.2 Chatwoot hay có sản phẩm self-host tốt hơn? — so sánh ứng viên

Câu hỏi "có SP nào tốt hơn Chatwoot không" phụ thuộc **operating model**: MegaWin cần **chat-first cho player** (live-chat
widget + social) *và* **ticketing/SLA/audit cho ca nhạy cảm** (dispute, RG). Không SP OSS nào mạnh cả hai như nhau:

| Sản phẩm | License | Điểm mạnh | Điểm yếu | Hợp phần nào của CS |
|---|---|---|---|---|
| **Chatwoot** | MIT | Live-chat widget + social channel (WhatsApp/Telegram/FB/IG) mạnh nhất; UX chat kiểu Intercom; ~22K★ | Ticketing/SLA/automation nông hơn Zammad; AI (Captain) còn cơ bản | **Player-facing chat** (Tầng 0–1) |
| **Zammad** | AGPL-3.0 | Ticketing/**SLA**/trigger-automation/**RBAC**/audit mạnh; REST API hiện đại nhất; LDAP/SAML, phone/CTI native | Nặng (Elasticsearch, 4GB+ RAM); thiên email hơn live-chat widget | **Agent console + ticketing** (Tầng 2–3) |
| **Libredesk** | AGPL | Go+Vue, omnichannel + SLA + API, không tier license, nhẹ, hiện đại | Còn non trẻ, cộng đồng nhỏ, ít battle-tested | Ứng viên theo dõi |
| **FreeScout** | AGPL | Rất nhẹ (PHP/Laravel), shared inbox email đơn giản | SLA/automation/multi-channel qua module trả phí; không mạnh chat | Không đủ đa kênh |
| **osTicket / Znuny/OTOBO / RT** | GPL/AGPL | Ticketing email ổn định, lâu đời | UX cũ, không chat-first, không hợp player B2C | Không phù hợp |
| **Ticqex** | open-core | **API-first + MCP-native**, human+AI là first-class operator | Rất non, nhỏ | Thử nghiệm AI-native về sau |

**Kết luận §6.2:**

- **Nếu ưu tiên trải nghiệm chat cho player** (đúng bản chất B2C của MegaWin — player nhắn live-chat/Zalo/Telegram) →
  **Chatwoot vẫn là lựa chọn tốt nhất cho MVP.** Nó thắng đúng cái quan trọng nhất: widget nhúng `operator-web`, social
  channel sẵn.
- **Nếu team đánh giá ticketing/SLA/audit/RBAC quan trọng hơn** (thiên xử lý dispute/RG có quy trình) → **Zammad tốt hơn
  Chatwoot** ở đúng những trục đó, đổi lại hạ tầng nặng hơn và chat widget kém hơn.
- **Điểm mấu chốt để không phụ thuộc lựa chọn này:** *audit-ready compliance nằm ở `@megawin/audit` + `operator-support-api` tự
  viết, KHÔNG nằm ở vendor.* Vì vậy dù chọn Chatwoot hay Zammad, phần "explainable audit trail" cho regulator vẫn do ta
  kiểm soát → không bị khoá cứng vào một SP. Có thể **bắt đầu Chatwoot (chat player), thêm/đổi Zammad nếu ticketing phình
  to** — nhờ lớp `operator-support-api` đứng giữa, đổi console không phá kiến trúc.

### 6.3 Intercom — CÓ nên tích hợp không? → **KHÔNG. Bị loại vì PHÁP LÝ, không phải kỹ thuật.**

Đây là điểm dứt khoát nhất của cả file. **Acceptable Use Policy của Intercom cấm rõ ràng dùng AI Product cho *"illegal
gambling, real money gambling, sports betting"*** ([intercom.com/legal/acceptable-use-policy](https://www.intercom.com/legal/acceptable-use-policy),
mục 2.d). MegaWin giữ tiền thật + game có yếu tố cá cược → **rơi đúng phần bị cấm**. Vi phạm AUP = Intercom có quyền
**suspend tài khoản không báo trước, tuỳ ý họ**. Xây support stack lên nền có thể bị cắt bất cứ lúc nào là rủi ro vận hành
không thể chấp nhận với sản phẩm giữ tiền player.

Kể cả bỏ qua điều khoản pháp lý, Intercom vẫn **không phù hợp** về các trục khác:

| Vấn đề | Chi tiết |
|---|---|
| **Data residency** | US-headquartered. Chọn EU hosting vẫn còn metadata + AI processing ở US; Fin chạy trên Bedrock **ở USA**. Khó cho data residency VN. |
| **Audit không đủ compliance** | Reporting chỉ giữ **2 năm**; ca cũ hơn phải kéo qua REST API (đẩy gánh nặng compliance sang team ta). **Không có explainable AI decision trail** — thiếu đúng thứ dispute/AML/RG cần. Không migrate được data sang EU (phải xoá tài khoản làm lại — data-loss event). |
| **Chi phí khó dự toán** | Fin $0.99/resolution + seat. ~100 hội thoại/ngày ≈ **$3,000/tháng** riêng Fin. Ca compliance thường dài, resolve xong vẫn cần người xử phần nhạy cảm → **trả tiền 2 lần**. |
| **Yếu ở đúng chỗ iGaming cần** | Fin mạnh trả lời knowledge-grounded nhưng **kém empathy ở ca cảm xúc** (player chasing losses, RG) và **kém ở luồng đa hệ thống** (withdrawal + KYC + risk check). Đây chính là ca iGaming đắt & rủi ro nhất. |

> **CHỐT §6.3:** **KHÔNG dùng Intercom** (và cẩn trọng tương tự với bất kỳ SaaS nào có AUP cấm gambling — đọc kỹ AUP trước
> khi ký). Tự chủ bằng self-host OSS + AI có kiểm soát là lối an toàn cho sản phẩm ngành này.

### 6.4 Comm100 — iGaming-specific vendor, ưu tiên dùng CLOUD trước để triển khai nhanh

**Bối cảnh quyết định:** ưu tiên số 1 hiện tại là **triển khai nhanh dự án**. Self-host OSS (Chatwoot/Zammad) rẻ về
license nhưng **đội chi phí DevOps ngay từ ngày đầu** (dựng ECS, Postgres, Redis, backup, upgrade, scale — §11). Với team
ít người mới khởi động, đó là lực cản velocity. **Comm100 cloud** cho phép launch trong ~2 tuần, không phải nuôi hạ tầng.

**Vì sao chọn Comm100 (không phải SaaS thường):**

- **CHẤP NHẬN ngành iGaming** — khác Intercom (§6.3), Comm100 phục vụ iGaming/casino, **không có AUP cấm gambling** → không
  bị suspend bất ngờ. Đây là điều kiện tiên quyết để đứng lên một SaaS cho sản phẩm giữ tiền thật.
- **Omnichannel một console:** Live Chat + Ticketing & Messaging (Email, SMS, WhatsApp, Facebook, Instagram, X, **Telegram**,
  LINE, WeChat, Signal) gom về một agent console. Đúng nhu cầu đa kênh §7.
- **AI Agent (deflect ~70% chat) + AI Copilot** built-in — không phải tự dựng RAG ở MVP.
- **Đường thoát on-premise:** khi lớn, Comm100 hỗ trợ on-premise → di chuyển được data về hạ tầng mình (§6.5, white-label).
  Nghĩ về on-premise **sau**, không phải bây giờ.

**Đánh đổi phải chấp nhận khi dùng cloud (ghi rõ để review lại):**

- **Data residency:** hội thoại player (PII + tài chính) nằm ở cloud Comm100 → cân nhắc chọn region, ký DPA. Chỉ push dữ
  liệu **tối thiểu cần** sang Comm100; giữ context tài chính nhạy cảm ở phía Operator (§6.4.2).
- **Pricing usage-based, khó dự toán khi scale** — đặt alarm chi phí, review theo volume thực.
- **Proprietary:** không sở hữu source; **lối chống khoá cứng vẫn là lớp `operator-support-api` + `@megawin/audit` của ta** đứng
  giữa (giống nguyên tắc §6.2) → đổi vendor sau này không phá kiến trúc.
- **Zalo OA vẫn phải tự tích hợp** (không vendor nào native — §7).

#### 6.4.1 Hướng dẫn sử dụng Comm100 cloud (các bước launch MVP)

Làm tuần tự trong **Comm100 Control Panel**:

1. **Live Chat — widget cho `operator-web`:**
   - `Live Chat > Campaign > Chat Window`: tùy biến logo/màu/CSS (white-label — §6.5), bỏ "Powered by Comm100" (cần plan
     Plus/Ultra, không phải Startup).
   - Nhúng đoạn JS widget của campaign vào route group `(support)` của `operator-web`.
2. **Ticketing & Messaging — kênh async + social:**
   - `Ticketing & Messaging > Channels`: thêm **Email** (kết nối mailbox hỗ trợ), **Telegram** (khuyến nghị *Connect through
     Telegram Bot* — chỉ cần Bot Token, nhẹ hơn App integration), WhatsApp/khác khi cần.
   - Tickets tự tạo từ live chat/offline message → không lọt inquiry khi agent offline.
3. **AI Agent (deflection) + Copilot:**
   - Tạo & train **AI Agent** từ knowledge base (nguồn = Help Center — dùng chung như §5), bật theo từng kênh trong tab AI
     Configuration của kênh đó.
   - Bật **AI Copilot** trong agent console để gợi ý reply/tóm tắt.
4. **Routing, SLA, Triggers:**
   - `Ticketing & Messaging > Settings > SLA Policies`: đặt SLA theo kênh (vd Telegram: first response 2–5 phút).
   - Auto Distribution + allocation rule để chia ticket theo department/agent; Triggers cho tự động hoá.
   - `Working Time & Holidays` để pause SLA timer ngoài giờ.
5. **Departments & RBAC:** tách quyền agent / supervisor / compliance officer (map §9.3) — không tách app, tách bằng role.
6. **History/QA:** dùng History (chat transcript) + tìm theo Ticket ID cho kiểm tra chất lượng; **song song ghi audit
   nhạy cảm về `@megawin/audit`** (không phụ thuộc history của vendor cho compliance).

#### 6.4.2 Kết hợp tài khoản Operator sang Comm100 (câu hỏi "map account của tôi") — CÓ, qua Visitor SSO

Comm100 hỗ trợ đúng cơ chế cần: **Visitor Single Sign-On (SAML hoặc JWT)** + **Custom Variables**. Không cần đồng bộ user
DB, **không lộ mật khẩu** — giống mô hình identity đã bàn cho Chatwoot (server-side signed identity, không share credential).

**Cách khuyến nghị cho kiến trúc Cognito + DB riêng: JWT Visitor SSO (IdP-initiated).**

```
[1] Player đã đăng nhập operator-web (Cognito) → có session hợp lệ.
[2] BFF (operator-api) ký một JWT chứa claim danh tính: playerId, tên, email, tier VIP...
        → ký bằng private RSA key của ta; Comm100 giữ public certificate để verify (không giả mạo được).
[3] Trang nhúng widget set JWT qua Visitor Side JS API:
        Comm100API.set('livechat.sso.jwt', '<jwt_do_BFF_ký>');
    → IdP-initiated: player vào thẳng chat, không bị redirect, danh tính đã xác thực.
[4] Comm100 map claim → field theo "SSO Data Mapping" (idpAttribute → comm100Field).
[5] Agent console hiển thị player ĐÃ xác thực (không phải tự khai) → chống mạo danh.
```

Cấu hình phía Comm100: `Live Chat > Settings > Visitor Single Sign-On` → chọn `jwtSso`, dán **JWT certificate** (public
key của ta), khai **SSO Data Mapping**. Có thể quản lý qua Server API (`protocolType: "jwtSso"`, `jwtCertificate`,
`visitorSsoFieldMappings`). Đặt `Sign-in required` nếu muốn chat **chỉ dành cho tài khoản đã đăng nhập**.

**Custom Variables — bơm ngữ cảnh 360° không nhạy cảm vào console:**

```js
// Sau khi đăng nhập, đẩy dữ liệu operator-web đã biết sang console cho agent thấy ngay:
Comm100API.set('livechat.customVariables', [
  { name: 'playerId',   value: playerId },
  { name: 'vipTier',    value: tier },
  { name: 'kycStatus',  value: kycStatus },
]);
```

**Ranh giới an toàn (bám §1, §6.4 data residency):**

- Chỉ đẩy sang Comm100 **định danh + nhãn ngữ cảnh tối thiểu** (playerId, tier, trạng thái KYC dạng nhãn). **KHÔNG** đẩy số
  dư chi tiết, lịch sử giao dịch, PII nhạy cảm lên cloud vendor.
- Context 360° tài chính đầy đủ để agent tra cứu **hiển thị qua `operator-support-api` của ta** (đọc-only từ wallet/payment),
  nhúng vào console qua **UI Integration của Comm100** (iframe/panel) hoặc mở từ playerId — dữ liệu tài chính không rời hạ
  tầng Operator.
- JWT **short-lived**, ký server-side ở BFF, xoay key qua Secrets Manager/KMS.
- Với kênh social (Telegram/Zalo) **không có sẵn session web** → vẫn cần **identity resolution** (mã liên kết/OTP) để gắn
  external channel id ↔ `playerId` như §7; SSO chỉ giải quyết được kênh web widget.

#### 6.4.3 Agent làm việc TRONG backoffice, không cần mở web Comm100 (Embeddable SDK + Agent SSO)

Câu hỏi vận hành: agent hỗ trợ khách **ngay trong backoffice** hay phải mở web riêng của Comm100? → **Nhúng thẳng agent
console vào backoffice** bằng **Comm100 Embeddable SDK**. Agent console chạy trong iframe, đăng nhập bằng chính tài khoản
backoffice (Cognito) qua **Agent SSO (JWT)** — một cửa duy nhất, không login riêng bên Comm100.

**Nhúng console vào một route của `operator-backoffice` (vd `/support`):**

```html
<script src="https://static.comm100.io/sdk/comm100-embeddable-sdk-v1_1_0.js"></script>
<script>
  var agentConsoleClient = new EmbeddedAgentConsole({
    siteId:  "{Your_Site_Id}",
    appId:   "{Your_App_Id}",
    entry:   "chats",                 // visitors | chats | agents | ticket
    container: document.getElementById("comm100-agentconsole"),
  });
  agentConsoleClient.init();
</script>
```

Trong Next.js bọc bằng một client component, nạp SDK trong `useEffect`, render vào `<div id="comm100-agentconsole">`.

**Agent SSO (JWT) — dùng tài khoản backoffice, không login lại:** bật ở `Apps & Integrations > (own app) > Enable app
extended authentication`. Khi agent mở tab Support mà chưa auth với Comm100 → Comm100 redirect sang **JWT Authentication
URL** của ta → backend (`operator-support-api`/`operator-api`) sinh JWT chứa danh tính agent (map từ Cognito) → Comm100 verify
bằng **JWT certificate** → vào thẳng console. (Cùng nguyên lý JWT như §6.4.2, nhưng cho *agent* thay vì *player*.)

**JavaScript API hai chiều — điều khiển console từ backoffice và nghe sự kiện:**

```js
ac.get('currentAgent');                              // thông tin agent hiện tại
ac.set('currentAgent.status', 'Online');             // đổi trạng thái từ UI backoffice
ac.set('agentconsole.navBar.select', 'chat');        // chuyển tab chat/ticket/visitor
ac.on('agentconsole.chats.chatStarted', () => {});   // chat mới bắt đầu
ac.on('agentconsole.navBar.badges', (n) => {});      // số tin chưa đọc → hiện badge trong backoffice
```

**Hai chiều nhúng — nên dùng CẢ HAI để agent có 1 màn hình duy nhất:**

| Hướng | Cơ chế | Kết quả |
|---|---|---|
| **Console VÀO backoffice** | Embeddable SDK (iframe) | Agent làm việc trong backoffice — trả lời chat/ticket không rời app |
| **Backoffice VÀO console** | App/Widget (`manifest.json`, iframe) | Panel context 360° (số dư/giao dịch/KYC từ `operator-support-api`) hiện cạnh hội thoại |

→ Kết hợp: console nằm trong backoffice, panel 360° của ta nằm trong console → agent thấy **cả chat lẫn ngữ cảnh player**
trên một màn hình, giữ được ranh giới data (dữ liệu tài chính chi tiết vẫn ở `operator-support-api`, §6.4.2).

**Lưu ý:** SDK tải từ `static.comm100.io` → cloud vẫn lộ dấu vết Comm100 khi soi network, nhưng đây là **backoffice nội bộ
cho agent** (player không thấy) → không phải vấn đề branding (khác với widget player-facing ở §6.5).

> **CHỐT §6 (điều chỉnh theo ưu tiên "triển khai nhanh"):** **MVP dùng Comm100 CLOUD** (iGaming-friendly, launch ~2 tuần,
> AI Agent/Copilot sẵn) làm inbox/chat/ticketing đa kênh; **map tài khoản Operator qua JWT Visitor SSO + Custom Variables**;
> **lớp `operator-support-api` tự viết + `@megawin/audit`** giữ context 360° tài chính và audit ở phía ta (chống khoá cứng +
> data residency). Kênh Zalo OA tự tích hợp qua webhook. **Loại Intercom vì AUP cấm gambling (§6.3).** **Self-host OSS
> (Chatwoot/Zammad) và on-premise Comm100 là đường nâng cấp SAU** khi cần tự chủ data sâu / tối ưu chi phí ở volume lớn —
> nhờ `operator-support-api` đứng giữa, việc chuyển không phá kiến trúc. AI RAG tự chủ (Bedrock/self-hosted §5.1) cân nhắc khi
> muốn kiểm soát AI sâu hơn AI Agent của Comm100.

### 6.5 White-label / ẩn dấu vết vendor (nếu cần)

Comm100 có **White Label branding**: đổi sub-domain, product name, logo, favicon, theme, font, CSS/JS tùy biến; bỏ
"Powered by Comm100" (Plus/Ultra). **Với player thường → giấu được gần trọn** (widget trông như sản phẩm MegaWin).

**Giới hạn quan trọng:** với **cloud**, người soi kỹ thuật (DevTools/Network) vẫn có thể thấy request về `*.comm100.io`
— CSS/logo chỉ đổi bề mặt, không đổi runtime endpoint. **Chỉ on-premise** (traffic ở domain/hạ tầng của ta) mới ẩn được
với cả người kiểm tra kỹ thuật. → Ở giai đoạn cloud-first: white-label đủ cho branding với player; nếu sau này cần ẩn
hoàn toàn khỏi soi kỹ thuật thì đó là thêm một lý do chuyển on-premise.

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

> **Lựa chọn MVP (ưu tiên triển khai nhanh):** dùng **Comm100 cloud** cho inbox/chat/ticketing/AI (§6.4). Cột "MVP" bên
> dưới phản ánh điều đó; cột "Đường thay thế sau" là hướng tự chủ hơn (self-host OSS / Bedrock / on-premise) khi cần.

| Layer | MVP (khuyến nghị) | Đường thay thế sau |
|---|---|---|
| Player Help Center + chat widget | Next.js 16 (route group `(support)` trong `operator-web`) + **Comm100 Live Chat widget SDK** | Chatwoot widget SDK (self-host) |
| Agent console + inbox + ticketing | **Comm100 cloud** — **nhúng vào `operator-backoffice`** qua Embeddable SDK + Agent SSO (JWT), agent không mở web Comm100 riêng (§6.4.3) | Chatwoot/Zammad self-host trên ECS Fargate |
| Map danh tính player | **Comm100 Visitor SSO (JWT, IdP-initiated) + Custom Variables**, JWT ký ở BFF (§6.4.2) | HMAC identity (Chatwoot) |
| Orchestration CS | **`operator-support-api`** (Lambda + Middy + Zod như `api-player`, hoặc gắn vào `operator-api`) | (không đổi) |
| AI deflection / RAG | **AI Agent + Copilot của Comm100** (train từ Help Center) | Bedrock KB + Guardrails; hoặc self-host pgvector/Qdrant + vLLM + `bge-m3` |
| Context data (đọc-only) | API của `operator-wallet-svc`, `operator-payment`, KYC, Risk — nhúng console qua UI Integration của Comm100 | (không đổi) |
| Kênh Zalo OA | Zalo OA API + webhook → `operator-support-api` → Comm100 (qua API) | → Chatwoot inbox |
| Kênh Telegram/Email | **Comm100 Channels** (Telegram Bot Token; Email mailbox) — cấu hình sẵn | Chatwoot native |
| Notification chủ động | **SNS / SES / Pinpoint** (`@megawin/notification`) | (không đổi) |
| Audit / compliance | **`@megawin/audit`** (nhật ký bất biến — đã có trong repo) | (không đổi — luôn ở phía ta) |
| Voice (sau) | **Amazon Connect + Amazon Lex + Bedrock** | (không đổi) |
| Secrets (JWT key, token Zalo/WhatsApp/PSP) | **Secrets Manager + KMS** | (không đổi) |
| Infra | Turborepo (deploy độc lập `--filter`), Serverless Framework, AWS | (không đổi) |

**Cấu trúc đề xuất trong monorepo (thêm vào, không sửa core):**

> **Naming — theo rule `.cursor/rules/operator-monorepo-structure.mdc`:** prefix `operator-` BẮT BUỘC cho mọi
> app/package (product prefix TRƯỚC, runtime suffix SAU). CS là một bounded context của product Operator.

```
apps/
  operator-web/                # (đã có §11.1) — thêm route group (support): Help Center, chat widget, My Tickets
  operator-support-api/        # Lambda/Fargate — orchestration: ký JWT SSO, context 360°, action contract, escalate, audit
  operator-worker-support/     # workers async: sync context, proactive messaging, (index KB → vector khi tự host RAG sau)
packages/
  operator-support/            # domain types CS dùng chung (Ticket, Conversation, Channel, EscalationReason...) + application
  operator-support-ai/         # abstraction lớp AI/RAG (Comm100 adapter | Bedrock adapter | self-hosted adapter) — thay thế được
  operator-channel-adapters/   # adapter Zalo OA / Telegram / WhatsApp / Email → chuẩn hoá về 1 message shape
```

> **Lưu ý cache:** giai đoạn Comm100 cloud **không cần** tự nuôi Redis/Postgres cho console (Comm100 lo). `@megawin/cache`
> (ElastiCache Redis) chỉ cần cho `operator-support-api` (session/context cache). Chỉ khi chuyển self-host OSS mới phải dựng
> Rails/Postgres/Redis cho console — đó là chi phí vận hành hoãn lại được.

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

- **P1 (cùng Player MVP)** — **CS-P0:** Help Center/KB cơ bản + Live Chat widget (**Comm100 cloud**) trong `operator-web`;
  **map player qua JWT Visitor SSO** (§6.4.2); ticketing gắn `playerId`; audit hội thoại nhạy cảm về `@megawin/audit`. Đủ
  để hỗ trợ khi bắt đầu có player thật — launch nhanh, không phải nuôi hạ tầng console.
- **P2 (cùng Payment & Ops)** — **CS-P1:** bật **AI Agent (Comm100)** deflect 4 nhóm câu hỏi (§4.2); context 360° trong
  agent console (qua `operator-support-api` + UI Integration); routing + SLA; kênh Email + Telegram. Dispute nạp/rút với maker-checker.
- **P3 (cùng Affiliate)** — **CS-P2:** Zalo OA + WhatsApp; AI Copilot cho agent; VIP segmentation; proactive messaging
  (giao dịch treo, KYC nhắc). RG intervention flow qua CS.
- **P4** — **CS-P3:** Voice/hotline (Amazon Connect + Lex + Bedrock) cho VIP/ca phức tạp; **đánh giá chuyển sang self-host
  OSS (Chatwoot/Zammad) hoặc on-premise Comm100** + RAG tự chủ (Bedrock/self-hosted) nếu volume/chi phí/data-residency biện
  minh — nhờ `operator-support-api` đứng giữa, việc chuyển không phá kiến trúc.

---

## 11. Rủi ro & lưu ý sớm

- **AI hallucination về tiền/bonus:** model bịa câu trả lời sai về nạp/rút/WR = mất tiền + mất niềm tin. **Bắt buộc RAG
  grounded + Guardrails**, và AI chỉ *giải thích* — không tự thực hiện action tài chính.
- **Data residency & PII trong hội thoại (Comm100 cloud):** chat chứa PII + dữ liệu tài chính. Ở giai đoạn cloud, chỉ đẩy
  **định danh + nhãn tối thiểu** sang Comm100 (§6.4.2); giữ context tài chính chi tiết ở phía Operator qua `operator-support-api`.
  Chọn region + ký DPA. Data-residency đầy đủ là lý do chuyển on-premise/self-host sau (§6.4, §6.5).
- **Zalo không được vendor hỗ trợ native:** kênh VN quan trọng nhất phải **tự tích hợp** — tính vào effort ngay từ đầu.
- **Self-exclusion bị bypass:** nếu enforcement lỏng (chỉ ẩn UI, không chặn thật) = vi phạm nghiêm trọng. Lockout phải ở
  RG context, non-bypassable, cross-device — CS không được là điểm enforcement.
- **Identity resolution xuyên kênh:** map sai Zalo/Telegram id → `playerId` = lộ dữ liệu player khác. Web widget dùng JWT
  Visitor SSO (an toàn); social channel cần liên kết an toàn (mã liên kết/OTP) trước khi hiển thị context 360°.
- **Chi phí AI/usage khó dự toán:** Comm100 usage-based + AI đội chi phí khi scale. Đặt alarm chi phí; giữ khả năng chuyển
  self-hosted/on-premise.
- **Khoá cứng vào Comm100:** proprietary, không sở hữu source. Giảm rủi ro bằng lớp `operator-support-api` + `@megawin/audit` ở
  phía ta (audit & context 360° không nằm ở vendor) → đổi console/vendor sau không phá kiến trúc.

---

## 12. Điểm còn mở (cần chốt với team)

- Nền tảng cho MVP: **Comm100 cloud (khuyến nghị hiện tại — ưu tiên triển khai nhanh, iGaming-friendly, §6.4)** hay
  self-host OSS Chatwoot/Zammad? → **Comm100 cloud cho MVP**; self-host OSS + on-premise Comm100 là đường nâng cấp sau
  (§6.2, §6.4). **KHÔNG dùng Intercom — AUP cấm gambling (§6.3).**
- AI: dùng **AI Agent/Copilot của Comm100** ở MVP, hay tự dựng RAG (Bedrock KB / self-hosted pgvector + vLLM + `bge-m3`)?
  → **dùng AI của Comm100 cho MVP; giữ `operator-support-ai` interface thay thế được** khi cần kiểm soát AI sâu hơn (§5.1).
- `operator-support-api` là Lambda riêng hay gắn vào `operator-api` BFF? → cần chốt theo tải & ranh giới.
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
- **Comm100 cloud — omnichannel (Live Chat + Ticketing & Messaging: Email/SMS/WhatsApp/Telegram/LINE/WeChat...), AI Agent
  (~70% chat) + Copilot, launch ~2 tuần, usage-based pricing; on-premise là đường nâng cấp** — comm100.com, help.comm100.com
  (getting-started, Telegram integration, SLA on Telegram)
- **Comm100 Visitor SSO (SAML/JWT) + IdP-initiated JWT qua `Comm100API.set('livechat.sso.jwt', ...)` + Custom Variables
  `livechat.customVariables`; credential không đi qua Comm100 → map account operator không lộ mật khẩu** —
  help.comm100.com/how-to-set-up-visitor-single-sign-on, developer.comm100.com (visitor SSO server-api, visitor-side-api)
- **Comm100 Embeddable SDK — nhúng Agent Console vào hệ thống khác qua iframe (`EmbeddedAgentConsole`), JS API hai chiều
  (`currentAgent`, `agentconsole.navBar.*`, chat events); Agent SSO (JWT) + App extended authentication để đăng nhập bằng
  tài khoản hệ thống của mình; App/Widget (`manifest.json`) nhúng panel context vào console** — developer.comm100.com
  (embed-comm100-agent-console, embeddable-api-agent-console, app-extended-authentication, app)
- **Comm100 White Label (sub-domain, product name, logo, favicon, theme, CSS/JS; bỏ "Powered by Comm100" ở Plus/Ultra);
  cloud vẫn lộ endpoint `*.comm100.io` khi soi network → ẩn hoàn toàn cần on-premise** — help.comm100.com (remove powered-by,
  custom CSS, branding image), Comm100 WhiteLabel Solution Sheet
- So sánh vendor & pricing (Zendesk per-agent ~$55; Intercom Fin $0.99/resolution; Freshdesk; Crisp per-workspace) — Zendesk, CompareTiers, Quickchat AI
- Self-host open-source (Chatwoot MIT, không per-seat, WhatsApp/Telegram native, không Zalo native, deploy AWS) — Chatwoot, GitHub chatwoot/chatwoot, useconverge
- So sánh OSS self-host (Chatwoot chat-first vs Zammad ticketing/SLA/RBAC/audit; Libredesk, FreeScout, osTicket, Ticqex) — OSSAlt Chatwoot-vs-Zammad, openmsp.ai, supportgpt.app, invgate
- **Intercom AUP cấm real-money/illegal gambling + sports betting (mục 2.d); data residency US; audit 2 năm; Fin $0.99/resolution** — intercom.com/legal/acceptable-use-policy, intercom.com/legal/subprocessors-list, lorikeetcx.ai (Fin regulated-industry limitations, online-casino AI comparison), usefini.com
- Self-hosted vs cloud trade-offs (data sovereignty, compliance, AI gap) — Supp blog
- Self-hosted RAG (pgvector/Qdrant + vLLM + `bge-m3` đa ngôn ngữ, OpenAI-compatible, tiếng Việt) — UpCloud, Tensoria, vietnamese-rag-system, techopsasia
- AWS AI support stack (Bedrock Knowledge Base + Guardrails + Agents; Lex; Connect voice + handover; OpenSearch Serverless) — AWS Connect/Bedrock docs, Rootquotient
- Kênh VN (Zalo OA / Telegram / Facebook flows, pgvector RAG) — Datazen-AI, NextX
- Self-exclusion airtight & audit-ready (PAM là source of truth, lockout tức thì non-bypassable, CS là interface không phải enforcement) — wizards.us, cadencewavez, SDLC CORP


