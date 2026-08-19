# p1-04 — Lượt trả lời trên Vercel chậm hơn local: đo trước, tối ưu sau

> **Nguồn:** Báo cáo thật của user 18/08/2026 — "cùng 1 câu hỏi hỏi ở local trả lời nhanh hơn trên
> web rất nhiều". Số đo trong plan này lấy từ eval run `2026-08-18T06-53-40` (53 case, sonnet-5,
> `reasoning: low`) và từ đọc source `eve@0.38.3` + docs Vercel (18/08).
> **Phase:** P1 · **Phụ thuộc:** không chặn ai, không bị ai chặn (trục hạ tầng, khác trục p1-01/02/03).

Plan này **KHÔNG** bắt đầu bằng việc sửa gì. Nó bắt đầu bằng ba phép đo, vì hai chẩn đoán đưa ra
trong lúc thảo luận 18/08 đều **chưa được đo** và một trong hai đã **bị dữ liệu phủ định** (§5.1).
Bài học chung của thư mục plan này đã ghi ở `00-overview.md`: *policy/hiệu năng phải được đo, không
chỉ được khai báo*.

---

## §0. Điều ĐÃ đo (không phải giả thuyết)

Rút từ `apps/backoffice/.eve/evals/2026-08-18T06-53-40` bằng script ở `eve-eval-workflow.mdc` §5,
bổ sung thống kê phân bố. Đây là số của **eval chạy local**, không phải của production.

| Đại lượng | Giá trị đo được | Ý nghĩa |
|---|---|---|
| model call / lượt | **trung vị 2** · tb 2,36 · max 8 | Phân bố: `{1: 5, 2: 30, 3: 16, 4: 1, 8: 1}` — 30/53 case (57%) đúng **2** call |
| input / call đầu tiên | **min 32.005 · trung vị 32.024 · max 32.065** | Biến thiên toàn bộ chỉ **60 token** giữa 53 case khác nhau |
| prefix bất biến | **31.912 token** (`cacheReadTokens` giống hệt ở mọi case) | System instructions + tool schema — phần **không** phụ thuộc câu hỏi |
| input / lượt | trung vị 64.770 (≈ 2 × 32k) | Xác nhận: mỗi call đọc lại **toàn bộ** prefix 32k |
| cache | có case `cacheReadTokens: 0` + `cacheWriteTokens: 32.038` | Cache **lạnh** phải ghi lại 32k; cache nóng chỉ đọc |

**Ba kết luận rút ra từ bảng trên — dùng để chọn việc, và để loại việc:**

1. **2 call/lượt là sàn lý thuyết** của một lượt cần dữ liệu (call 1 quyết định gọi tool, call 2 đọc
   kết quả rồi trả lời). 57% case đã ở sàn ⇒ **không còn step nào để cắt** (§5.1).
2. **32k token prefix là chi phí trả MỖI call**, tức ~64k mỗi lượt. Đây là đại lượng lớn nhất, và
   là đại lượng duy nhất trong bảng mà ta **kiểm soát được bằng code**.
3. **Trạng thái cache (nóng/lạnh) làm đổi hẳn khối lượng việc của một call** — 32k `cacheRead`
   (rẻ, nhanh) so với 32k `cacheWrite` (đắt, chậm). Chênh lệch này **không phụ thuộc Vercel**, mà
   phụ thuộc **khoảng cách giữa hai câu hỏi liên tiếp** (§2, nghi phạm A).

---

## §1. GATE — ba phép đo phải xong TRƯỚC khi sửa bất kỳ dòng nào

Mục tiêu GATE: biết thời gian một lượt **nằm ở đâu**, trước khi bỏ công tối ưu. Chưa có phép đo nào
trong ba phép dưới đây ⇒ mọi tối ưu đều là đoán.

### G1 — Region thật của service eve (bác bỏ hoặc xác nhận việc pin `sin1` có tác dụng)

`apps/backoffice/vercel.ts` đã pin `regions: ["sin1"]`. **Nhưng agent không chạy trong service
Next.js** — `withEve()` sinh một **service riêng** với build root `.eve/vercel-services/eve`
(đọc trong `eve/dist/src/shared/vercel-services.d.ts`). Hai điều đã kiểm được từ source/docs:

- Service config của Vercel **không có** field `regions` (`/docs/services/config-reference`) ⇒
  `regions` vẫn là field top-level, áp cho cả deployment ⇒ **về lý thuyết** service eve thừa hưởng.
- eve **không** ghi `regions` vào build output (grep `regions` trong `eve/dist` → 0 match) ⇒ nó
  không override.

Suy luận trên **hợp lý nhưng vẫn là suy luận**. Đo bằng máy:

```ts
// agent/channels/eve.ts — trong auth handler (chạy server-side TRONG service eve)
console.log("[eve-region]", process.env.VERCEL_REGION, process.env.VERCEL_ENV);
```

Deploy → mở panel hỏi 1 câu → đọc Runtime Logs, lọc `[eve-region]`.

| Thấy gì | Kết luận |
|---|---|
| `sin1` | Region đã đúng. Loại region khỏi danh sách nghi phạm. Xoá dòng log. |
| `iad1` (hoặc khác) | `regions` top-level **không** áp cho service eve → đây là nguyên nhân lớn, đi §3.1 |

> Giữ dòng log này **tạm thời**, xoá sau khi kết luận. Không để log rác trong đường đi của mọi request.

### G2 — Cache nóng vs lạnh (nghi phạm mạnh nhất, xem §2.A)

Trên **cùng** một deployment production, cùng một thread:

1. Hỏi câu X. Ghi số giây (đồng hồ có sẵn ở `assistant-header.tsx` hiển thị "N giây").
2. **Ngay lập tức** (< 60 giây) hỏi câu X' tương tự. Ghi số giây.
3. Chờ **> 10 phút** không hỏi gì. Hỏi lại câu X''. Ghi số giây.

| Kết quả | Kết luận |
|---|---|
| (1) và (3) chậm, (2) nhanh rõ rệt | Nguyên nhân là **cache lạnh + cold start**, KHÔNG phải Vercel chậm. Đi §3.2 |
| Cả ba xấp xỉ nhau | Cache/cold start không phải nguyên nhân. Đi §3.3 |

### G3 — So local vs Vercel **đúng cách**

So sánh ở lượt thảo luận trước là so **local đang test liên tục** với **Vercel hỏi lẻ** — hai điều
kiện cache khác nhau, nên phép so đó không kết luận được gì. Làm lại cho công bằng: cùng câu hỏi,
cùng thread mới, **cùng trạng thái cache** (đều là lần hỏi đầu sau > 10 phút im), ghi cả hai số.

### G4 — Tách "thời gian model" khỏi "thời gian hạ tầng" (AI Gateway Observability)

Phép đo **rẻ nhất và phân giải cao nhất**, không cần sửa một dòng code: AI Gateway có trang
Observability ghi **latency từng request** tới provider (`/docs/ai-gateway/observability-and-spend/observability`).

Cách đọc: hỏi 1 câu trên production, ghi tổng thời gian lượt từ đồng hồ panel (`T_lượt`), rồi mở
Gateway Observability lấy latency của 2 request tương ứng (`T_model1 + T_model2`).

| Kết quả | Kết luận |
|---|---|
| `T_model` ≈ `T_lượt` (chênh < ~1s) | Thời gian là **của model**. Hạ tầng Vercel vô can ⇒ mọi nút ở §3.2 đều vô ích, đi §3.3 |
| `T_model` ≪ `T_lượt` (chênh nhiều giây) | Phần chênh là **hạ tầng**: cold start / workflow I/O / DB ⇒ đi §3.2 |

Làm G4 **cùng lúc** với G2 (cùng một lượt hỏi cho ra cả hai số) — không tốn thêm gì.

Ghi kết quả G1–G4 vào §7 của chính file này trước khi sửa code.

---

## §2. Nghi phạm, xếp theo sức mạnh bằng chứng

| # | Nghi phạm | Bằng chứng hiện có | Đo bằng |
|---|---|---|---|
| **A** | **Prompt cache lạnh** — 32k prefix phải `cacheWrite` lại thay vì `cacheRead` | Đã thấy trong dữ liệu: case `cacheWriteTokens: 32.038, cacheReadTokens: 0`. Local test liên tục ⇒ cache luôn nóng; staff hỏi thưa ⇒ luôn lạnh. **Giải thích trực tiếp** hiện tượng "local nhanh hơn rất nhiều" | G2 |
| **B** | **Cold start service eve** — service riêng, traffic thưa; bytecode caching chỉ có ở production, và lần đầu chưa có cache | `/docs/fluid-compute`; service eve là function độc lập với Next.js nên có cold start **riêng** | G2 |
| **C** | **Fluid compute chưa bật** cho project | Default chỉ áp cho project tạo **sau 23/04/2025** (`/docs/fluid-compute`). Nếu tắt: mỗi request một microVM ⇒ cache Mongo client ở module scope (`packages/data/src/mongo/client.ts`) **mất tác dụng** ⇒ TLS handshake lại mỗi lượt | Dashboard → Settings → Functions |
| **D** | **Region service eve** | Suy luận từ docs là "đã đúng", chưa đo | G1 |
| **E** | **Vercel Workflow state I/O** — mỗi step checkpoint qua network, `WORKFLOW_PRECONDITION_GUARD: 1` bắt reload snapshot trước khi commit | eve set guard này trong `vercel-build-output-config.js`. Nhưng chỉ **2 step**/lượt ⇒ tối đa vài roundtrip, khó là nguyên nhân "chậm rất nhiều" | Agent Runs tab / OTel |
| **F** | **32k prefix** làm mỗi model call nặng | Đo chắc: 31.912 token bất biến | §3.3 |
| **G** | **Đường auth tới AI Gateway khác nhau** — trên Vercel model string ID authenticate bằng **OIDC** (token phải có/refresh), local dùng `AI_GATEWAY_API_KEY` sẵn trong env | `agent/agent.ts` JSDoc + `eve/docs/guides/deployment/vercel.mdx`. Đây là chặng **thật sự khác** giữa hai môi trường, và nó nằm ở cold start ⇒ cùng nhóm với B/C | G2 + G4 |

### §2.1 Đã LOẠI bằng bằng chứng — không cần đo lại

| Giả thuyết | Vì sao loại |
|---|---|
| **"Local dùng model khác/nhanh hơn"** | Loại bằng máy: report eval (chạy local, đọc cùng `.env.local`) ghi `modelId: "anthropic/claude-sonnet-5"` ở **126/126** model call — trùng default trong `agent/agent.ts`. Hai môi trường **cùng model**, cùng `reasoning: low`. |
| **"AI Gateway gọi tới server model ở xa nên chậm"** | Không đứng vững ở dạng *khoảng cách địa lý*, vì **local cũng đi qua chính AI Gateway đó** (model string `anthropic/...` ⇒ routing qua Gateway ở **cả hai** môi trường — xem JSDoc `agent/agent.ts`). Chặng Gateway → provider là **chặng CHUNG**, nên nó **triệt tiêu** khi so local với Vercel, **bất kể** Gateway đặt ở đâu. Chặng duy nhất khác là client → Gateway, và ở đó `sin1` **gần hơn** máy ở VN ⇒ nếu Gateway có ảnh hưởng thì nó dự đoán **Vercel nhanh hơn**, tức ngược hiện tượng user báo. Thêm nữa về bậc độ lớn: kể cả Gateway ở US, thêm ~200–300ms mỗi call × 2 call ≈ 0,5s, không giải thích được chênh lệch "rất nhiều" của một lượt tính bằng chục giây. **Phần còn sống của giả thuyết này** là nghi phạm **G** ở trên (khác biệt *auth path*, không phải khác biệt *khoảng cách*) — và G4 đo được trực tiếp. |

Thứ tự này **có chủ đích**: A/B/C là chênh lệch giữa hai môi trường (giải thích được hiện tượng user
báo), D/E/F là chi phí **có ở cả hai** môi trường (nên tự chúng không giải thích được chênh lệch,
dù vẫn đáng tối ưu về mặt tuyệt đối).

---

## §3. Hành động — phân nhánh theo kết quả GATE

### §3.1 Nếu G1 ra region sai

Escape hatch duy nhất để cấu hình riêng service eve: **tự khai `services` trong `vercel.json`**.
Đọc trong `vercel-services.d.ts`: *"When `vercel.json` already declares stable `services`, it must
include an eve service and the module generates nothing"*.

⚠️ **Rủi ro cao, làm sau cùng:** khai `services` thì **ta** sở hữu routing (eve không sinh gì nữa),
và top-level mất quyền dùng `functions`/`buildCommand`/`framework` (`/docs/services`). Khai thiếu
service eve ⇒ build fail. Ngoài ra eve tra **`vercel.json`**, còn repo đang dùng **`vercel.ts`** —
chưa biết eve có đọc được `vercel.ts` hay không, **phải verify trên preview deployment trước**,
không thử trực tiếp trên `main`.

### §3.2 Nếu G2 xác nhận cache lạnh / cold start (nhánh có xác suất cao nhất)

Đây là nhánh **không sửa được bằng cách "tối ưu code"** — nó là bản chất của workload hỏi thưa.
Ba việc theo thứ tự rẻ → đắt:

1. **Bật fluid compute** (nghi phạm C) — dashboard, 1 toggle, cần deploy lại. Giữ được instance ⇒
   cold start và Mongo connection đỡ hẳn. Kiểm trước khi làm gì khác.
2. **Performance CPU (4 GB / 2 vCPU)** — dashboard → Functions → Advanced Settings. **Không set
   được qua `vercel.json`/`vercel.ts`** (docs ghi rõ sẽ có warning lúc build). Giúp phần CPU-bound:
   khởi động runtime, serialize/deserialize event log. Đánh đổi: Provisioned Memory tính tiền gấp
   đôi. **Chỉ bật nếu G2 cho thấy cold start là phần lớn thời gian** — đừng bật theo cảm giác.
3. **Chấp nhận và làm UX cho nó**: nếu thời gian nằm ở model + cache write, cách cải thiện *cảm
   nhận* là hiển thị tiến độ sớm (đã có đồng hồ + reasoning stream), không phải cắt latency.

### §3.3 Nếu G2/G3 cho thấy chênh lệch nhỏ hoặc không có

Nghĩa là "Vercel chậm hơn" phần lớn là **chi phí model**, có ở cả hai môi trường. Khi đó đòn bẩy duy
nhất đáng kể là **giảm 32k prefix** (nghi phạm F) — và nó **bắt buộc đi kèm eval** (§6):

1. **Đo phân rã 32k trước khi cắt** — bao nhiêu token là instructions, bao nhiêu là tool schema.
   Không cắt mù. (Gợi ý: đếm ký tự các file `agent/instructions/*.md`, và độ dài JSON schema của
   từng tool; ~4 ký tự ≈ 1 token là ước lượng đủ dùng để **xếp hạng**, không phải để báo cáo.)
2. **Cắt phần đắt nhất trước** — thường là mô tả tool dài dòng và ví dụ trong description.
3. **Cẩn thận đánh đổi:** `40-tool-policy.md` và mô tả tool là thứ **giữ cho tool-choice đúng**.
   Bảng ở `eve-eval-workflow.mdc` §4 nói rõ: sai tool thì sửa **`description`** — tức chính phần
   đang muốn cắt. Cắt token mà làm sai tool-choice là **lỗ**: sai tool ⇒ thêm call ⇒ chậm hơn *và*
   sai số liệu.
4. Mỗi lần cắt: chạy `npx eve eval` trước/sau, so tool-choice accuracy **và** token, ghi vào bảng
   ngân sách token ở `p1-03-ops-data-visibility.plan.md` §3.

---

## §4. Config Vercel — cái nào có thật, cái nào không

Tra docs 18/08. **Điều quan trọng nhất phải nói thẳng: Vercel KHÔNG có nút nào làm bản thân model
suy luận nhanh hơn.** Model chạy ở phía provider qua AI Gateway; mọi nút của Vercel chỉ ảnh hưởng
phần *app-side* (cold start, DB, state I/O). Muốn giảm thời gian **suy luận** thì nút nằm ở
`agent/agent.ts` (model, `reasoning`) và ở kích thước prompt — không nằm ở Vercel.

| Nút | Đặt ở đâu | Tác dụng thật | Nên làm? |
|---|---|---|---|
| `regions` | `vercel.ts` (top-level) | RTT tới Atlas/Redis Singapore | ✅ đã làm, **chờ G1 xác nhận có ăn cho service eve** |
| Fluid compute | **Dashboard** (không có field trong `@vercel/config@0.5.6`) | Reuse instance ⇒ cold start ↓, Mongo connection nóng | ✅ kiểm ngay (§3.2.1) |
| CPU Standard→Performance | **Dashboard only** | 2 vCPU cho phần CPU-bound | ⚠️ chỉ khi G2 chỉ đúng chỗ này (tốn tiền) |
| `maxDuration` service eve | eve **đã** set `"max"` cho workflow route | Chống timeout, **không** tăng tốc | ✅ không cần làm gì |
| `functions` per-service | chỉ khi tự khai `services` | Cấu hình riêng service eve | ❌ rủi ro cao (§3.1) |
| Multi-region | `regions` nhiều phần tử | **Không** giúp: state chỉ có một bản ở Singapore | ❌ tăng tiền, chậm hơn |
| Agent Runs tab | Observability (gated per team) | Xem trace từng session | ✅ xin bật — đo rẻ nhất về sau |
| **AI Gateway Observability** | Dashboard AI Gateway | **Latency từng request tới provider** — tách bạch "thời gian model" vs "thời gian hạ tầng" | ✅ **dùng ngay ở G4**, không cần bật gì, không sửa code |

---

## §5. Việc KHÔNG làm — và lý do bằng số

### §5.1 KHÔNG tối ưu "gộp tool call để giảm số step"

Hướng này đã được nêu trong thảo luận 18/08 (khuyến khích model phát nhiều tool call song song
trong một response để giảm số step). **Dữ liệu phủ định nó:** trung vị **2** model call/lượt, 57%
case đúng 2 — mà 2 là **sàn lý thuyết**. Sửa `40-tool-policy.md` cho mục tiêu này sẽ:

- không giảm được gì ở 35/53 case (5 case 1 call + 30 case 2 call),
- đổi lấy rủi ro làm lệch tool-choice trên toàn bộ 53 case,
- tốn một vòng eval (~1,5–2 phút + tiền API) để chứng minh mình không làm hỏng gì.

Chỉ mở lại hướng này nếu phân bố đổi thật — cụ thể: **trung vị ≥ 4 call/lượt**. Cơ chế thì eve có
sẵn (*"parallel tool calls dispatch concurrently"*, `docs/subagents/index.mdx`), nên khi có trigger
thật thì làm được ngay, không cần chuẩn bị trước.

### §5.2 KHÔNG hạ `limits` hay đổi `compaction` để "cho nhanh"

Hai số đó là guardrail bắt loop, không phải nút hiệu năng (`agent/agent.ts` §limits đã giải trình).
Hạ xuống chỉ làm staff gặp continuation prompt giữa lúc làm việc.

### §5.3 KHÔNG tắt Vercel Workflow

Không có nút tắt: durable session là kiến trúc nền của eve (thread resume sau reload/redeploy, HITL
park chờ duyệt — chính các lý do chọn eve ở `00-overview.md`). Và với 2 step/lượt, đây khó là nguyên
nhân chính (§2.E).

---

## §6. Quy trình eval bắt buộc (nếu chạm `agent/`)

Chỉ áp khi làm §3.3. Theo `eve-eval-workflow.mdc`, không rút gọn:

- [ ] Bật `evalBypass()` trong `channels/eve.ts` → chạy `npx eve eval` **trước** khi sửa (baseline).
- [ ] Sửa. Chạy lại. So **tool-choice accuracy** trước/sau, không chỉ so token.
- [ ] Đọc report ở `.eve/evals/<timestamp>/` (đừng `tail` stdout — đã mất case fail vì việc này).
- [ ] Phân loại mọi case đỏ theo bảng §4 của rule **trước khi** sửa file nào.
- [ ] **TẮT `evalBypass()`**, verify bằng `rg`. Không commit dòng đang bật.
- [ ] Ghi số vào bảng ngân sách token `p1-03` §3.

---

## §7. Định nghĩa Done + chỗ ghi kết quả

Plan này **done khi trả lời được bằng số**, không phải khi "đã tối ưu":

- [ ] G1: region thật của service eve = `________` (điền sau khi đọc log)
- [ ] G2: lượt lạnh `____`s · lượt nóng (<60s sau) `____`s · lượt sau 10 phút im `____`s
- [ ] G3: local `____`s vs Vercel `____`s (cùng câu, cùng trạng thái cache)
- [ ] G4: `T_lượt` = `____`s · `T_model` (tổng latency Gateway) = `____`s · chênh = `____`s
- [ ] Fluid compute: bật/tắt = `________`
- [ ] Kết luận nguyên nhân chính: `________________`
- [ ] Việc đã làm theo nhánh §3: `________________`
- [ ] Nếu chạm `agent/`: tool-choice accuracy trước `___` / sau `___`; token trước `___` / sau `___`

**Rollback:** mọi thay đổi trong plan này đều độc lập và đảo được — dòng log G1 (xoá), toggle
dashboard (bật lại), cắt prompt (git revert). Không có bước nào đổi schema hay dữ liệu.

---

## §8. Ghi nhận ngoài scope

- **Tối ưu Mongo client options** (`maxPoolSize`, `serverSelectionTimeoutMS`) cho môi trường
  serverless: `packages/data/src/mongo/client.ts` hiện không set gì. Đáng làm, nhưng ảnh hưởng
  **toàn bộ** app (7 worker + 2 API), không riêng AI panel ⇒ plan riêng, không nhét vào đây.
- **OTel exporter** (Braintrust/Datadog) để phân rã latency chi tiết theo span: chỉ làm nếu G1–G3
  không kết luận được. Agent Runs tab rẻ hơn, thử trước.
