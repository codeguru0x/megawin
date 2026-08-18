# Vòng đời vận hành — 7 sản phẩm game

> **Số liệu trong tài liệu này:** tài liệu này mô tả trạng thái và quy trình — không có số cấu
> hình nào để tra. Số liệu cụ thể của từng game PHẢI lấy bằng `getGameConfig`.

## Vòng đời 1 kỳ quay (Draw)

Mọi game đi qua các trạng thái theo thứ tự sau (tên trạng thái hiển thị trên UI Vận hành):

```
Tạo kỳ → Mở bán → Đóng bán → Đã công bố kết quả → Đã kết sổ (settled)
                                                  → Đã hủy (voided)
```

- **Mở bán → Đóng bán**: hệ thống tự đóng bán trước giờ quay một khoảng thời gian cấu hình
  riêng theo game (xem `overview.md` của game, section cấu hình `play`). Sau khi đóng bán,
  không ai mua thêm vé cho kỳ đó được nữa.
- **Công bố kết quả → Kết sổ**: sau khi nhân viên nhập và công bố kết quả quay chính thức, hệ
  thống tự động kết sổ — tính trúng thưởng, tài chính, và (nếu game có Jackpot) cập nhật số
  Jackpot. Việc này chạy tự động, không cần thao tác thêm.
- **Hủy kỳ (void)**: khi có sự cố vận hành, nhân viên có quyền hủy 1 kỳ. Toàn bộ vé đã mua cho
  kỳ đó được hoàn tiền tự động; kỳ không tính là đã chơi (không ảnh hưởng Jackpot, không trả
  thưởng).

## Vòng đời 1 vé (Ticket)

```
Đang tạo (draft) → Đã thanh toán (paid, không sửa được nữa) → Hoàn tất / Đã hoàn tiền
```

Sau khi thanh toán, vé **không thể sửa** lựa chọn board hay số kỳ chơi — mọi thay đổi (hủy kỳ,
kết sổ lại) đều xử lý ở cấp entry, không sửa trực tiếp vé gốc.

## Vòng đời 1 entry (1 vé × 1 kỳ quay)

```
Đang chờ (pending) → Đã kết sổ (có kết quả trúng thưởng)
                   → Đã hủy (nếu kỳ đó bị void)
```

Vé chơi nhiều kỳ liên tiếp tạo ra nhiều entry độc lập — nếu 1 kỳ trong số đó bị hủy, chỉ entry
của kỳ đó bị ảnh hưởng, các kỳ khác của cùng vé vẫn tiếp tục bình thường.

## Kết sổ lại (Resettle)

Khi một kỳ **đã kết sổ** nhưng sau đó phát hiện kết quả công bố sai và cần sửa, nhân viên thao
tác **Sửa kết quả** rồi **Kết sổ lại**. Hệ thống tự phân loại độ phức tạp của lần sửa (kỳ độc
lập, ảnh hưởng người trúng Jackpot, hay ảnh hưởng dây chuyền nhiều kỳ sau) và hướng dẫn ngay
trên UI. 3 game có Jackpot (Lotto 5/35, Mega 6/45, Power 6/55) có hướng dẫn thao tác chi tiết ở
topic riêng "Kết sổ lại (Resettle)" trong `/guides` — không nhầm với nội dung `payout.md`.

## Ai làm gì

- **Nhân viên vận hành (Staff)**: mở/đóng bán, nhập & công bố kết quả, hủy kỳ, kết sổ lại các
  trường hợp đơn giản, xem báo cáo tài chính/vận hành.
- **Quản trị viên (DBA)**: chỉ cần can thiệp ở các trường hợp kết sổ lại phức tạp (đổi người
  trúng Jackpot, ảnh hưởng dây chuyền nhiều kỳ) — hệ thống tự báo khi cần.

## Lưu ý dễ sai

- Kết sổ chạy **tự động** ngay sau khi công bố kết quả — nhân viên không cần bấm "kết sổ" cho
  kỳ mới, chỉ cần cho trường hợp **kết sổ lại**.
- Hủy kỳ (void) khác với sửa kết quả (resettle): void dùng khi kỳ đó **không nên tính** (lỗi
  vận hành trước khi có kết quả); resettle dùng khi kỳ **đã có kết quả sai** cần sửa lại.
- Trạng thái "đang kết sổ (settling)" chỉ tồn tại trong thời gian ngắn khi hệ thống đang xử lý —
  nếu kẹt lâu (quá khoảng thời gian hợp lý), đó là dấu hiệu lỗi kỹ thuật cần báo đội kỹ thuật,
  không phải trạng thái bình thường.
