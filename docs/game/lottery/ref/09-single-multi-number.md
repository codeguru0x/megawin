# 09 — Single Number & Multi Number (Thống kê điểm/tiền theo con số)

**Mục đích**: thống kê **điểm/tiền cược đã ôm** theo từng con số, cho từng tài khoản & từng cấp. Đây là dữ liệu đầu vào cho:

- Bảng điều hành rủi ro (nhìn số nào bị ôm nhiều).
- Worker tăng giá tự động (`extra-price` đọc `singleNumber.Point` — file 04).
- Tính `getMaxPointCanBetPerNumber` (file 07).

Đường dẫn (dùng chung): `server/src/services/lottery/common` (single-number / multi-number).

- **Single Number**: cho kiểu cược 1 số (Đề, Lô, 2D/3D/4D...).
- **Multi Number**: cho kiểu cược ghép nhiều số (Xiên 2/3/4) — thống kê theo tổ hợp số.

---

## A. Entity `SingleNumberEntity` — collection `singleNumbers`

| Field                     | Kiểu              | Ý nghĩa                                                 |
| ------------------------- | ----------------- | ------------------------------------------------------- |
| `UserId`                  | string            | Tài khoản (mỗi cấp có bản ghi riêng — **denormalized**) |
| `Level`                   | UserCustomerLevel | Cấp tài khoản                                           |
| `Term, GameType, BetType` |                   | Khóa                                                    |
| `Number`                  | string            | Con số 00-99 (hoặc 3D/4D)                               |
| `Point`                   | Long              | Tổng điểm đã ôm cho số này                              |
| `Amount`                  | Decimal128        | Tổng tiền tương ứng                                     |
| `Quantity`                | number            | Số lượt cược vào số này                                 |
| `UpdatedAt`               | Date              |                                                         |

> Mỗi lượt cược tạo/nâng bản ghi cho **mọi cấp** trong cây (Player → ... → Company), để mỗi đại lý xem được tổng ôm ở nhánh mình.

## B. Entity `MultiNumberEntity` — collection `multiNumbers`

Tương tự SingleNumber nhưng `Number` là **tổ hợp** (ví dụ Xiên 2 = "12-34"). Dùng để giới hạn/theo dõi cược Xiên theo nhóm số (`MaxPointForNumberGroup` trong parameter).

---

## C. Công thức tăng thống kê — `increaseNumbersByTicketTXs`

Với mỗi ticket item vừa cược, xây `bulkWrite` upsert `$inc`:

```
Point    += ticketItemPoint          (mỗi Number trong item)
Amount   += <income của cấp tương ứng>  (hoặc PayAmount tùy cấp/ngữ cảnh)
Quantity += 1
```

- Lặp qua **từng cấp shareHolder** của item → mỗi cấp một dòng upsert (theo `UserId + Term + GameType + BetType + Number`).
- Với Xiên → ghi vào `multiNumbers` theo tổ hợp số thay vì từng số lẻ.
- **Huỷ cược** (file 08): gọi cùng hàm với giá trị **âm** (đảo dấu `Point/Amount/Quantity`) → giảm thống kê.

> Dùng `Long`/`Decimal128` + `$inc` đảm bảo cộng dồn chính xác, không sai số và không tràn.

---

## D. Analytics tổng hợp

- Các query aggregate nhóm theo `Number` để ra bảng "điểm ôm theo số" cho một đại lý (`$match UserId + Term + GameType + BetType` → sort Point desc).
- Worker `extra-price` đọc trực tiếp `singleNumber.Point` (điểm công ty ôm) để quyết định tăng giá / đóng số theo ngưỡng (file 04 mục D).
- `getMaxPointCanBetPerNumber` (file 07) dùng `MaxPointForNoShare/MaxPointForMaxShare` so với điểm đã ôm để chặn cược thêm.

---

## E. API endpoints

**Agent** (điều hành rủi ro):

- `GET /agent/single-numbers?Term&GameType&BetType` — bảng điểm/tiền ôm theo số của nhánh mình.
- `GET /agent/multi-numbers?...` — thống kê Xiên.

---

## F. Gợi ý khi xây lại

1. **Denormalize theo từng cấp** giúp đại lý xem tổng ôm của nhánh mình nhanh (không phải aggregate runtime toàn cây) — đánh đổi bằng chi phí ghi nhiều dòng mỗi cược.
2. **`$inc` với Long/Decimal128** là cách cộng dồn an toàn; huỷ cược = `$inc` âm — giữ đối xứng tuyệt đối để số liệu không lệch.
3. Đây là nguồn dữ liệu **nóng** cho tăng giá tự động và chặn cược → cần cân nhắc index `{UserId, Term, GameType, BetType, Number}` và write throughput.
