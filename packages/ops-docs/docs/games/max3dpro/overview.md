# Max 3D Pro — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải, tỷ
> lệ, ngưỡng, giờ quay) PHẢI lấy bằng `getGameConfig` cho game này trong chính lượt trả lời.
> Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Max 3D Pro là game xổ số tự chọn dùng **bộ ba số** (3 chữ số, "000"-"999"), họ hàng gần với
Max 3D nhưng có cấu trúc chơi khác hẳn: người chơi **luôn chọn theo cặp bộ ba số có thứ tự**
(cặp "bộ đầu" và "bộ sau" — đổi thứ tự 2 bộ tạo ra 1 cặp khác). Lịch quay (những ngày nào trong
tuần, giờ quay) là **cấu hình** — tra `getGameConfig` section `play`.
<!-- structural: dải bộ ba số 000-999 là bản chất game 3 chữ số, không phải config -->

Mỗi kỳ hệ thống quay ra **20 bộ ba số**, chia thành 4 nhóm giải giống Max 3D: Đặc Biệt (2 bộ),
Nhất (4 bộ), Nhì (6 bộ), Ba (8 bộ). Điểm khác biệt cốt lõi: **thứ tự quay của 2 bộ trong nhóm Đặc
Biệt có ý nghĩa** — tạo ra Giải Đặc Biệt (đúng thứ tự) và Giải Phụ Đặc Biệt (ngược thứ tự), tính
năng chỉ có ở Max 3D Pro.

1 vé có thể chứa nhiều board (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định).
Không có "chơi cơ bản 1 bộ" như Max 3D — Max 3D Pro chỉ có 2 cách chơi bao (mô tả ở
`how-to-play.md`), cả 2 đều sinh ra nhiều cặp có thứ tự.

Max 3D Pro **không có Jackpot tích luỹ** — toàn bộ giải thưởng cố định theo bảng cấu hình.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay, ngày quay trong tuần, giờ quay | `getGameConfig` section `play` |
| Hoa hồng đại lý mặc định hệ thống | `getGameConfig` section `rates` |

## Câu hỏi thường gặp của nhân viên

- "Max 3D Pro quay ngày nào?" → `getGameConfig` section `play` (khác Max
  3D — không trùng ngày quay).
- "Max 3D Pro có Jackpot không?" → Không, toàn bộ giải thưởng cố định.
- "Max 3D Pro và Max 3D khác gì nhau?" → Max 3D Pro luôn chơi theo **cặp có thứ tự**, không có
  chế độ "chọn 1 bộ ba" như Max 3D Cơ Bản; có thêm Giải Phụ Đặc Biệt.

## Lưu ý dễ sai

- Max 3D Pro **không có** tỷ lệ công ty thu riêng — giống Max 3D, Keno, Bingo 18. Toàn bộ phần
  còn lại sau giải thưởng + hoa hồng là lợi nhuận công ty.
- Ngày quay Max 3D Pro **khác** Max 3D — nhưng cả hai đều là **cấu hình**, luôn tra `getGameConfig`
  section `play` cho ĐÚNG game đang hỏi. KHÔNG nêu ngày cụ thể theo trí nhớ hay theo thể lệ
  Vietlott, cũng không suy ngày của game này từ game kia.
- Đây là game duy nhất có Giải Phụ Đặc Biệt — không nhầm với Max 3D (không có hạng này).
