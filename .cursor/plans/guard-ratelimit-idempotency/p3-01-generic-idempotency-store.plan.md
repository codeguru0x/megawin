# p3-01 — Generic Idempotency Store (Redis)

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §3.3 phương án A
> Overview: `./00-overview.md` · Phase P3 · Chặn bởi: `p0-01` · **Status: deferred**

## ⛔ ĐIỀU KIỆN KHỞI ĐỘNG — đọc trước khi làm bất cứ gì

**KHÔNG triển khai plan này cho tới khi có ít nhất 1 trong các điều kiện sau:**

1. Xuất hiện mutation endpoint **không có WAL** cần idempotency — điển hình: operator nạp/rút tiền
   (`operator-wallet-svc`, `operator-api`).
2. Có endpoint cần **trả lại đúng response cũ** cho replay mà không tra được từ DB.
3. 3 handler `api-tenant` chưa deploy (`suspend-player`…) được deploy **và** xác định cần idempotency
   key thật (hiện `suspend-player` idempotent tự nhiên — suspend 2 lần = suspend, **không cần**).

**Nếu chưa có điều kiện nào → đóng plan, không viết code.** Xây idempotency store generic trước khi có
consumer thật là tạo code chết: một state machine phức tạp trên đường tiền, không ai gọi, nhưng phải
maintain và review mãi mãi.

Lý do điều kiện này chặt: `p0-02` đã giải quyết **toàn bộ** nhu cầu idempotency hiện hữu bằng
Mongo-native với **0 RTT thêm** và **không thêm điểm chết**. Plan này đắt hơn về mọi mặt (analysis
§3.3) và chỉ thắng ở đúng một điểm: dùng được khi **không có WAL**.

## Vì sao phương án A đắt hơn (để không ai vô tình chọn nó thay `p0-02`)

| Tiêu chí | `p0-02` (Mongo-native) | Plan này (Redis) |
|---|---|---|
| RTT thêm trên hot path | **0** | **+2** (reserve trước, commit sau) |
| Redis down | Không ảnh hưởng nhánh có key | **Fail-closed** → từ chối request (đường tiền không được fail-open) |
| Thời gian bảo vệ | 14 ngày (TTL WAL) | TTL Redis (24h) — hết là duplicate lọt lại |
| Nguồn sự thật | Chính giao dịch | **Thêm một nguồn thứ hai** phải đồng bộ |
| Dùng được khi không có WAL | ❌ | ✅ **điểm mạnh duy nhất** |

Đặc biệt lưu ý dòng "Redis down": đường tiền **phải fail-closed** (thà từ chối còn hơn trừ tiền 2
lần) → Redis trở thành **single point of failure của luồng thanh toán**. Đây chính là lý do `p0-02`
không dùng phương án này.

## Thiết kế (khi đủ điều kiện)

### State machine

```
(chưa có) ──SET NX──→ IN_FLIGHT ──handler OK──→ COMPLETED (kèm response đã serialize)
                          │
                          ├──handler throw 5xx──→ (DELETE key → cho retry)
                          └──handler throw 4xx──→ FAILED (cache lỗi, không cho retry vô hạn)
```

Ba điểm phải làm đúng, mỗi điểm là một cách hỏng kinh điển:

1. **`SET NX` phải atomic với việc ghi TTL** — dùng `SET key value NX PX ttl` một lệnh, **không**
   `SETNX` rồi `EXPIRE` (crash giữa 2 lệnh → key vĩnh viễn → endpoint chết với key đó).
2. **`IN_FLIGHT` phải có TTL ngắn** (≈ Lambda timeout + margin). Lambda chết giữa đường mà TTL dài →
   key kẹt `IN_FLIGHT` → client không bao giờ retry được.
3. **Phân biệt 4xx và 5xx**: 5xx là lỗi ta → **xoá key**, cho client retry. 4xx là lỗi client →
   **giữ**, trả lại cùng lỗi (retry sẽ lại 4xx, không cần chạy lại handler).

### Fingerprint — bắt key reuse sai

Cùng `Idempotency-Key` nhưng **body khác** → `422` (không phải 409). Nghĩa là client dùng sai key, khác
hẳn với "đây là retry của cùng request".

Dùng lại `canonicalBody` từ `p0-02` Bước 7 — **không** viết lại (phải sort key/array ổn định, đây là
chỗ đã cảnh báo ở `cache-design.mdc` §2.3).

### Key

```
guard:idem:v1:{scope}:{hashKeyPart(idempotencyKey)}
```

- `scope` phân tách theo endpoint + identity → tenant A không chạm key tenant B. **Bắt buộc**, không
  tùy chọn.
- `hashKeyPart()` vì key do client kiểm soát hoàn toàn và lộ trong monitoring Redis.

### Response caching

Đây là điểm khác biệt duy nhất đáng giá so với `p0-02`: serialize response vào Redis để replay trả
**đúng** response cũ.

- Giới hạn **kích thước** response được cache (vd 64KB) — response lớn làm phình Redis. Vượt → không
  cache, trả `409` thay vì replay. Thà nói "đang xử lý/đã xử lý" còn hơn OOM Redis.
- **Không** cache header động (`Set-Cookie`, timestamp) — chỉ body + status.
- Dùng JSON date codec đã có trong `packages/cache` nếu response chứa `Date` (đã có sẵn:
  `test/unit/json-date-codec.test.ts`) — **không** viết codec mới.

## Fail-closed — phải tường minh

```
Redis lỗi/timeout → AppException.serviceUnavailable("Hệ thống đang bận, vui lòng thử lại.")
```

**Ngược hoàn toàn** với rate limit (fail-open). Lý do và ranh giới:

| Lớp | Redis down | Vì sao |
|---|---|---|
| Rate limit | fail-**open** | Phòng thủ; chặn hết traffic thật là tự gây sự cố |
| Fingerprint guard (`p0-02`) | fail-**open** | Suy đoán ý định người dùng, không phải ràng buộc |
| Idempotency store này | fail-**closed** | Đường tiền; thà từ chối còn hơn trừ tiền 2 lần |

Trong code, mỗi chỗ chọn fail-open/closed **phải có comment nói rõ vì sao** — trộn lẫn 2 triết lý này
là cách tạo bug tài chính.

## Test

- Replay trả **đúng byte-for-byte** response cũ (status + body).
- `IN_FLIGHT` → 409, **không** chạy handler lần 2 (assert bằng spy trên handler).
- Cùng key + body khác → 422.
- Handler throw 5xx → key **bị xoá** → retry chạy lại handler được.
- Handler throw 4xx → key **giữ** → retry trả lại cùng lỗi, không chạy handler.
- **Redis down → 503, KHÔNG cho qua** (test quan trọng nhất — ngược với test fail-open của `p0-01`).
- TTL `IN_FLIGHT` hết → retry chạy lại được (mô phỏng Lambda crash).
- Response > giới hạn → không cache, trả 409.

## Definition of done

- [ ] **Đã xác nhận có consumer thật** (ghi rõ endpoint nào, thuộc app nào) — không có thì không làm.
- [ ] `SET NX PX` một lệnh atomic, không `SETNX` + `EXPIRE` rời.
- [ ] TTL `IN_FLIGHT` ≈ Lambda timeout + margin, là hằng số có JSDoc giải thích.
- [ ] Phân biệt 4xx/5xx đúng như bảng state machine.
- [ ] Fail-**closed**, có comment giải thích vì sao khác rate limit.
- [ ] `canonicalBody` **dùng lại** từ `p0-02`, không viết lại.
- [ ] Giới hạn kích thước response có hằng số + xử lý vượt ngưỡng.
- [ ] Toàn bộ test ở trên xanh, đặc biệt test Redis-down-trả-503.
- [ ] `oxlint` + `prettier` xanh.

## Không làm trong plan này

- ❌ **Chuyển `place-bet` sang dùng store này** — `p0-02` đã tốt hơn ở mọi tiêu chí trừ "không cần
  WAL". Đổi là bước lùi: +2 RTT và biến Redis thành SPOF của luồng đặt cược.
- ❌ Áp dụng cho endpoint read-only — idempotent theo bản chất HTTP.
- ❌ Gộp với rate limit thành một middleware — hai mối quan tâm khác nhau, hai triết lý fail khác nhau.
