# p2-01 — Observability cho Guard

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §3.4, §5.1
> Overview: `./00-overview.md` · Phase P2 · Chặn bởi: `p1-02`

> **Bối cảnh đã chốt (2026-09-22): chưa deploy production.** Plan này **không còn** là điều kiện để
> bật `enforce` — `enforce` đã là mặc định từ `p1-01`. Giá trị còn lại, và nó là giá trị **lớn nhất**
> của cả plan: **alert khi fail-open kéo dài**. Bỏ: shadow-mode report, thu 7 ngày production,
> tiêu chí bật enforce, số liệu fingerprint guard (nhánh đã xoá ở `p0-02`).

---

# PHẦN A — CODE LOG/ALERT (AI agent implement)

> Chỉ code sinh log + cấu hình alert. **Không** viết test ở Phần A. Kết thúc Phần A: `check-types` +
> `oxlint` xanh. Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.
>
> ⚠️ Phần lớn giá trị của plan này nằm ở **Phần B mục B3 (xác nhận thủ công)** — alert chưa từng bắn
> thì plan **chưa** xong, dù code log đã viết.

## Hai câu hỏi plan này phải trả lời được

1. **"Redis có đang chết âm thầm không?"** → đây là rủi ro lớn nhất của thiết kế fail-open, và là mục
   tiêu số 1 của plan.
2. **"Ngưỡng hiện tại có chặn oan không?"** → `enforce` đã bật, nên câu này giờ là **phát hiện sự cố
   đang diễn ra**, không phải "chuẩn bị trước khi bật".

Câu 1 quan trọng hơn: fail-open nghĩa là **Redis chết thì hệ thống vẫn 200 OK**. Không có metric thì
lớp phòng thủ có thể đã tắt hoàn toàn nhiều tuần mà không ai biết — tệ hơn là không có nó, vì ta *tin*
rằng đang được bảo vệ.

## Bước 1 — Structured log từ guard

Hạ tầng đã có: `logError`/`logWarn`/`logInfo` với `LogContext = Record<string, unknown>`
(`packages/shared/src/utils/log.ts:127,142,160`). **Không** tạo logger mới.

Ba loại event, mỗi loại 1 label cố định để query được:

| Event | Log level | Khi nào | Context bắt buộc |
|---|---|---|---|
| `guard.ratelimit.denied` | `logWarn` | Decision = denied (bị chặn thật) | `route`, `subjectType`, `limit`, `windowSec`, `retryAfterMs` |
| `guard.ratelimit.fail_open` | `logError` | Redis lỗi/timeout → cho qua | `route`, `reason`, `elapsedMs` |
| `guard.idempotency.replay` | `logInfo` | Phát hiện duplicate `Idempotency-Key` (từ `p0-02`) | `route`, `phase` |

Ràng buộc bắt buộc:

- **KHÔNG log `accountId`/`tenantId`/IP thô** vào context. Đây là PII. Log **hash đã cắt ngắn** (vd 8
  ký tự đầu của `hashKeyPart`) — đủ để đếm distinct subject và phát hiện 1 subject spam, không đủ để
  truy ra người. Cần điều tra cụ thể thì dùng đường audit riêng, không phải log phòng thủ.
- Label đặt **hằng số**, khai 1 chỗ trong `@megawin/guard`, không rải chuỗi (`code-quality-standards.mdc` §5.3).
- `logWarn` cho denied, **không** `logError` — denied là hành vi bình thường của hệ thống đang hoạt
  động đúng. Dùng `logError` sẽ làm nhiễu alert thật.
- **Không** có field `mode` trong log (chỉ còn `enforce`/`off`; `off` thì không log gì vì không gọi
  rate limiter). Thêm field luôn bằng 1 giá trị là noise.
- `guard.idempotency.replay` **không** có field `hadKey` — header giờ bắt buộc, luôn có key.

## Bước 2 — Alert: fail-open kéo dài

Đây là **deliverable quan trọng nhất** của plan.

- Điều kiện: `guard.ratelimit.fail_open` xuất hiện liên tục trong **≥5 phút** → alert.
- Vì sao theo **thời lượng** chứ không theo số lần: 1–2 lần fail-open là bình thường (network jitter,
  Redis restart). Fail-open **liên tục** nghĩa là Redis đã chết → lớp phòng thủ đã tắt.
- Alert phải nói rõ hệ quả để người nhận hiểu ngay: *"rate limit đang KHÔNG hoạt động"* — không phải
  chỉ *"Redis error"*.

⚠️ **Cần xác nhận trước khi làm**: hạ tầng alert hiện tại là gì? Grep `serverless.yml` không thấy cấu
hình Axiom trực tiếp (chỉ khớp `provider: n` — không liên quan). Phải xác định CloudWatch Logs +
Metric Filter + Alarm, hay Axiom monitor, hay cách khác — **đọc hạ tầng thật, không giả định**. Nếu
chưa có đường alert nào, việc dựng nó là phần chính của plan này, không phải phần phụ.

## Bước 3 — Báo cáo phát hiện chặn oan

Deliverable là một bảng để **phát hiện sự cố**, không phải dashboard cho đẹp. `enforce` đã bật nên mỗi
`denied` là một request thật bị từ chối — cần biết ngay đó là abuse hay ngưỡng sai.

| Cột | Ý nghĩa | Dùng để |
|---|---|---|
| `route` | — | — |
| `denied_count` | Số request bị chặn thật | Tăng bất thường → điều tra ngay |
| `distinct_subjects_denied` | Bao nhiêu subject khác nhau bị chặn | 1–2 subject = abuse thật (ngưỡng đúng). **Nhiều** subject = **ngưỡng sai**, nâng ngay |
| `fail_open_count` | Redis lỗi bao nhiêu lần | > 0 đáng kể → sửa Redis; phòng thủ đang tắt |

**Tiêu chí nâng ngưỡng** (ghi thẳng vào plan để không ai xử lý theo cảm tính):

- `distinct_subjects_denied` nhiều và phân bố đều → ngưỡng quá chặt, **nâng ngưỡng** ở `p1-02`/`p1-03`.
  **Không** kết luận "người dùng lạm dụng" trước khi loại trừ khả năng này.
- `denied_count` tăng vọt tập trung ở 1–2 subject → abuse thật, ngưỡng đang làm đúng việc.
- `fail_open_count` > 0 liên tục → **ưu tiên cao nhất**, sửa Redis trước mọi việc khác.

## Bước 4 — ~~Số liệu cho fingerprint guard~~ **ĐÃ BỎ**

Nhánh fingerprint guard đã bị loại khỏi `p0-02` (header `Idempotency-Key` bắt buộc) → không còn câu
hỏi "player có đặt 2 vé giống hệt trong 5s không" để trả lời. **Không** dựng metric cho nhánh không
tồn tại.

`guard.idempotency.replay` vẫn được log — nhưng mục đích khác: đếm số lần client **retry đúng cách**
(cùng key). Con số này cho biết chất lượng mạng/client, không dùng để quyết định gì về ngưỡng.

---

# PHẦN B — TEST

> Plan này sinh ra **log + alert + báo cáo**, không sinh logic nghiệp vụ. Nên test chia 2 loại rất
> khác nhau: phần **shape của log** test tự động được; phần **alert + số liệu thật** chỉ xác nhận
> bằng tay. Không được lấy "log shape test xanh" làm bằng chứng cho "observability đã dùng được".

## B1 — Unit test: shape của log (tự động)

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | 3 loại event có **label cố định** (hằng, không literal rải rác) | Đối chiếu với `const object as const` | Label lệch chính tả → query Axiom rỗng mà không ai biết |
| 2 | Mỗi event có **đủ** field cần cho báo cáo 4 cột | Assert từng key có mặt | Thiếu 1 field = không điều tra được khi sự cố đang diễn ra |
| 3 | Log **không** chứa PII thô: IP/accountId/tenantId nguyên bản | `not.toContain(rawValue)` | Log đi vào Axiom — nơi lưu ngoài tầm kiểm soát trực tiếp |
| 4 | Phân biệt rõ `denied` (chặn thật) vs `failedOpen` (Redis chết) | 2 field/2 event khác nhau | Trộn 2 khái niệm làm báo cáo vô nghĩa: không biết "vượt ngưỡng" hay "hạ tầng lỗi" |
| 5 | Log **không** có field `mode` (chỉ 1 giá trị khả dụng) | `not.toHaveProperty("mode")` | Field luôn bằng 1 giá trị là noise; cũng khoá việc shadow bị thêm lại |
| 6 | `guard.idempotency.replay` **không** có `hadKey` | `not.toHaveProperty("hadKey")` | Header bắt buộc → luôn có key, field vô nghĩa |
| 7 | Log không throw khi field optional thiếu | Gọi với event tối giản | Log lỗi làm chết request là nghịch lý |

## B2 — Integration test: log ra thật qua đường end-to-end

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 8 | Vượt ngưỡng → **đúng 1** log event `denied` **và** request nhận 429 | Spy/capture logger |
| 9 | Redis chết → log event `failedOpen`, **không** log `denied`, request vẫn 200 | Phân biệt được 2 ca |
| 10 | Request bình thường (không vượt) → **không** log spam | `toHaveBeenCalledTimes(0)` — log mỗi request sẽ làm nổ chi phí Axiom |

## B3 — Xác nhận thủ công (phần chính của plan này)

Không có test tự động nào thay được các mục dưới đây. **Phải ghi số liệu cụ thể**, không ghi "đã làm".

| # | Việc | Bằng chứng phải ghi lại |
|---|---|---|
| 11 | **Alert fail-open bắn thật**: chủ động làm Redis lỗi trên staging ≥5 phút | Thời điểm gây lỗi, thời điểm alert đến, kênh nhận. Alert cấu hình mà chưa từng bắn = **chưa có alert** |
| 12 | Alert **tự tắt** khi Redis hồi phục | Thời điểm hồi phục, thời điểm alert clear |
| 13 | Xác định hạ tầng alert **thật** đang dùng (không giả định) | Tên dịch vụ + nơi cấu hình, ghi vào plan |
| 14 | Query Axiom lấy được **cả 3** loại event | Câu query cụ thể + số bản ghi trả về |
| 15 | Báo cáo 4 cột cho **từng** route đã bật rate limit | Bảng đầy đủ, không bỏ route nào. Dữ liệu từ load test staging (`p1-02` B4) là đủ để dựng bảng — không chờ production |
| 16 | Kịch bản chặn oan: chủ động vượt ngưỡng từ **nhiều subject** → xác nhận bảng cho thấy `distinct_subjects_denied` cao → tức cảnh báo "ngưỡng sai" hoạt động | Số subject dùng + giá trị cột quan sát |

## Definition of done

**Phần A (code log/alert):**

- [ ] 3 loại log event có label cố định (hằng), context đủ field, **không PII thô**.
- [ ] **Không** có field `mode`/`hadKey` (dấu vết shadow + fingerprint đã xoá).
- [ ] Không log mỗi request — chỉ log event đáng quan tâm.
- [ ] Alert fail-open đã cấu hình trên hạ tầng thật.
- [ ] `oxlint` + `prettier` xanh.

**Phần B (test):**

- [ ] 7 unit test (B1) xanh — đặc biệt #3 (không PII), #4 (phân biệt `denied` vs `failedOpen`),
      #5–6 (không còn field của shadow/fingerprint).
- [ ] 3 integration test (B2) xanh, gồm #10 (không log spam).
- [ ] B3 #11–12: alert đã **bắn thật và tự tắt**, có ghi thời điểm. Không có bằng chứng này thì alert
      coi như chưa tồn tại.
- [ ] B3 #13: hạ tầng alert thật đã xác định và ghi vào plan (không giả định).
- [ ] B3 #14: query Axiom lấy được cả 3 loại event, có câu query ghi lại.
- [ ] B3 #15: báo cáo 4 cột đầy đủ cho mọi route.
- [ ] B3 #16: đã chứng minh bảng phát hiện được ca "ngưỡng sai" (nhiều subject bị chặn).

## Không làm trong plan này

- ❌ **Shadow-mode report / thu 7 ngày production / tiêu chí bật enforce** — `enforce` đã bật từ
  `p1-01`, shadow không tồn tại.
- ❌ **Metric cho fingerprint guard** — nhánh đã bị xoá ở `p0-02`.
- ❌ Dashboard đẹp/tổng quát cho toàn hệ thống — chỉ làm đúng metric phục vụ 2 câu hỏi ở đầu plan.
- ❌ Đổi ngưỡng — thuộc `p1-02`/`p1-03`.
