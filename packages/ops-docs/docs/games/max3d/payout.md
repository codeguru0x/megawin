# Max 3D — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải PHẢI lấy bằng `getGameConfig` cho Max 3D
> trong chính lượt trả lời. Tài liệu này chỉ mô tả điều kiện trúng và luật gộp giải — phần dễ trả
> lời sai nhất của Max 3D vì khác hoàn toàn nguyên tắc "chỉ lĩnh hạng cao nhất" của các game số.

## Nguyên tắc chung: GỘP GIẢI, không lấy hạng cao nhất

Khác với Keno/Lotto 5/35/Mega 6/45/Power 6/55 (chỉ lĩnh đúng 1 hạng cao nhất mỗi line), **cả 2
chế độ của Max 3D đều gộp giải**: nếu 1 lựa chọn trùng nhiều hạng cùng lúc (vì 20 bộ kết quả quay
độc lập với nhau, 1 bộ ba có thể xuất hiện ở nhiều nhóm giải), người chơi **lĩnh tổng tất cả**
hạng đã trúng, không chỉ hạng cao nhất.

## Chế độ Cơ Bản — 4 hạng giải

| Hạng | Điều kiện trúng (khớp đúng thứ tự) |
| --- | --- |
| Giải Đặc Biệt | Trùng 1 trong 2 bộ kết quả nhóm Đặc Biệt |
| Giải Nhất | Trùng 1 trong 4 bộ kết quả nhóm Nhất |
| Giải Nhì | Trùng 1 trong 6 bộ kết quả nhóm Nhì |
| Giải Ba | Trùng 1 trong 8 bộ kết quả nhóm Ba |

**Straight**: xét đúng 1 bộ ba đã chọn với cả 4 nhóm kết quả — nếu bộ đó trùng ở cả 2 nhóm (VD
vừa nằm trong nhóm Đặc Biệt vừa nằm trong nhóm Nhất, do 2 nhóm quay độc lập), lĩnh **tổng cả 2
hạng**.

**Combo3/Combo6**: mỗi hoán vị sinh ra từ bộ ba đã chọn được xét **độc lập** như 1 lần Straight —
tổng tiền thắng = cộng tiền giải của tất cả hoán vị trúng ở tất cả hạng mà hoán vị đó khớp.

## Chế độ Plus — 7 hạng giải, có bipartite matching

Plus có 7 hạng, chia làm 2 nhóm kiểm tra **độc lập với nhau**:

### Nhóm "cặp" (cần cả 2 bộ ba đã chọn cùng trúng, mỗi bộ khớp 1 kết quả riêng biệt)

| Hạng | Điều kiện |
| --- | --- |
| Giải Đặc Biệt | Cả 2 bộ ba đã chọn khớp 2 bộ kết quả **riêng biệt** trong nhóm Đặc Biệt |
| Giải Nhất | Cả 2 bộ khớp 2 kết quả riêng biệt trong nhóm Nhất |
| Giải Nhì | Cả 2 bộ khớp 2 kết quả riêng biệt trong nhóm Nhì |
| Giải Ba | Cả 2 bộ khớp 2 kết quả riêng biệt trong nhóm Ba |
| Giải Tư | Cả 2 bộ khớp 2 kết quả riêng biệt **bất kỳ** trong toàn bộ 20 kết quả (không cần cùng nhóm) |

"Khớp 2 kết quả riêng biệt" nghĩa là 1 kết quả quay chỉ được dùng để khớp với **1 trong 2 bộ đã
chọn**, không thể dùng chung cho cả 2 (gọi là bipartite matching — mỗi kết quả chỉ "dùng" 1 lần).

### Nhóm "đơn" (xét từng bộ ba riêng lẻ, không cần cả 2 cùng khớp)

| Hạng | Điều kiện |
| --- | --- |
| Giải Năm | Có ít nhất 1 trong 2 bộ đã chọn khớp bất kỳ kết quả nào trong nhóm Đặc Biệt |
| Giải Sáu | Có ít nhất 1 trong 2 bộ đã chọn khớp bất kỳ kết quả nào trong nhóm Nhất, Nhì, hoặc Ba |

Giải Năm và Giải Sáu **không loại trừ nhau** — nếu 1 bộ ba vừa nằm trong nhóm Đặc Biệt vừa nằm
trong nhóm Nhất/Nhì/Ba (do các nhóm quay độc lập), người chơi lĩnh **cả 2 hạng**. Ngược lại, Giải
Sáu chỉ tính **1 lần** cho mỗi bộ ba dù bộ đó khớp nhiều nhóm trong Nhất/Nhì/Ba — vì điều kiện là
"Nhất, Nhì HOẶC Ba", không tách riêng theo từng nhóm con.

### Trường hợp đặc biệt: 2 bộ ba đã chọn giống nhau

Khi người chơi chọn 2 bộ ba **giống nhau tuyệt đối** (VD "096"+"096"), tiền giải từ **Giải Nhất
đến Giải Sáu được nhân đôi**; riêng **Giải Đặc Biệt không nhân đôi**. Bipartite matching vẫn chỉ
tính 1 bộ ba duy nhất khi kiểm tra nhóm "cặp" — 2 bộ giống nhau chỉ khớp được với 2 kết quả riêng
biệt nếu pool kết quả có ít nhất 2 giá trị phù hợp.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Bảng giải Cơ bản (Straight) | `getGameConfig` section `prizes` |
| Bảng giải Combo3 | `getGameConfig` section `prizes` |
| Bảng giải Combo6 | `getGameConfig` section `prizes` |
| Bảng giải Plus (7 hạng) | `getGameConfig` section `prizes` |

## Câu hỏi thường gặp của nhân viên

- "1 bộ ba trúng cả Đặc Biệt và Nhất thì lĩnh sao?" → Lĩnh tổng cả 2 giải (gộp giải) — không phải
  chỉ lấy giải cao hơn.
- "Chơi Plus 2 bộ giống nhau có được nhân đôi Giải Đặc Biệt không?" → Không, chỉ Giải Nhất đến
  Giải Sáu được nhân đôi, Giải Đặc Biệt giữ nguyên.
- "Giải Năm và Giải Sáu có loại trừ nhau không?" → Không, có thể lĩnh cả 2 nếu bộ ba khớp cả 2
  điều kiện.

## Lưu ý dễ sai

- Đừng áp dụng nguyên tắc "chỉ lĩnh hạng cao nhất" của Lotto 5/35/Mega 6/45/Power 6/55 vào Max
  3D — cả 2 chế độ của Max 3D đều **gộp giải**.
- Nhóm "cặp" của Plus (Đặc Biệt → Tư) dùng bipartite matching (mỗi kết quả chỉ khớp 1 lần); nhóm
  "đơn" (Năm, Sáu) xét độc lập từng bộ ba, không cần bipartite.
- Nhân đôi tiền giải khi 2 bộ Plus giống nhau **không áp dụng** cho Giải Đặc Biệt — chỉ áp dụng
  Nhất đến Sáu.
