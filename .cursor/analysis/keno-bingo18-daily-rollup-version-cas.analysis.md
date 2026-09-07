# p0-01 — Vì sao nên thay `aggregateSeq = Date.now()` bằng CAS trên `version`

Trả lời trực tiếp câu hỏi: *"vì sao không dùng inc number của mỗi ngày — khi lấy thông
tin thì find-and-update và có số version, sau đó update thì version phải như cũ, nếu
không thì query lại?"*

**Câu trả lời ngắn: đề xuất đó ĐÚNG và chặt hơn thiết kế hiện tại của plan.** Plan
đang làm cùng một ý (optimistic lock) nhưng chọn **nguồn version yếu** (`Date.now()`),
và điều đó tạo ra 3 lỗ hổng cụ thể bên dưới.

---

## 1. Plan hiện tại làm gì

`p0-01` §3.1–3.2:

```
seq = Date.now()                     // trước khi aggregate
filter: { financialDate, gameProduct,
          $or: [ { aggregateSeq: { $lt: seq } },
                 { aggregateSeq: { $exists: false } } ] }
update: { $set: { ...report, aggregateSeq: seq } }
upsert: true
```
\+ verify-and-retry: ghi xong đọc lại `drawCount`, lệch thì retry.

Đây **là** optimistic locking. Vấn đề nằm ở chỗ `Date.now()` là **"tôi đọc lúc nào"**,
không phải **"tôi đã đọc thấy cái gì"**. Version phải là thuộc tính của **dữ liệu**,
không phải của **đồng hồ người đọc**.

---

## 2. Ba lỗ hổng cụ thể của `Date.now()`

### 2.1 Clock skew giữa các Lambda → mất tiền đúng theo kiểu đang muốn sửa

Plan §3.3 biện luận *"AWS Lambda dùng NTP, skew < 1ms"*. Đó là **giả định về hạ tầng
để bảo vệ tính đúng đắn của đường tiền** — không phải bảo đảm hợp đồng. Nếu instance A
nhanh hơn B 50ms:

| t (thực) | Luồng A (clock +50ms) | Luồng B (clock đúng) |
|---|---|---|
| t=100 | đọc, thấy **118 kỳ**, `seq = 150` | — |
| t=120 | — | đọc, thấy **119 kỳ**, `seq = 120` |
| t=130 | — | ghi `seq=120` ✅ → rollup = 119 |
| t=140 | ghi `seq=150` ✅ (150 > 120) | — |
| | | **rollup = 118 — mất 1 kỳ** |

Đây **chính là bug plan đang đi sửa**, chỉ khó tái hiện hơn. Verify-and-retry chỉ cứu
được nếu `drawCount` lệch; nếu một kỳ bị void đồng thời một kỳ mới settle thì
`drawCount` **trùng** mà `totalStake` sai → không phát hiện được.

### 2.2 Độ phân giải ms → hai luồng cùng `seq`, `$lt` loại cả hai chiều

Settle 119 kỳ song song thì nhiều Lambda khởi động trong **cùng một millisecond** là
bình thường. `seq` bằng nhau → `$lt` không thoả → luồng đọc dữ liệu **mới hơn** bị từ
chối im lặng. Rơi lại vào verify-retry, tức là dựa vào lớp cứu hộ cho một tình huống
lẽ ra không nên xảy ra.

### 2.3 Nhánh `$exists: false` là cửa hậu vô điều kiện

```
{ aggregateSeq: { $exists: false } }   // ← luôn khớp
```

Với doc chưa có field, **mọi** writer đều thắng — kể cả writer cũ nhất. Đúng vùng cần
bảo vệ nhất (lần ghi đầu của ngày) lại là vùng **không có** bảo vệ. Plan §4.1 xử lý
bằng comment, không bằng cơ chế.

Thêm nữa `upsert: true` + filter có `$or` → khi doc tồn tại mà filter không khớp, Mongo
**cố insert** → `E11000`. Plan đã lường (§4.2 cảnh báo) nhưng xử lý là *"coi như bị từ
chối"* — sai chiều: kẻ thua cuộc insert-race có thể đang giữ dữ liệu **mới hơn**, nên
phải **retry**, không phải bỏ qua.

---

## 3. Vì sao "inc counter riêng" (đúng nghĩa đen) cũng chưa phải đáp án

Plan §3.3 từ chối counter với lý do *"thêm 1 round trip vào đường tiền nóng nhất"* —
lý do này **đúng nếu** counter là một document riêng. Nhưng bản `findOneAndUpdate` +
`$inc` **khi đọc** còn 2 vấn đề nữa:

1. **Mutate-on-read**: hai reader đồng thời nhận 2 token khác nhau nhưng **thấy cùng
   một dữ liệu**. Token khác nhau không nói được ai mới hơn → tự nó không sửa được gì,
   vẫn cần CAS lúc ghi.
2. **Phá idempotent re-run**: SFN retry → `$inc` lần nữa → token luôn cao hơn → **mọi
   retry đều thắng, kể cả retry mang dữ liệu cũ**. Ngược hẳn mục tiêu.

---

## 4. Phương án đề nghị — CAS trên `version` của chính document

Không cần counter riêng, không cần đồng hồ. **Version sống trên chính doc đang ghi.**

```typescript
// 1. ĐỌC — song song với aggregate, 0 round trip thêm (§1.4 vercel-react-best-practices)
const [drawAgg, current] = await Promise.all([
  reportRepo.aggregateDaily(financialDate, gameProduct),
  gameDailyRepo.findVersion(financialDate, gameProduct),   // projection { version: 1 }
]);
const expected = current?.version ?? 0;

// 2. GHI — CAS chính xác, $eq không phải $lt
filter: {
  financialDate, gameProduct,
  $expr: { $eq: [ { $ifNull: ["$version", 0] }, expected ] },
}
update: { $set: { ...report }, $inc: { version: 1 } }
upsert: true

// 3. matchedCount === 0 hoặc E11000  →  quay lại bước 1 (aggregate LẠI)
```

### Vì sao chặt hơn

| Tiêu chí | `Date.now()` | CAS `version` |
|---|---|---|
| Phụ thuộc đồng hồ | ✗ có | ✓ không |
| Va chạm cùng ms | ✗ có | ✓ không (`$eq` chính xác) |
| Doc thiếu field | ✗ cửa hậu `$exists:false` | ✓ `$ifNull → 0`, xếp thứ tự đúng, **không có cửa hậu** |
| Round trip thêm | 0 | 0 (`findOne` chạy song song aggregate) |
| Còn cần verify-retry? | **cần** (§3.2 của plan) | Vẫn nên giữ 1 vòng, nhưng nó không còn là lớp chống race duy nhất |

`$expr` **không** làm mất index: `{financialDate, gameProduct}` là equality prefix của
unique index nên Mongo định vị đúng 1 doc rồi mới eval `$expr`. Kết luận §5 của plan
("không cần index mới") vẫn đúng.

---

## 5. Idempotent khi SFN chạy lại — điều quan trọng nhất, và nó KHÔNG đến từ version

Cần nói rõ để không hiểu sai: **version chống ghi CŨ, không chống ghi LẶP.**

Tính chạy-lại-nhiều-lần đến từ một tính chất khác: mọi lần ghi là **snapshot toàn phần
`$set` từ một lần re-aggregate**, không bao giờ `$inc` trường tiền (đúng theo
`financial-reporting-system.mdc`). Nên:

- SFN retry → đọc `version = v+1`, aggregate lại (**cùng dữ liệu**), ghi → **nội dung y
  hệt**, `version = v+2`. Số tiền không nhân đôi.
- `version` nhảy số không mang ý nghĩa nghiệp vụ, không expose ra DTO/API.

**Bất biến phải giữ bằng mọi giá:** không một trường tiền nào trong
`system_settle_game_daily` / `system_settle_tenant_daily` được cập nhật bằng `$inc`.
Ngày nào phá bất biến này thì mọi lớp version bên trên đều vô nghĩa.

---

## 6. An toàn cho 6 game còn lại

Đây là code **dùng chung**, mọi game đều gọi vào → blast radius là 7 game. Ba biện pháp:

1. **Đừng đổi signature public của repo.** Plan §7 chấp nhận đổi
   `upsertGameDaily(report, seq) → boolean` và sửa mọi call site. Thay vào đó: **đặt
   vòng CAS-retry trong use-case dùng chung** (`SystemPublishSettleDailyUseCase`) và
   giữ nguyên chữ ký repo (thêm param **optional**). Ít call site phải sửa = ít chỗ
   sai cho 6 game kia. Vòng lặp buộc phải nằm ở use-case vì retry cần **aggregate
   lại**, mà aggregate không thuộc repo.
2. **`version` optional trong entity + `$ifNull`** → doc cũ của mọi game vẫn ghi được,
   không cần migration, không có cửa hậu.
3. **E11000 → retry, không phải bỏ qua.** Nhận diện bằng `error.code === 11000`
   (không so chuỗi message — plan §4.3 đã đúng điểm này).

---

## 7. Hai điểm khác nên sửa trong plan

### 7.1 Bỏ `drawCount: -1` + `rollupStale`, để SFN retry

Plan §4.3 tạo `MAX_ROLLUP_ATTEMPTS` + sentinel `-1` khi hết attempt. Vấn đề: SFN **đã
có** retry policy với backoff. Dựng lớp retry thứ hai rồi trả một giá trị độc (`-1`)
chảy tiếp vào luồng báo cáo là tự tạo trạng thái mới phải xử lý ở mọi consumer.

Đề nghị: 2 lần thử trong process (đủ cho race thường), hết thì **throw**. SFN retry với
backoff, và ở đó có visibility (execution history) thay vì một số `-1` chìm trong doc.

### 7.2 Đổi `$lt` → `$eq` làm biến mất cả một lớp lý luận

Với `$eq` trên `version`, các đoạn §3.3 (biện luận clock skew), §4.1 (giải thích
`$exists:false`), và phần lớn §3.2 (verify-retry như lớp chống race chính) **không còn
cần thiết**. Plan ngắn hơn và ít chỗ để sai hơn — đó là tín hiệu tốt về thiết kế.

---

## 8. Việc cần làm

- [ ] Đổi `aggregateSeq: number` → `version: number` (optional), CAS `$eq` + `$inc`
- [ ] Xoá nhánh `$or`/`$exists: false`, thay bằng `$expr` + `$ifNull`
- [ ] `findVersion()` chạy trong `Promise.all` cùng `aggregateDaily()` — không thêm latency
- [ ] E11000 → **retry**, không phải "coi như bị từ chối"
- [ ] Vòng CAS-retry đặt ở use-case dùng chung, giữ chữ ký repo tương thích ngược
- [ ] Bỏ sentinel `-1` / `rollupStale`, throw để SFN retry
- [ ] Test: 10 luồng đồng thời → `drawCount` chính xác; **và** test skew (inject clock
      lệch) phải PASS — test này `Date.now()` không thể pass
- [ ] Grep xác nhận không `$inc` nào chạm trường tiền:
      `rg -n '\$inc' packages/*/src/infras/repos/system-settle-*`
