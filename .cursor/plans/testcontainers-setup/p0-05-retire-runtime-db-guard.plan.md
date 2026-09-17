# p0-05 — Retire runtime connection guard, cập nhật rule liên quan

## Câu hỏi gốc: "có bỏ được test connection guard không?"

2 lớp guard khác nhau, **phạm vi xử lý khác nhau** — KHÔNG gộp chung 1 quyết định:

| Lớp guard | File | Ai xử lý |
|---|---|---|
| Runtime connection guard | (đã xoá) trước đây trong `tooling/vitest-config` | **Plan này (Testcontainers)** — xoá (đã làm ở [p0-01](p0-01-vitest-config-testcontainers.plan.md) mục 7) |
| Static lint guard (GritQL) | `tooling/biome-plugins/no-unscoped-db-mutation.grit` | **Plan Biome → oxlint riêng** (xem [`.cursor/analysis/system-oxlint-migration.analysis.md`](../../analysis/system-oxlint-migration.analysis.md) mục R2). Plan Testcontainers **KHÔNG** thực thi xoá/sửa GritQL — chỉ ghi nhận ở đây để tránh nhầm lẫn khi đọc tài liệu. |

GritQL hiện vẫn đang SỐNG trong code (`biome.json`) và vẫn enforce bình thường. Khi plan
Biome→oxlint thực thi xong, GritQL sẽ biến mất khỏi các lớp phòng thủ trong
`test-data-safety.mdc` §5 — sửa mục đó là việc của plan kia.

## Vì sao xoá runtime connection guard

Guard cũ kiểm tra "`MONGODB_URI` có phải localhost/staging" — câu hỏi này trở thành
*unreachable* khi `MONGODB_URI` luôn do `global-setup-mongo` set tới container ephemeral
(xem [p0-01](p0-01-vitest-config-testcontainers.plan.md)). Không còn đường nào để URI Atlas
lọt vào process test nữa — guard chỉ còn dead code không bao giờ throw.

## Thay đổi

### 1. Xoá runtime connection guard trong `tooling/vitest-config`

Đã liệt kê / thực thi ở [p0-01](p0-01-vitest-config-testcontainers.plan.md) mục 7 — phase này
chỉ còn phần cập nhật tài liệu/rule liên quan tới PHẦN connection guard, không đụng phần GritQL.

### 2. Cập nhật [`.cursor/rules/test-data-safety.mdc`](../../../.cursor/rules/test-data-safety.mdc) — CHỈ phần connection guard

- Đổi khung lý do đầu file: "DB test dùng CHUNG với staging website" → "container Testcontainers
  ephemeral, riêng mỗi lần chạy `vitest run`, tự dọn sau khi xong (Ryuk reaper)". Pattern
  sentinel/scoped filter vẫn bắt buộc (chống race giữa file test song song cùng collection).
- Ở §5: bỏ bullet runtime connection guard (không còn tồn tại) — **KHÔNG đụng** bullet
  "Biome GritQL" (vẫn đúng nguyên trạng tại thời điểm này).
- Bỏ hướng dẫn dựa vào `.env.test.local` / flag mở khóa URI staging trong flow vitest.

### 3. Cập nhật [`00-overview.md`](00-overview.md)

- Đổi dòng bảng phase p0-05 → chỉ mô tả retire connection guard + cập nhật `test-data-safety.mdc`;
  ghi rõ GritQL KHÔNG thuộc phạm vi plan này.
- Ở mục "Ràng buộc bắt buộc" #2: giữ phần giải thích `.withReuse()` / namespace DB theo game;
  không giả định GritQL đã/sẽ bị xoá trong phase này.

## Verify

- `rg "setup-db-guard" --type ts` toàn repo sau khi hoàn tất p0-01..p0-04 → 0 kết quả.
- Đọc lại `test-data-safety.mdc` — xác nhận phần GritQL ở §5 còn nguyên; phần connection guard
  đã đổi sang mô tả Testcontainers.

## Không làm

- Không xoá, không sửa `tooling/biome-plugins/no-unscoped-db-mutation.grit` hay `biome.json`.
- Không tự viết plugin oxlint tương đương GritQL — thuộc plan Biome→oxlint.
