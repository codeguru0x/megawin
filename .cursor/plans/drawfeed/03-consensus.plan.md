# DrawFeed — Consensus & Publish

Tổng hợp N observation của N nguồn độc lập thành **một** kết quả. Nơi duy nhất các website "gặp nhau".

## 1. Bốn bất biến — vi phạm bất kỳ cái nào là bug nghiêm trọng

| # | Bất biến | Vì sao |
| --- | --- | --- |
| **B1** | `HumanVerified` **KHÔNG BAO GIỜ** bị máy ghi đè. Máy thấy state này ⇒ thoát ngay | Yêu cầu D6: người là flag cao nhất. Nếu máy ghi đè được thì việc verify là vô nghĩa |
| **B2** | Kết quả công bố **PHẢI** dựa trên observation của nguồn `Authoritative` đã `IntrinsicState.Passed` | Nguồn confirm có thể **chặn** nhưng **không** được trở thành nguồn công bố. Trọng số cao không đổi được vai trò |
| **B3** | So sánh giữa các nguồn dùng **`payoutHash`** (đã canonical). Ghi ra ngoài dùng **`numbersDisplay`** của authoritative | Bingo18 `5,2,5` vs `2,5,5` là **cùng** kết quả; nếu so bằng `displayHash` sẽ báo conflict giả (01 §3) |
| **B4** | Observation `IntrinsicState.Failed` **không tham gia** consensus (nhưng vẫn lưu) | Dữ liệu đã tự mâu thuẫn thì không dùng để bầu |

`B2` cần nói rõ vì dễ hiểu lệch: hai nguồn confirm cùng khớp nhau **không** đủ để công bố nếu
authoritative chưa có hoặc đã fail. Lý do là ToS + tính chính danh: kết quả công bố phải truy nguyên
được về nguồn chính thức, không phải "hai mirror đồng ý với nhau".

---

## 2. Ưu tiên nguồn — hai trục ĐỘC LẬP, không gộp

Đây là điểm dễ thiết kế sai nhất. `role` và `trustWeight` là **hai trục khác nhau**:

| | `role` | `trustWeight` |
| --- | --- | --- |
| Trả lời câu hỏi | "Được làm **cơ sở công bố** không?" | "Khi lệch nhau, tin ai **hơn**?" |
| Giá trị | `Authoritative` / `Confirming` / `Reference` | 0–100 |
| Đổi bằng | Quyết định **nghiệp vụ/pháp lý** | Quyết định **kinh nghiệm vận hành** |

Nếu gộp thành một con số ("nguồn nào điểm cao nhất thì công bố") thì một mirror được nâng điểm vì
"lâu nay luôn đúng" sẽ **lặng lẽ trở thành nguồn chính thức** — mất tính chính danh mà không ai bấm
nút nào cả. Tách hai trục làm việc đó thành **không thể**: muốn mirror công bố được thì phải đổi
`role`, và đổi `role` là hành động có audit log.

Cấu hình khởi đầu:

| sourceId | role | trustWeight | Ghi chú |
| --- | --- | --- | --- |
| `vietlott-detail` | `Authoritative` | 100 | Nguồn chính thức duy nhất |
| nguồn confirm Keno | `Confirming` | 60 | Veto được, không công bố được |
| site thêm sau | `Reference` | 10 | Vào `Reference` trước, quan sát rồi mới nâng |

**Nguồn mới luôn vào `Reference`.** Không veto, không công bố — chỉ ghi nhận. Sau khi có số liệu
thống kê "khớp bao nhiêu %/bao nhiêu kỳ" mới nâng lên `Confirming`. Đây là cách tránh việc một parser
mới còn lỗi làm tê liệt cả hệ thống bằng conflict giả.

---

## 3. Thuật toán `ConsensusTickUseCase`

Đọc observations của một `(gameKey, drawPeriod)`, ra quyết định.

```
0. Đọc consensus doc hiện tại.
   state == HumanVerified || Rejected  ⇒  THOÁT NGAY (B1)      ← chốt chặn đầu tiên
1. Lấy observations của kỳ, LOẠI mọi bản IntrinsicState.Failed (B4)
2. Không có observation nào ⇒ giữ Pending, thoát
3. Nhóm observations theo payoutHash (B3)
4. Tìm nhóm có chứa nguồn Authoritative:
   ├─ không có nguồn Authoritative nào  ⇒ Pending (B2) + alert nếu quá hạn
   └─ có ⇒ nhóm đó là "nhóm ứng viên"
5. Có nhóm khác (chứa Confirming) mang payoutHash KHÁC?
   ├─ KHÔNG  ⇒ áp policy "đủ điều kiện chốt" (§4) ⇒ Agreed hoặc Pending
   └─ CÓ     ⇒ áp ConflictPolicy (§4)
6. Ghi consensus với optimistic lock: filter { drawPeriod, version } → $set + $inc version
```

**Bước 0 là chốt chặn duy nhất cho B1** — đặt ở đầu, trước mọi tính toán, để không thể "tính xong rồi
mới nhớ ra". Kèm điều kiện `version` ở bước 6 nên hai tick chạy song song không thể ghi đè nhau.

`Rejected` cũng chặn ở bước 0: người đã kết luận kỳ này không dùng được thì máy không được tự hồi sinh.

---

## 4. Chính sách khi lệch nhau

`ConflictPolicy` cấu hình **per game** (Keno có nguồn confirm, Bingo18 hiện không ⇒ nhu cầu khác nhau).

### `HumanOnly` — MẶC ĐỊNH, dùng cho G1–G5

Bất kỳ lệch nào ⇒ `Conflict`, chờ người. Không tự chốt.

Chọn làm mặc định vì ở giai đoạn đầu, **nguyên nhân lệch phổ biến nhất là parser của ta sai**, không
phải nguồn sai. Tự động chọn bên nào cũng là tự động tin vào parser chưa được kiểm chứng.

### `AuthoritativeWins`

Nguồn `Authoritative` thắng, **với 3 điều kiện đồng thời**:

1. Observation của nó `IntrinsicState.Passed` (không phải `NotAvailable`).
2. `drawPeriod` khớp `expectedPeriod` (không phải trang lệch kỳ).
3. Số nguồn `Confirming` phản đối **không vượt** ngưỡng cấu hình (mặc định: 0 — có 1 nguồn phản đối
   là đủ để chờ người).

Điều kiện 1 quan trọng: `Passed` nghĩa là số **và** checksum của chính nguồn đó khớp nhau. Nếu chỉ có
`NotAvailable` (nguồn không công bố checksum) thì không có gì bảo đảm parser đọc đúng ⇒ không được
tự thắng.

### `WeightedQuorum`

Tổng `trustWeight` của nhóm ứng viên ≥ ngưỡng **và** nhóm đó chứa `Authoritative` (B2 vẫn áp).
Chỉ bật khi đã có ≥ 3 nguồn ổn định — với 2 nguồn thì trọng số không thêm thông tin gì so với
`AuthoritativeWins`.

### Kỳ lệch **và** có tiền đang treo

Nếu core đã PULL kết quả cũ của kỳ này rồi (đã settle) mà consensus đổi ⇒ **không** tự sửa gì.
`drawfeed` không biết core đã settle hay chưa (D7) ⇒ nó chỉ đánh dấu `Conflict` + alert; việc đối
chiếu và resettle là quyết định của core với `payoutHash` mà nó nhận được.

---

## 5. Human verify — flag cao nhất

`VerifyConsensusUseCase` (người) là **write path duy nhất** được ghi `humanVerify` và
`state = HumanVerified`.

```typescript
export interface VerifyConsensusInput {
  gameKey: DrawFeedGameKey;
  drawPeriod: string;
  /** Observation người chọn làm chuẩn. Null ⇔ người tự nhập số tay. */
  chosenObservationId: string | null;
  /** Số người tự nhập — CHỈ khi `chosenObservationId` null. ĐÚNG thứ tự công bố. */
  manualNumbers?: string[];
  /** Bắt buộc khi kết quả khác thứ máy đề xuất. */
  note?: string;
  accountId: string;
  username: string;
}
```

Ràng buộc:

- Người **chọn từ observation** là đường chính. Nhập tay là đường phụ, phải có `note`.
- Nhập tay **vẫn phải qua `checkIntrinsic`**: nếu số người nhập không khớp checksum mà nguồn công bố
  thì **cảnh báo rõ ràng và bắt xác nhận lần hai** — không âm thầm nhận. Người cũng gõ sai.
- Mọi lần verify ghi `@megawin/audit`: ai, khi nào, chọn gì, số cũ → số mới.
- `HumanVerified` rồi vẫn **sửa được** bởi người khác, nhưng phải qua cùng use-case này và **ghi
  audit đầy đủ** (`version` tăng). Không có "khoá cứng vĩnh viễn" — sai của người cũng cần sửa được.

**`Rejected`** dùng khi kỳ không dùng được (nguồn công bố sai rồi rút, kỳ bị huỷ). Cũng chặn máy như
`HumanVerified`.

---

## 6. Publish

Tách khỏi consensus: `state` là *"kết quả đúng chưa"*, `publishedAt` là *"cho bên ngoài đọc chưa"*.
Hai câu hỏi khác nhau — gộp lại thì không thể có kết quả đã chốt mà chưa muốn công bố.

| Điều kiện publish | G5 (manual) | G6 (auto) |
| --- | --- | --- |
| `state ∈ { Agreed, HumanVerified }` | ✅ | ✅ |
| Người bấm publish | ✅ bắt buộc | — |
| `state = HumanVerified` | — | ✅ bắt buộc lúc đầu |
| Kill-switch global `isPublishEnabled` | ✅ | ✅ |

G6 chỉ bật sau khi có số liệu đo được từ G5: tỷ lệ `Agreed` khớp với thứ người xác nhận, qua bao nhiêu
kỳ. Không bật theo cảm giác "chạy ổn rồi".

**Core PULL** (D7): `GET /api/results?since=<cursor>` chỉ trả bản có `publishedAt != null`, sắp theo
`publishedAt`. Core tự map `drawPeriod` → `drawId` của nó, tự so `payoutHash` với `DrawDoc` hiện có,
tự quyết settle/resettle. `drawfeed` **không** biết những việc đó.

---

## 7. Alert

| Alert | Điều kiện | Ý nghĩa |
| --- | --- | --- |
| `consensus_conflict` | `state = Conflict` | **Cần người** — ưu tiên cao nhất |
| `period_gap` | `drawPeriod` lệch `expectedPeriod` | Có thể nhảy kỳ hoặc trang cache cũ |
| `intrinsic_failed` | Checksum lệch | Parser sai **hoặc** nguồn đổi luật |
| `source_stale` | Nguồn không có observation mới quá N phút | Site đổi HTML / bị chặn |
| `fetch_failing` | `consecutiveFailures ≥ 3` | Vendor hoặc site có vấn đề |
| `human_review_backlog` | Số kỳ `Conflict` chờ > ngưỡng | Người không theo kịp máy |
| `cost_spike` | Chi phí ngày > ngưỡng | Nghi vòng lặp retry hỏng |

`human_review_backlog` là alert dễ bị bỏ quên nhưng quan trọng: nếu người không duyệt kịp thì hệ
thống *đang* thất bại một cách im lặng — đủ dữ liệu mà không ai dùng được.

---

## 8. Checklist

- [ ] Bước 0 của `ConsensusTickUseCase` chặn `HumanVerified`/`Rejected` **trước mọi tính toán**. Có test.
- [ ] Test: máy chạy trên kỳ `HumanVerified` ⇒ doc **không đổi** (kể cả `updatedAt`, `version`).
- [ ] Test Bingo18: nguồn A `5,2,5`, nguồn B `2,5,5` ⇒ **Agreed**, không phải Conflict (B3).
- [ ] Test: 2 nguồn `Confirming` khớp nhau, không có `Authoritative` ⇒ **Pending**, không Agreed (B2).
- [ ] Test: observation `IntrinsicState.Failed` không được tính vào nhóm nào (B4).
- [ ] `numbers` ghi ra là `numbersDisplay` của authoritative — **không phải** `numbersCanonical`.
- [ ] Ghi consensus có optimistic lock theo `version`.
- [ ] Chỉ `VerifyConsensusUseCase` ghi `humanVerify`. Grep để chắc.
- [ ] Nhập tay lệch checksum ⇒ bắt xác nhận lần hai, không im lặng nhận.
- [ ] Mọi verify/publish/đổi `role` đều ghi audit.
- [ ] `publishedAt` tách khỏi `state`; kill-switch có tác dụng.
