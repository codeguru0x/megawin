# System — Tự động lấy & đối soát kết quả quay thưởng từ Vietlott (Analysis)

> **Status:** `discussing` · **Ngày:** 17/08/2026
> **Nguồn tham chiếu:**
> - Thảo luận trong AI Panel chat, khởi nguồn từ câu hỏi so sánh `web_fetch` vs `web_search`
>   (`apps/backoffice/agent/tools/web_fetch.ts`, `web_search.ts`) và allowlist
>   (`apps/backoffice/src/lib/web-fetch-allowlist.ts`).
> - Khảo sát code thực tế (17/08/2026) qua subagent `explore`, đọc:
>   `apps/backoffice/src/app/api/*/draws/[drawId]/publish-result/route.ts` (7 game),
>   `packages/game-*-application/src/use-cases/draws/publish-result.ts` (7 game),
>   `packages/game-*-application/src/infras/repos/draw-repo.ts` (publish/republish/vietlottRef),
>   `packages/game-core/src/types/draw.ts` (`DrawVietlottRef`),
>   `packages/game-core/src/entities/game-core.enums.ts` (`DrawResultSource` — 0 call site),
>   `apps/backoffice/src/app/(main)/games/*/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx` (7 game),
>   `apps/worker-lotto535/serverless.yml` + `src/functions/*.yml` (cron pattern).
> - Đọc `.cursor/plans/ai-panel/p0-04-sandbox-chat-ux.plan.md` (thiết kế `web_fetch`/`bash`
>   sandbox, HITL approval, render tool output 3 tầng).
> - Web search xác nhận Vietlott KHÔNG có API công khai chính thức (17/08/2026):
>   `vietvudanh/vietlott-data` (Python crawler, GitHub Actions daily), endpoint nội bộ
>   `api.vietlott.vn/services/?securitycode=vietlotcmc&jsondata={...}` (undocumented), mirror
>   site `xosoapi.online` (API thương mại có Vietlott + Keno realtime).
> - Package sẵn có: `ai@^7.0.65` trong `apps/backoffice/package.json` → `generateObject` dùng
>   được ngay cho extractor, không cần thêm dependency.

## 1. Bối cảnh & mục tiêu

User hỏi 3 vòng, mỗi vòng thu hẹp phạm vi:

1. *"`web_fetch` và `web_search` khác nhau thế nào? Muốn tự động lấy kết quả xổ số/Vietlott."*
2. *"Chỉ muốn lấy kết quả tham khảo trong chat Mira, rồi thiết kế HITL để cập nhật kết quả sau
   thay vì làm trên UI."*
3. *"Có giải pháp dùng AI tách biệt hoặc tool lấy kết quả trọn vẹn và an toàn không? Vì sao
   ChatGPT trả lời rất cụ thể?"*

**Mục tiêu cuối:** thiết kế một luồng để staff hỏi Mira (AI Panel) về kết quả kỳ quay Vietlott,
rồi **duyệt qua HITL ngay trong chat** để publish kết quả vào `DrawDoc.result` — thay thế một
phần việc nhập tay hiện tại (100% manual, 7 game, tới 20 ô số/kỳ cho keno, ~120 kỳ/ngày).

**Ràng buộc cứng không thể đánh đổi:** số trúng thưởng chảy thẳng vào `PublishResultUseCase` →
`settle` → `payout` — sai 1 chữ số là trả thưởng sai bằng tiền thật. Mọi thiết kế phải giữ
nguyên tắc này làm trung tâm.

## 2. Hiện trạng — đã đọc code thật, không phỏng đoán

### 2.1. `web_fetch` vs `web_search` (2 tool eve hiện có)

| | `web_fetch` (BẬT, có kiểm soát) | `web_search` (TẮT hẳn) |
|---|---|---|
| Input model đưa | 1 URL cụ thể | 1 câu truy vấn |
| Nguồn | Allowlist 9 hostname (`WEB_FETCH_ALLOWED_HOSTS`) | Toàn internet, do provider (Exa/Parallel) chọn |
| Chạy ở đâu | **App runtime** — cùng process Next.js, thấy full `process.env` (`MONGODB_URI`, AWS creds) | Provider-managed |
| Approval | `always()` — staff duyệt mỗi lần | N/A — `disableTool()` |
| File | `apps/backoffice/agent/tools/web_fetch.ts` + `src/lib/web-fetch-allowlist.ts` (tách riêng để test được, không kéo theo năng lực HTTP thật) | `apps/backoffice/agent/tools/web_search.ts` |

Guard nằm ở `execute`, không chỉ ở prompt:

```41:51:apps/backoffice/agent/tools/web_fetch.ts
  async execute(input, ctx) {
    const url = extractUrl(input);
    if (url === undefined || !isAllowedWebFetchUrl(url)) {
      throw new Error(webFetchBlockedMessage(url));
    }
    return webFetch.execute(input, ctx);
  },
```

`web_search` bị tắt vì không có chỗ nào đặt allowlist — bề mặt injection = cả internet, mà nhu
cầu nghiệp vụ gần như bằng không (`p0-04` §2.3).

Allowlist hiện tại (`apps/backoffice/src/lib/web-fetch-allowlist.ts:23-35`):

```
vietlott.vn, www.vietlott.vn, info.vietlott-sms.vn,
xoso.com.vn, www.xoso.com.vn, minhngoc.net.vn, www.minhngoc.net.vn,
ketqua.net, www.ketqua.net
```

### 2.2. Luồng publish kết quả hiện tại — 100% nhập tay

Tất cả 7 game (`lotto535`, `mega645`, `power655`, `max3d`, `max3dpro`, `keno`, `bingo18`) theo
đúng 1 khuôn:

**Route:** `POST /api/<game>/draws/[drawId]/publish-result` — auth `CompanyRole.Staff`, Zod
validate body, gọi `PublishResultUseCase.run()`.

**Use-case** (`packages/game-*-application/src/use-cases/draws/publish-result.ts`) — quyết định
dựa trên `draw.settledAt` (không phải `status`):

| Trạng thái draw | Hành động |
|---|---|
| Chưa từng settle (`salesClosed`/`published`) | `publishResult()` — ghi `result`, status → `Published` |
| Đã settle, số **không đổi**, có `vietlottRef` mới | Chỉ `updateVietlottRef()` — không đụng `financial`/`stats` |
| Đã settle, số **đổi**, status `Settled` | `republishResultAfterSettled()`: `settled → published` + `$unset financial/stats/settleSummary` → **mở lại resettle** |
| Status `Settling` | Guard chặn — không cho publish khi đang settle |

**Sau publish: KHÔNG tự trigger settle.** Settle là action riêng của staff
(`trigger-settle` → Step Functions `startExecution`, execution name deterministic = idempotent).
Đây là **cửa an toàn quan trọng nhất còn lại** trong toàn hệ thống hiện tại.

**UI form** (`.../draw-actions/publish-result-action.tsx` × 7 game): dialog với input 2-ký-tự
từng số (5+1 lotto535, 6 mega645, 6+bonus power655, **20 số keno**, 3 bingo18, 20 triplet
max3d/max3dpro), cộng section "Tham chiếu Vietlott" tuỳ chọn (`drawPeriod` + `drawDate`).

### 2.3. `DrawVietlottRef` — đã có sẵn, chỉ 2 field

```27:37:packages/game-core/src/types/draw.ts
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (ví dụ "00123"). */
  drawPeriod: string;
  /** Ngày quay Vietlott, format "YYYY-MM-DD". */
  drawDate: ISODateString;
}
```

Lưu ở `DrawDoc.vietlottRef` (top-level, sibling của `result`) — **không tham gia
matching/payout**, chỉ để đối soát. Đây là lý do đổi riêng `vietlottRef` không trigger resettle.

### 2.4. `DrawResultSource` — đã định nghĩa, 0 call site

```251:261:packages/game-core/src/entities/game-core.enums.ts
export const DrawResultSource = {
  Vietlott: "vietlott",   // Import tự động từ Vietlott
  Manual: "manual",       // Nhập tay bởi admin/staff
  Import: "import",       // Import batch từ file/hệ thống bên ngoài
} as const;
```

**Không có field `resultSource` trên `DrawDoc`.** Enum này là scaffolding bỏ dở — đúng chỗ để
dùng khi triển khai tính năng này.

### 2.5. Không có bất kỳ automation nào hiện tại

Search toàn repo (17/08/2026): `crawl|scrape|scraper|puppeteer|cheerio` → 0 match code thật
(chỉ `jsdom` làm test environment). `await fetch(|axios.|got(` trong `apps/worker-*` → 0 match.
Không có `infra/`/`cdk/` directory.

### 2.6. Hạ tầng eve đã sẵn sàng cho HITL trong chat

- **Channel auth** (`apps/backoffice/agent/channels/eve.ts`): verify session better-auth, đính
  `accountId`/`roles` vào context cho tool đọc — tool ghi dữ liệu biết được ai đang duyệt.
- **HITL render** (`apps/backoffice/src/components/ai-chat/render-message.tsx`,
  `InputRequestActions`): đã chạy thật từ p0-03, nút Có/Không cho `tool-approval`, xử lý cả case
  "mồ côi" (turn bị ngắt giữa lúc chờ duyệt).
- **Render tool output 3 tầng** (`p0-04` §4.11): Tầng 0 markdown, Tầng 1 `defineToolView(spec)`
  (~12 dòng/tool, dùng cho bảng/KPI), Tầng 2 component bespoke. Nguyên tắc đã chốt: **model
  không được quyết định layout**, số không đi qua tham số do model tự soạn.
- **`toJsonSafe()`** (`src/lib/json-safe.ts`) — bắt buộc cho mọi tool đọc Mongo vì eve reject
  `Date` ở biên tool.
- **Audit actor** (`src/lib/audit-actor.ts`, `actorFromSession`) — map session → `AuditActor`
  cho audit log, đã dùng ở mọi route publish hiện tại.

### 2.7. Nguồn dữ liệu Vietlott — không có API công khai chính thức

Xác nhận qua web search (không phải giả định):

| Nguồn | Dạng | Ghi chú |
|---|---|---|
| `api.vietlott.vn/services/?securitycode=vietlotcmc&jsondata={"Command":"Get<Game>Result",...}` | JSON | Undocumented, endpoint nội bộ, có thể đổi/khoá bất kỳ lúc nào |
| `POST vietlott.vn/Ajax/PrevNextResultGame<X>` | HTML fragment | Cũng nội bộ, cần đúng field form (`gameId`, `drawId`, `dayPrize`) |
| Trang kết quả chính thức (`/vi/trung-thuong/ket-qua-trung-thuong/<product>`) | HTML | Ổn định hơn về URL, nhưng layout có thể đổi |
| Mirror site (`minhngoc.net.vn`, `xoso.com.vn`, `ketqua.net`) — đã trong allowlist | HTML | Layout khác Vietlott — hữu ích làm **nguồn thứ 2 để quorum** |
| `xosoapi.online` | JSON (trả phí) | Có Vietlott + Keno realtime, SLA rõ, không phải tự bảo trì parser |
| `vietvudanh/vietlott-data` (GitHub, Python) | JSONL qua GitHub Actions | Chứng minh cách khác đã làm được, không dùng trực tiếp (khác stack) |

7 game MegaWin mirror 1:1 sản phẩm Vietlott: `lotto535`=Power 5/35, `mega645`=Power 6/45,
`power655`=Power 6/55, `max3d`/`max3dpro`, `keno`, `bingo18`.

## 3. Phân tích — vì sao KHÔNG thể dùng `web_fetch`/model đọc-rồi-ghi trực tiếp

### 3.1. Vì sao ChatGPT "trả lời rất cụ thể" không phải là bằng chứng an toàn

ChatGPT search + browse nhiều trang + tổng hợp, tỉ lệ đúng cao vì kết quả xổ số được mirror ở
hàng chục site. Nhưng có bất đối xứng quyết định:

| | ChatGPT | Hệ MegaWin |
|---|---|---|
| Hệ quả khi sai | Người đọc thấy lạ thì hỏi lại | Ghi `DrawDoc.result` → `settle` → **trả thưởng sai bằng tiền thật** |
| Ai kiểm | Con người, ngay lúc đó, bằng trực giác | Không ai, nếu đã auto |
| Câu trả lời sai trông thế nào | **Giống hệt câu trả lời đúng** — cùng định dạng, cùng độ tự tin | Giống hệt |

Mô hình được tối ưu để *nghe có vẻ hữu ích và cụ thể*, không phải để *đúng hoặc từ chối*.
Không thể phân biệt đúng/sai chỉ bằng cách đọc câu trả lời. Vấn đề không phải năng lực AI —
là **khả năng kiểm chứng**, và đó là thứ phải thiết kế vào hệ thống, không thể trông cậy vào
việc "model đủ giỏi".

Các chế độ sai thật, đều trông y hệt lúc đúng: lấy kỳ hôm qua thay vì hôm nay; nhầm Power 6/45
với 6/55; cache cũ; và nặng nhất — khi không mở được trang, model **bịa số có định dạng hoàn
hảo** (không có tín hiệu nào phân biệt được với số thật).

### 3.2. Vì sao KHÔNG dùng chính agent Mira để parse-và-ghi

Ba lý do không thể vá bằng cấu hình:

1. **`approval: always()` mâu thuẫn với "tự động"** — keno + bingo18 ≈ 280 kỳ/ngày → 280 lần
   duyệt/ngày nếu mỗi lần fetch cần duyệt riêng.
2. **LLM parse là phi tất định** — cùng 1 trang, 2 lần chạy có thể ra 2 kết quả khác nhau. Số
   trúng thưởng đi thẳng vào `settle` → `payout`.
3. **Nội dung web là untrusted** (`instructions.md` §7 đã ghi rõ). Nếu model được quyền ghi
   `result`, indirect prompt injection = **đổi được số trúng thưởng** — leo thang từ "rò rỉ số
   liệu" lên "sửa đường tiền".

**Sai lầm cụ thể cần tránh:** để model gọi tool ghi với số nó tự đọc rồi soạn vào tham số:

```
publishDrawResult({ drawId: "2026-08-16.001", winningNumbers: ["03","17","28",...] })
```

Dù có card HITL hiện `part.input` cho staff duyệt, staff chỉ thấy **số do model soạn**, không
phải số nguồn thật — duyệt mà vẫn có thể sai. Đây đúng nguyên tắc đã chốt ở `p0-04` §4.11 quyết
định #1 khi thiết kế render tool (lúc đó chỉ để hiển thị, giờ là đường ghi — stake cao hơn
nhiều): *"model phải copy số vào tham số ⇒ số đi qua model trước khi tới UI ⇒ kênh sai số"*.

### 3.3. Pattern đúng — "AI tách biệt" = quarantined extractor (dual-LLM)

Ý "AI tách biệt" của user đúng về kiến trúc — đây là pattern chuẩn chống prompt injection cho
agent có tool: tách một LLM khác, bị cách ly hoàn toàn, chỉ làm đúng 1 việc.

| | Mira (agent chat) | Extractor cách ly |
|---|---|---|
| Thấy hội thoại + số liệu tài chính | Có | **KHÔNG** — chỉ nhận đúng 1 chuỗi HTML đã cắt gọn |
| Có tool | Có (`bash`, `web_fetch`, report tools) | **KHÔNG có tool nào** |
| Output | Văn bản tự do | **JSON theo schema cứng** (`generateObject`) — không có field text tự do |
| Bị injection thì làm được gì | Gọi tool, gửi dữ liệu ra ngoài | **Không gì cả** — không có tay chân; output sai bị lớp validate chặn |
| Model đề xuất | `claude-sonnet-5` (đang dùng cho Mira) | Model rẻ (`gemini-flash`/`haiku`) qua AI Gateway |

Về bản chất, đây không phải "agent thứ hai" — nó là **một hàm thuần**
`extractDrawResult(html) → JSON`, gọi bằng `generateObject` (package `ai@^7.0.65` đã có sẵn
trong `apps/backoffice/package.json`, không cần thêm dependency), nằm trong `execute` của 1
tool. Injection trong trang tối đa làm nó trả JSON sai — JSON sai bị lớp validate sau bắt được.

### 3.4. Kiến trúc 4 lớp — mỗi lớp bắt một loại lỗi khác nhau

```
fetch (URL hardcode)  →  L1 Extractor cách ly   →  L2 Validate tất định  →  L3 Quorum 2 nguồn  →  L4 HITL
   không SSRF            HTML → JSON có schema      Zod + luật game          so khớp chéo         staff duyệt
                         (LLM rẻ, không tool)       (KHÔNG có LLM)                                 số render từ DB
```

**L2 là lá chắn thật, và nó không có AI.** Luật game đã tồn tại sẵn — đúng ràng buộc Zod schema
route publish đang enforce:

| Game | Ràng buộc L2 |
|---|---|
| keno | đúng **20** số, `"01"`–`"80"`, không trùng |
| power655 | 6 số `"01"`–`"55"` + bonus, bonus ∉ main |
| mega645 | 6 số `"01"`–`"45"`, không trùng |
| lotto535 | 5 số `"01"`–`"35"` + special `"01"`–`"12"` |
| max3d/pro | 20 triplet `/^\d{3}$/`, chia đúng 2/4/6/8 |
| bingo18 | 3 số 1–6 |
| Mọi game | `drawPeriod`/`drawDate` khớp kỳ đang xét |

Ma trận lỗi × lớp chặn:

| Loại lỗi | L1 (extractor) | L2 (validate) | L3 (quorum) | L4 (HITL) |
|---|:--:|:--:|:--:|:--:|
| Bịa số khi không mở được trang | — | ✅ | ✅ | ✅ |
| Thiếu/thừa/trùng số, sai range | — | ✅ | ✅ | ✅ |
| Lấy sai kỳ (hôm qua) | — | ✅ | ✅ | ✅ |
| Nhầm game (6/45 ↔ 6/55) | — | ✅ | ✅ | ✅ |
| **Đảo 1 chữ số, vẫn hợp lệ** | — | ❌ | ✅ | ⚠️ (dễ mù mắt) |
| Injection ép đổi số | ✅ cách ly | ✅ | ✅ | ✅ |
| HTML đổi layout | ✅ LLM tự thích ứng | ✅ | ✅ | ✅ |

**Rủi ro còn lại sau L2 chỉ còn đúng 1 loại: đảo/thay 1 chữ số mà kết quả vẫn hợp lệ về mặt
định dạng** (`03`→`08`). L2 mù với ca này — chỉ L3 (2 nguồn độc lập) bắt được, vì rất khó để 2
nguồn khác nhau cùng sai giống nhau. L4 (mắt người) là lớp cuối nhưng **không nên là lớp
chính** — staff đọc 20 số keno hàng trăm lần/ngày sẽ mù dần theo thời gian.

### 3.5. Vì sao dùng extractor thắng viết parser regex/DOM thủ công

| | Parser regex/DOM thủ công | Extractor cách ly (LLM rẻ) |
|---|---|---|
| Công viết ban đầu | 7 game × N nguồn = 14–21 parser | 1 hàm chung + 7 schema (schema đã có sẵn ở route publish) |
| Vietlott đổi HTML | Vỡ **im lặng**, phải sửa parser + fixture | Thường tự thích ứng; nếu không, L2 chặn + alert |
| Thêm nguồn thứ 2 (layout khác hẳn) | Viết parser mới | 0 dòng — cùng hàm, khác URL |
| Nợ bảo trì dài hạn | Cao, mãi mãi | Thấp |

Nghịch lý đáng ghi: thêm AI (đúng cách, đúng vị trí) làm hệ **dễ** an toàn hơn, vì nó khiến
quorum nhiều nguồn gần như miễn phí về công viết — mà quorum mới là lớp mang lại an toàn thật
(L3), không phải bản thân extractor.

**Ngoại lệ quan trọng:** nếu GATE khả thi (§5) tìm được endpoint trả JSON có cấu trúc rõ (ví dụ
`api.vietlott.vn/services/...`), nguồn đó **không cần extractor** — Zod parse trực tiếp là đủ
và tốt hơn (tất định 100%, không tốn LLM call). Extractor chỉ dành cho nguồn HTML/mirror không
có JSON.

### 3.6. Chi tiết triển khai extractor cần lưu ý

- **`generateObject` + schema**, không phải `generateText` rồi `JSON.parse` — schema chỉ chứa
  số + kỳ + ngày, **không có field text tự do** để injection không có đường mang chỉ thị đi
  tiếp qua lớp sau.
- **System prompt cho extractor phải cho quyền nói "không tìm thấy"** (`found: false`) — quan
  trọng hơn mọi rule khác, vì bịa số chủ yếu xảy ra khi model bị ép phải luôn trả lời có.
- **Cắt HTML trước khi gửi**: chỉ giữ vùng kết quả, cap kích thước — giảm token, giảm bề mặt
  injection.
- **Batch nhiều kỳ trong 1 call** khi trang liệt kê nhiều kỳ (vd trang keno) — chi phí gần như
  không đáng kể so với gọi riêng từng kỳ.
- **Lưu snapshot** (`rawHash`, HTML gốc hoặc hash, `url`, `fetchedAt`) — tái hiện được "số này
  lấy từ đâu, lúc nào, extractor version nào". ChatGPT không cho được điều này.
- **Không dùng "chạy extractor 2 lần cùng input rồi so"** để thay quorum — cùng model + cùng
  input thì lỗi tương quan, so sánh vô nghĩa. Quorum PHẢI là 2 **nguồn** khác nhau.

## 4. Đề xuất đã re-review

### 4.1. Nguyên tắc thiết kế đã chốt (không đổi trong mọi phương án)

1. **Số không đi qua tham số do model tự soạn.** Tool ghi chỉ nhận **handle/token**
   (`importId`), không nhận số. Model điều phối, không sản xuất số.
2. **Card HITL phải render số từ server** (đọc lại từ DB theo `importId`), không render
   `part.input` — tránh "duyệt mù" theo input model soạn.
3. **Không đụng `PublishResultUseCase`** — tool mới compose gọi lại đúng use-case UI đang dùng.
   Settle vẫn là hành động riêng của người (giữ nguyên cửa an toàn hiện tại).
4. **Fail-closed ở mọi lớp** — parse thất bại / L2 fail / quorum lệch → không ghi gì, alert,
   không bao giờ ghi kết quả một phần.
5. **`resultSource: "vietlott"`** dùng enum `DrawResultSource` đã có sẵn (0 call site hiện tại)
   — đây là chỗ để dùng nó, kèm audit `metadata.extra.channel = "ai-panel"`.

**Verdict: keep — pattern quarantined extractor (§3.3–3.4) là verdict chính của phân tích này.**
Lý do: giải quyết đúng gốc rễ (khả năng kiểm chứng, không phải năng lực model), tái dùng hạ tầng
eve đã có (HITL, audit actor, render 3 tầng), và không đụng luồng settle hiện tại.

### 4.2. Thiết kế 2 tool tách bạch đọc/ghi

| | Tool 1 — đọc | Tool 2 — ghi |
|---|---|---|
| Tên đề xuất | `getVietlottDrawResult` | `publishDrawResultFromImport` |
| Input | `{ gameKey, drawId }` | `{ gameKey, drawId, importId }` — **không có số** |
| Việc | fetch nguồn hardcode → L1 extractor (nếu cần) → L2 validate → lưu candidate vào
  collection mới `drawResultImports` → trả `{ importId, numbers, source, matchStatus }` | nạp
  candidate theo `importId` → assert khớp `drawId`/`gameKey` → gọi `PublishResultUseCase.run()` |
| Approval | `never()` — chỉ đọc, URL hardcode nên không SSRF, model không chọn được URL | **`always()`** — bắt buộc |
| Guard trong `execute` | Throw nếu parse fail (fail-closed) | Throw nếu: draw đã `Settled` (từ chối, đẩy về UI vì mở resettle); role không đủ; `importId` hết TTL (~15 phút); `importId` đã publish (no-op idempotent) |

Card HITL cho `publishDrawResultFromImport` cần **custom renderer** (không dùng
`DefaultToolView`/`ToolInput` mặc định): đọc `importId` → gọi route
`GET /api/<game>/draws/[drawId]/external-result/[importId]` → render số theo đúng layout từng
game + `drawId` + trạng thái draw + nguồn + thời điểm fetch + cảnh báo đỏ nếu đã settled.

### 4.3. Data model cần bổ sung

| Thay đổi | Vì sao |
|---|---|
| `DrawDoc.resultSource: DrawResultSource` | Enum đã có, field chưa có — không có nó thì audit về sau bị mù nguồn gốc kết quả |
| Collection mới `drawResultImports` (`gameKey`, `drawId`, `sourceHost`, `url`, `fetchedAt`, `rawHash`, `parsed`, `matchStatus`) | Bằng chứng gốc cho tranh chấp — "số này lấy từ đâu, lúc nào" |
| Mapping `drawId` (`YYYY-MM-DD.NNN`) ↔ mã kỳ Vietlott (`00123` hoặc `#0110271` keno) | Chỗ khó nhất về nghiệp vụ — map sai = gán kết quả kỳ khác vào kỳ này, nguy hiểm hơn không có tính năng |

### 4.4. Lộ trình 3 mức — tăng dần, dùng cùng 1 adapter

| Mức | Việc | Công ước lượng | Được gì | Verdict |
|---|---|---|---|---|
| **P0 — hiện tại** | `web_fetch` như đang có, staff publish trên UI | 0 | Tham khảo ad-hoc ngay, KHÔNG nối được vào luồng ghi (không có `importId`) | keep — giữ nguyên, không cần sửa |
| **L0/P1** | Tool 1 (đọc) + renderer Tầng 1 (`defineToolView`) | 1–2 ngày/game pilot | Số tất định có `importId`; tự đối chiếu `DrawDoc.result` hiện có → phát hiện ca "đã publish nhưng lệch Vietlott" (hiện KHÔNG ai phát hiện được) | keep — làm trước, rủi ro thấp nhất |
| **L1** | Cron worker lấy candidate định kỳ + lưu `drawResultImports` + alert khi lệch | 3–5 ngày | An toàn cao nhất: bắt lỗi nhập tay đã publish sai mà không ai biết | keep — giá trị an toàn lớn nhất trong toàn bộ đề xuất |
| **P2** | Tool 2 (ghi) + custom approval card + `resultSource` + audit → HITL hoàn chỉnh trong chat | 1–2 ngày | Đúng yêu cầu gốc: hỏi Mira → duyệt trong chat → ghi vào DB | keep — sau khi L0/L1 chạy ổn |
| **L2 (auto-publish, không cần HITL)** | Auto-publish khi quorum khớp, không cần staff bấm | 2–3 ngày + soak | Giảm thao tác cho game tần suất cao | demote — chỉ làm sau khi L1 soak vài tuần, và chỉ cho keno/bingo18; NGOÀI scope yêu cầu gốc của user (user chỉ muốn HITL) |

### 4.5. Việc phải làm đầu tiên, bất kể chọn mức nào

## 5. Giới hạn phải nói thẳng — không có cấu hình nào đạt 100%

| Kịch bản | Xử lý |
|---|---|
| 2 nguồn khớp + L2 pass | Confidence cao → card HITL 1 click (P2), hoặc auto-publish (chỉ sau khi soak, L2 §4.4) |
| 2 nguồn lệch | Không ghi gì. Card hiện cả 2 bên cạnh nhau → staff quyết + alert |
| 1 nguồn chết/không phản hồi | Chỉ hiện tham khảo, ghi rõ "chưa đối soát", không cho 1-click |
| L2 (validate) fail | Coi như không có kết quả + alert. Không bao giờ ghi một phần |
| Draw đã `Settled` | Tool 2 từ chối, đẩy về UI (vì mở resettle → hệ quả tiền, không để AI khởi động luồng đó) |

Ca 2 nguồn độc lập cùng sai giống nhau tồn tại về lý thuyết (vd cả 2 mirror cùng copy từ 1 nguồn
gốc bị lỗi). Hệ này không loại trừ hoàn toàn rủi ro — nó **biết khi nào nó không chắc** và
từ chối ghi trong trường hợp đó, khác biệt căn bản so với việc hỏi trực tiếp ChatGPT.

## 6. Câu hỏi mở — cần user quyết trước khi viết plan

1. **Game pilot đầu tiên?** Đề xuất `keno` (20 ô/kỳ, ~120 kỳ/ngày → ROI rõ nhất, đồng thời
   mapping mã kỳ `#0110271` là ca khó nhất — giải xong thì 6 game còn lại chỉ là thêm adapter).
   Phương án ít rủi ro hơn: `mega645` (6 số, 3 kỳ/tuần, dễ verify bằng mắt).
2. **Nguồn dữ liệu ưu tiên?** Cần GATE khả thi (§4.5) trước khi chốt — đặc biệt cần xác nhận
   endpoint `api.vietlott.vn/services/...` có ổn định đủ để dùng hay không, và có cần xin phép/
   hỏi Vietlott kênh dữ liệu chính thức song song không (vấn đề pháp lý/ToS khi scrape).
3. **Có làm L1 (cron đối soát tất cả draw đã publish) hay chỉ P1 (đọc theo yêu cầu qua chat)?**
   L1 mang giá trị an toàn cao nhất (phát hiện lỗi nhập tay đã xảy ra) nhưng cần hạ tầng worker
   cron mới — nằm ngoài yêu cầu gốc "chỉ muốn HITL trong chat" của user, cần xác nhận có muốn mở
   rộng scope hay không.
4. **Model nào cho extractor?** Đề xuất model rẻ qua AI Gateway (không dùng `claude-sonnet-5`
   đang dùng cho Mira) — cần xác nhận model cụ thể có sẵn trong AI Gateway của project.

## 7. Plans phái sinh (chưa tạo — chờ user chốt §6)

Dự kiến khi approved, tách theo feature slug `draw-result-import/` (theo `.cursor/plans/README.md`
vì có nhiều plan phái sinh):

- `p0-gate-source-feasibility.plan.md` — GATE khả thi nguồn dữ liệu (§4.5), làm trước tất cả.
- `p1-tool-read-import.plan.md` — Tool 1 (đọc) + L1 extractor + L2 validate + renderer Tầng 1
  (§4.2, mức L0/P1).
- `p2-tool-write-publish.plan.md` — Tool 2 (ghi) + custom approval card + `resultSource` +
  audit (§4.2, mức P2).
- (Ngoài scope hiện tại, chỉ tạo nếu user mở rộng) `p3-cron-reconcile.plan.md` — worker cron đối
  soát L1, alert khi lệch (§4.4 mức L1).
