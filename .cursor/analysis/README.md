# `.cursor/analysis` — Phân tích chức năng (Feature Analysis)

Thư mục chứa **tài liệu phân tích** trước khi lên plan. Phân tách rõ với `.cursor/plans`:

| | `.cursor/analysis` | `.cursor/plans` |
|---|---|---|
| Trả lời | **Why / What** — bối cảnh, rủi ro, phương án, quyết định thiết kế | **How / When** — bước thực thi, checklist, file cần sửa |
| Vòng đời | Dài hạn — là domain knowledge, agent đọc lại nhiều lần | Ngắn hạn — xong plan là archive |
| Quan hệ | 1 analysis → N plans phái sinh | Mỗi plan link về analysis nguồn ở đầu file |

## Quy ước đặt tên

```
<domain>-<topic>.analysis.md        # ví dụ: keno-operations-risk-control.analysis.md
```

- `<domain>`: gameKey (`keno`, `bingo18`…) hoặc domain chung (`system`, `operator`, `dashboard`).
- Suffix `.analysis.md` bắt buộc — phân biệt với `.plan.md` khi search.

## Cấu trúc bắt buộc trong mỗi analysis doc

1. **Metadata header** — status (`discussing` | `approved` | `superseded`), ngày, nguồn tham chiếu.
2. **Bối cảnh & mục tiêu** — vấn đề vận hành/kinh doanh cần giải.
3. **Hiện trạng** — code/data thực tế đã đọc (kèm đường dẫn file), KHÔNG phỏng đoán.
4. **Phân tích** — rủi ro, phương án so sánh, trade-off.
5. **Đề xuất đã re-review** — kèm verdict (keep / cut / merge / demote) và lý do.
6. **Câu hỏi mở** — điểm chưa chốt, cần user quyết.
7. **Plans phái sinh** — danh sách plan sẽ tạo trong `.cursor/plans/` khi approved.

## Quy tắc cho agent

- Trước khi viết plan cho một chức năng lớn: tìm analysis doc liên quan trong thư mục này và đọc trước.
- Khi plan được tạo từ analysis: thêm dòng `> Nguồn: .cursor/analysis/<file>` đầu plan, và cập nhật mục "Plans phái sinh" trong analysis doc.
- 1 analysis sinh ≥2 plan → plans phải nằm trong thư mục riêng `plans/<feature-slug>/` theo quy ước `.cursor/plans/README.md`.
- Khi thảo luận thay đổi kết luận: cập nhật analysis doc, không tạo doc mới trùng chủ đề.
- Analysis doc là source of truth cho quyết định thiết kế — canvas/chat chỉ là snapshot trình bày.
