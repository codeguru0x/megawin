# `.cursor/plans` — Quy ước tổ chức Plans

Thư mục chứa **plan thực thi** (How / When). Phân tách với `.cursor/analysis` (Why / What) — xem `.cursor/analysis/README.md`. Quy ước thư mục hoá chốt ngày 28/07/2026 để chặn tình trạng >70 file flat khó kiểm soát.

## 1. Luật quyết định: flat file hay thư mục?

| Điều kiện | Cách tổ chức |
|---|---|
| Feature sinh **≥2 plan** HOẶC trải **nhiều giai đoạn** (P0/P1/P2) HOẶC có analysis doc nguồn | **BẮT BUỘC thư mục riêng** `plans/<feature-slug>/` |
| Plan đơn lẻ, nhỏ, một lần (fix index, migration lẻ, đổi 1 config) | Flat file `<topic>.plan.md` được phép |

Khi phân vân → chọn thư mục. Chi phí tạo thư mục ≈ 0; chi phí dọn 10 file flat rải rác về sau rất đắt. Tiền lệ đúng chuẩn: `plans/lottery/` (00-master + 12 plan đánh số).

## 2. Cấu trúc thư mục feature

```
plans/<feature-slug>/
├── 00-overview.md                  # BẮT BUỘC — master file, xem §3
├── p0-01-<topic>.plan.md           # giai đoạn P0, thứ tự thực thi 01
├── p0-02-<topic>.plan.md
├── p1-01-<topic>.plan.md           # giai đoạn P1
└── p2-01-<topic>.plan.md
```

- `<feature-slug>`: kebab-case, khớp tên analysis doc nguồn nếu có (ví dụ analysis `keno-operations-risk-control.analysis.md` → thư mục `keno-ops-risk-control/`).
- Prefix file: `<phase>-<NN>-` — `phase` = `p0`/`p1`/`p2` (hoặc bỏ qua nếu feature không chia phase, chỉ dùng `NN-` như `lottery/`). `NN` = thứ tự thực thi trong phase, zero-padded 2 chữ số.
- Suffix `.plan.md` bắt buộc — phân biệt với `.analysis.md` khi search.
- KHÔNG lồng thư mục quá 1 cấp (`plans/a/b/c/` cấm) — đủ phẳng để glob, đủ nhóm để quản.

## 3. `00-overview.md` — nội dung bắt buộc

1. **Nguồn**: link analysis doc (`> Nguồn: .cursor/analysis/<file>`), ngày chốt scope.
2. **Bảng trạng thái** — source of truth tiến độ, cập nhật mỗi khi 1 plan đổi trạng thái:

```markdown
| Plan | Phase | Status | Ghi chú |
|---|---|---|---|
| p0-01-entry-indexes-fix | P0 | ✅ done | merged 30/07 |
| p0-02-draw-betting-stats | P0 | 🔨 in-progress | |
| p1-01-combo-transparency | P1 | ⏳ pending | chờ P0 xong |
```

3. **Thứ tự phụ thuộc** giữa các plan (plan nào chặn plan nào).

## 4. Quy tắc cho agent

- **Trước khi tạo plan mới**: kiểm tra feature đã có thư mục chưa; có → thêm file vào đúng thư mục với số thứ tự tiếp theo, cập nhật bảng trạng thái trong `00-overview.md`. KHÔNG tạo file flat trùng chủ đề với thư mục đã có.
- **Plan phái sinh từ analysis**: dòng đầu plan ghi `> Nguồn: .cursor/analysis/<file>`; cập nhật mục "Plans phái sinh" trong analysis doc trỏ về thư mục.
- **Plan xong KHÔNG xoá, KHÔNG di chuyển** — chỉ đổi status trong bảng overview (giữ link ổn định cho analysis doc và plan khác tham chiếu).
- **File flat hiện hữu (trước 28/07/2026)**: giữ nguyên, không migrate hàng loạt. Chỉ khi mở rộng một feature cũ thành nhiều plan mới → tạo thư mục và kéo file liên quan vào cùng lúc.
- Đặt tên plan theo **việc phải làm** (`p0-02-draw-betting-stats`), không theo ngày hoặc tên người.
