# p2-01 — Observability cho Guard

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §3.4, §5.1
> Overview: `./00-overview.md` · Phase P2 · Chặn bởi: `p1-02` · **Chặn việc bật `enforce`**

Plan này là **điều kiện tiên quyết để tắt shadow mode**. Không có số liệu thì bật `enforce` là canh bạc.

---

# PHẦN A — CODE LOG/ALERT (AI agent implement)

> Chỉ code sinh log + cấu hình alert. **Không** viết test ở Phần A. Kết thúc Phần A: `check-types` +
> `oxlint` xanh. Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.
>
> ⚠️ Phần lớn giá trị của plan này nằm ở **Phần B mục B3 (xác nhận thủ công)** — alert chưa từng bắn
> và số liệu chưa đủ 7 ngày thì plan **chưa** xong, dù code log đã viết.

## Hai câu hỏi plan này phải trả lời được

1. **"Ngưỡng hiện tại có chặn oan traffic thật không?"** → không trả lời được thì không được bật `enforce`.
2. **"Redis có đang chết âm thầm không?"** → đây là rủi ro lớn nhất của thiết kế fail-open.

Câu 2 quan trọng hơn câu 1 và dễ bị bỏ qua: fail-open nghĩa là **Redis chết thì hệ thống vẫn 200 OK**.
Không có metric thì lớp phòng thủ có thể đã tắt hoàn toàn nhiều tuần mà không ai biết — tệ hơn là
không có nó, vì ta *tin* rằng đang được bảo vệ.

## Bước 1 — Structured log từ guard

Hạ tầng đã có: `logError`/`logWarn`/`logInfo` với `LogContext = Record<string, unknown>`
(`packages/shared/src/utils/log.ts:127,142,160`). **Không** tạo logger mới.

Ba loại event, mỗi loại 1 label cố định để query được:

| Event | Log level | Khi nào | Context bắt buộc |
|---|---|---|---|
| `guard.ratelimit.denied` | `logWarn` | Decision = denied (**cả shadow và enforce**) | `route`, `mode`, `subjectType`, `limit`, `windowSec`, `retryAfterMs` |
| `guard.ratelimit.fail_open` | `logError` | Redis lỗi/timeout → cho qua | `route`, `reason`, `elapsedMs` |
| `guard.idempotency.replay` | `logInfo` | Phát hiện duplicate (từ `p0-02`) | `route`, `phase`, `hadKey` (boolean) |

Ràng buộc bắt buộc:

- **Log ở shadow mode cũng phải đầy đủ** — đó là toàn bộ mục đích của shadow mode.
- **KHÔNG log `accountId`/`tenantId`/IP thô** vào context. Đây là PII. Log **hash đã cắt ngắn** (vd 8
  ký tự đầu của `hashKeyPart`) — đủ để đếm distinct subject và phát hiện 1 subject spam, không đủ để
  truy ra người. Nếu cần điều tra cụ thể thì dùng đường audit riêng, không phải log phòng thủ.
- Label đặt **hằng số**, khai 1 chỗ trong `@megawin/guard`, không rải chuỗi (`code-quality-standards.mdc` §5.3).
- `logWarn` cho denied, **không** `logError` — denied là hành vi bình thường của hệ thống đang hoạt
  động đúng. Dùng `logError` sẽ làm nhiễu alert thật.

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

## Bước 3 — Báo cáo quyết định ngưỡng

Deliverable là một bảng để **quyết định**, không phải dashboard cho đẹp. Mỗi route cần:

| Cột | Ý nghĩa | Dùng để |
|---|---|---|
| `route` | — | — |
| `denied_count` (7 ngày) | Số request sẽ bị chặn nếu `enforce` | Nếu > 0 đáng kể → **ngưỡng quá chặt**, nâng lên trước khi bật |
| `distinct_subjects_denied` | Bao nhiêu subject khác nhau bị chặn | 1–2 subject = abuse thật (bật được). Nhiều subject = ngưỡng sai (**không** bật) |
| `p99_req_per_window` | p99 thật của traffic | Ngưỡng nên **≥ 2×** giá trị này |
| `fail_open_count` | Redis lỗi bao nhiêu lần | > 0 đáng kể → sửa Redis **trước**, không bật enforce |

**Tiêu chí bật `enforce`** (ghi thẳng vào plan để không ai bật theo cảm tính):

1. `distinct_subjects_denied` nhỏ và nhận diện được là abuse, **hoặc** `denied_count` ≈ 0.
2. `limit` ≥ 2 × `p99_req_per_window`.
3. `fail_open_count` ≈ 0 trong 7 ngày liên tục.
4. Với `api-tenant`: đã thông báo tenant (`p1-03`).

Thiếu bất kỳ điều kiện nào → **không bật**, ghi lý do.

## Bước 4 — Số liệu cho fingerprint guard (`p0-02` Bước 7)

Câu hỏi nghiệp vụ chưa có câu trả lời (analysis §5.2): **player có thực sự đặt 2 vé giống hệt trong 5
giây không?**

- Đếm `guard.idempotency.replay` với `hadKey: false` (nhánh fingerprint) theo route.
- Kèm phân bố khoảng cách thời gian giữa 2 request trùng → nếu phần lớn < 1s thì gần như chắc chắn là
  double-tap; nếu rải đều tới 5s thì có thể là ý định thật.
- Kết quả quyết định: cửa sổ 5s giữ, giảm, hay bỏ hẳn nhánh fingerprint.

## Định nghĩa "đủ số liệu"

**7 ngày liên tục** ở shadow mode trên production, bao gồm **ít nhất 1 ngày cuối tuần** (traffic xổ số
có chu kỳ theo lịch quay — mẫu ngày thường không đại diện).

---

# PHẦN B — TEST

> Plan này sinh ra **log + alert + báo cáo**, không sinh logic nghiệp vụ. Nên test chia 2 loại rất
> khác nhau: phần **shape của log** test tự động được; phần **alert + số liệu thật** chỉ xác nhận
> bằng tay. Không được lấy "log shape test xanh" làm bằng chứng cho "observability đã dùng được".

## B1 — Unit test: shape của log (tự động)

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | 3 loại event có **label cố định** (hằng, không literal rải rác) | Đối chiếu với `const object as const` | Label lệch chính tả → query Axiom rỗng mà không ai biết |
| 2 | Mỗi event có **đủ** field cần cho báo cáo 5 cột | Assert từng key có mặt | Thiếu 1 field = phải chờ thêm 7 ngày nữa để thu lại |
| 3 | Log **không** chứa PII thô: IP/accountId/tenantId nguyên bản | `not.toContain(rawValue)` | Log đi vào Axiom — nơi lưu ngoài tầm kiểm soát trực tiếp |
| 4 | Phân biệt rõ `denied` (chặn thật) vs `failedOpen` (Redis chết) | 2 field/2 event khác nhau | Trộn 2 khái niệm làm báo cáo vô nghĩa: không biết "vượt ngưỡng" hay "hạ tầng lỗi" |
| 5 | Log có ở **cả** `shadow` và `enforce` | Gọi 2 mode, assert đều có | Chỉ log ở shadow → tắt shadow là mất quan sát |
| 6 | `mode` là field trong log | — | Đọc log phải biết request đó có bị chặn thật hay không |
| 7 | Log không throw khi field optional thiếu | Gọi với event tối giản | Log lỗi làm chết request là nghịch lý |

## B2 — Integration test: log ra thật qua đường end-to-end

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 8 | Vượt ngưỡng ở `shadow` → **đúng 1** log event `denied`, request vẫn 200 | Spy/capture logger |
| 9 | Redis chết → log event `failedOpen`, **không** log `denied` | Phân biệt được 2 ca |
| 10 | Request bình thường (không vượt) → **không** log spam | `toHaveBeenCalledTimes(0)` — log mỗi request sẽ làm nổ chi phí Axiom |

## B3 — Xác nhận thủ công (phần chính của plan này)

Không có test tự động nào thay được các mục dưới đây. **Phải ghi số liệu cụ thể**, không ghi "đã làm".

| # | Việc | Bằng chứng phải ghi lại |
|---|---|---|
| 11 | **Alert fail-open bắn thật**: chủ động làm Redis lỗi ở `dev` ≥5 phút | Thời điểm gây lỗi, thời điểm alert đến, kênh nhận. Alert cấu hình mà chưa từng bắn = **chưa có alert** |
| 12 | Alert **tự tắt** khi Redis hồi phục | Thời điểm hồi phục, thời điểm alert clear |
| 13 | Xác định hạ tầng alert **thật** đang dùng (không giả định) | Tên dịch vụ + nơi cấu hình, ghi vào plan |
| 14 | Query Axiom lấy được **cả 3** loại event | Câu query cụ thể + số bản ghi trả về |
| 15 | Thu **7 ngày liên tục** production shadow, gồm **≥1 ngày cuối tuần** | Khoảng ngày cụ thể. Traffic xổ số có chu kỳ theo lịch quay — mẫu ngày thường không đại diện |
| 16 | Báo cáo 5 cột cho **từng** route đã bật shadow | Bảng đầy đủ, không bỏ route nào |
| 17 | Khuyến nghị per-route: `enforce` / nâng ngưỡng / giữ shadow | **Kèm số liệu** cho từng khuyến nghị, không kèm cảm nhận |
| 18 | Kết luận cửa sổ fingerprint 5s: giữ / giảm / bỏ | Số lần guard bắn + tỉ lệ false positive quan sát được |

## Definition of done

**Phần A (code log/alert):**

- [ ] 3 loại log event có label cố định (hằng), context đủ field, **không PII thô**.
- [ ] Log hoạt động ở **cả** shadow và enforce; có field `mode`.
- [ ] Không log mỗi request — chỉ log event đáng quan tâm.
- [ ] `oxlint` + `prettier` xanh.

**Phần B (test):**

- [ ] 7 unit test (B1) xanh — đặc biệt #3 (không PII) và #4 (phân biệt `denied` vs `failedOpen`).
- [ ] 3 integration test (B2) xanh, gồm #10 (không log spam).
- [ ] B3 #11–12: alert đã **bắn thật và tự tắt**, có ghi thời điểm. Không có bằng chứng này thì alert
      coi như chưa tồn tại.
- [ ] B3 #13: hạ tầng alert thật đã xác định và ghi vào plan (không giả định).
- [ ] B3 #15: đã thu **7 ngày liên tục** gồm ≥1 cuối tuần, có ghi khoảng ngày.
- [ ] B3 #16–17: báo cáo 5 cột đầy đủ + khuyến nghị per-route **kèm số liệu**.
- [ ] B3 #18: có kết luận về cửa sổ fingerprint 5s.


## Không làm trong plan này

- ❌ **Bật `enforce`** — plan này chỉ *cho phép* quyết định, việc bật là PR riêng có số liệu kèm.
- ❌ Dashboard đẹp/tổng quát cho toàn hệ thống — chỉ làm đúng metric phục vụ 2 câu hỏi ở đầu plan.
- ❌ Đổi ngưỡng — thuộc `p1-02`/`p1-03`.
