# p2-01 — Observability cho Guard

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §3.4, §5.1
> Overview: `./00-overview.md` · Phase P2 · Chặn bởi: `p1-02` · **Chặn việc bật `enforce`**

Plan này là **điều kiện tiên quyết để tắt shadow mode**. Không có số liệu thì bật `enforce` là canh bạc.

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

## Definition of done

- [ ] 3 loại log event có label cố định, context đủ field, **không PII thô**.
- [ ] Log hoạt động ở **cả** shadow và enforce.
- [ ] Alert fail-open ≥5 phút đã cấu hình **và test được** (chủ động làm Redis lỗi ở dev → alert bắn).
- [ ] Đã xác định hạ tầng alert thật (không giả định), ghi rõ vào plan.
- [ ] Báo cáo 5 cột cho từng route đã bật shadow.
- [ ] Đã thu **7 ngày liên tục** gồm ít nhất 1 cuối tuần.
- [ ] Có khuyến nghị rõ ràng cho từng route: bật `enforce` / nâng ngưỡng / giữ shadow — **kèm số liệu**.
- [ ] Có kết luận về cửa sổ fingerprint 5s.

## Không làm trong plan này

- ❌ **Bật `enforce`** — plan này chỉ *cho phép* quyết định, việc bật là PR riêng có số liệu kèm.
- ❌ Dashboard đẹp/tổng quát cho toàn hệ thống — chỉ làm đúng metric phục vụ 2 câu hỏi ở đầu plan.
- ❌ Đổi ngưỡng — thuộc `p1-02`/`p1-03`.
