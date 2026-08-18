# Max 3D Pro — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải PHẢI lấy bằng `getGameConfig` cho Max 3D Pro
> trong chính lượt trả lời. Tài liệu này chỉ mô tả điều kiện trúng và luật gộp giải.

## Nguyên tắc chung: GỘP GIẢI

Giống Max 3D, Max 3D Pro **gộp giải** — nếu 1 cặp đã chọn trùng nhiều hạng cùng lúc, người chơi
lĩnh tổng tất cả hạng đã trúng, không chỉ hạng cao nhất.

## 8 hạng giải, chia 3 nhóm kiểm tra độc lập

### Nhóm Đặc Biệt — CÓ thứ tự (điểm riêng của Max 3D Pro)

| Hạng | Điều kiện |
| --- | --- |
| Giải Đặc Biệt | Bộ "đầu" của cặp khớp bộ kết quả Đặc Biệt quay **đầu tiên**, và bộ "sau" khớp bộ kết quả Đặc Biệt quay **thứ hai** — đúng thứ tự quay |
| Giải Phụ Đặc Biệt | Bộ "đầu" khớp bộ kết quả Đặc Biệt quay thứ hai, bộ "sau" khớp bộ quay đầu tiên — **ngược** thứ tự quay |

Đây là khác biệt cốt lõi so với Max 3D+ (Max 3D): Max 3D+ chỉ cần cả 2 bộ khớp 2 kết quả Đặc
Biệt riêng biệt (không quan tâm thứ tự) để trúng 1 hạng Đặc Biệt duy nhất; Max 3D Pro **phân biệt
thứ tự** thành 2 hạng riêng với 2 mức tiền khác nhau (Đặc Biệt trả cao hơn nhiều so với Phụ Đặc
Biệt).

### Nhóm "cặp" — bipartite matching (mỗi kết quả chỉ khớp 1 lần)

| Hạng | Điều kiện |
| --- | --- |
| Giải Nhất | Cả 2 bộ trong cặp khớp 2 kết quả riêng biệt trong nhóm Nhất |
| Giải Nhì | Cả 2 bộ khớp 2 kết quả riêng biệt trong nhóm Nhì |
| Giải Ba | Cả 2 bộ khớp 2 kết quả riêng biệt trong nhóm Ba |
| Giải Tư | Cả 2 bộ khớp 2 kết quả riêng biệt bất kỳ trong toàn bộ 20 kết quả |

### Nhóm "đơn" — xét từng bộ riêng lẻ

| Hạng | Điều kiện |
| --- | --- |
| Giải Năm | Có ít nhất 1 trong 2 bộ của cặp khớp bất kỳ kết quả trong nhóm Đặc Biệt |
| Giải Sáu | Có ít nhất 1 trong 2 bộ của cặp khớp bất kỳ kết quả trong nhóm Nhất, Nhì, hoặc Ba |

Giải Năm và Sáu không loại trừ nhau, giống Max 3D.

## Trường hợp 2 bộ trong cặp giống nhau tuyệt đối

Khi bộ "đầu" và bộ "sau" của 1 cặp giống nhau hoàn toàn:

- **Giải Nhất đến Giải Sáu**: tiền giải **nhân đôi**.
- **Giải Đặc Biệt / Giải Phụ Đặc Biệt**: **không nhân đôi theo kiểu ×2** — thay vào đó, nếu cặp
  trùng cả 2 điều kiện (đúng thứ tự và ngược thứ tự đều đúng, điều này chỉ xảy ra khi 2 bộ kết
  quả Đặc Biệt của kỳ đó cũng giống nhau), tiền giải = **tổng của Giải Đặc Biệt cộng Giải Phụ Đặc
  Biệt**, không phải nhân đôi 1 trong 2 mức.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Bảng 8 hạng giải (special, specialSub, first-sixth) | `getGameConfig` section `prizes` |

## Câu hỏi thường gặp của nhân viên

- "Cặp trúng đúng thứ tự Đặc Biệt được bao nhiêu?" → `getGameConfig` section `prizes`, nhóm giải
  chuẩn (standard), hạng Đặc Biệt.
- "2 bộ trong cặp giống nhau, trúng Giải Nhất thì được nhân đôi không?" → Có, nhân đôi. Nhưng nếu
  trúng Giải Đặc Biệt thì tính khác (xem mục trên), không đơn giản là ×2.
- "Giải Phụ Đặc Biệt khác Giải Đặc Biệt ở đâu?" → Chỉ khác thứ tự khớp 2 bộ kết quả Đặc Biệt —
  đúng thứ tự là Đặc Biệt, ngược thứ tự là Phụ Đặc Biệt, mức tiền 2 hạng khác nhau đáng kể.

## Lưu ý dễ sai

- Đừng nhầm cơ chế nhân đôi của Max 3D Pro với Max 3D+ — cả 2 đều có ngoại lệ ở hạng Đặc Biệt
  (không nhân đôi kiểu ×2 đơn giản) nhưng **công thức xử lý khác nhau**: Max 3D+ giữ nguyên giá
  trị Đặc Biệt, Max 3D Pro cộng Đặc Biệt với Phụ Đặc Biệt.
- Giải Đặc Biệt và Giải Phụ Đặc Biệt là **2 hạng độc lập dựa vào thứ tự** — không phải 1 hạng có
  2 mức tiền.
- Không áp dụng nguyên tắc "chỉ lĩnh hạng cao nhất" — Max 3D Pro gộp giải giống Max 3D+.
