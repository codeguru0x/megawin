# P0-07 — Gỡ Bỏ Biome (GATED: chỉ chạy khi user xác nhận "OK")

> Nguồn: yêu cầu tường minh của user: "Sau khi hoàn thiện OK sẽ tiến hành gỡ bỏ Biome". Phase này
> **KHÔNG được tự động chạy** ngay sau `p0-06` — phải dừng lại, báo cáo kết quả soak-test, và chờ
> user xác nhận rõ ràng trước khi thực thi bất kỳ lệnh nào trong phase này.

## Điều kiện để được phép chạy phase này

Tất cả các điều kiện sau PHẢI đã pass, và user đã xác nhận bằng lời:

1. `p0-01` đến `p0-06` đã hoàn tất, mọi checklist "Verify hoàn tất" ở từng phase đã tick.
2. Đã soak-test Oxlint + Prettier chạy **song song** với Biome qua ít nhất 1 khoảng thời gian đủ để
   phát hiện vấn đề (khuyến nghị: qua vài lần commit thật, không chỉ 1 lần chạy thử) — không có quy
   tắc cứng số ngày, để user tự quyết dựa trên độ tin tưởng thực tế.
3. `pnpm ci` (Oxlint + Prettier) xanh, VÀ `pnpm lint`/`pnpm format:check` phiên bản Biome cũ (nếu
   còn giữ lệnh gọi trực tiếp `biome check .`/`biome format .`) cũng xanh — xác nhận 2 bộ công cụ
   không mâu thuẫn kết luận trong toàn bộ giai đoạn song song.
4. IDE integration (`p0-05`) đã test tay thành công trên máy dev, không còn lỗi binary/config.
5. **User đã gõ xác nhận rõ ràng** (VD "OK, gỡ Biome đi") trong hội thoại — không suy đoán từ im
   lặng hoặc từ việc các phase trước đã xong.

## Việc cần làm (chỉ sau khi điều kiện trên thoả)

### 1. Xoá file cấu hình Biome

```bash
rm biome.json
```

### 2. Xoá GritQL — thuộc trách nhiệm CHÍNH plan này (đã xác nhận với user 17/09/2026)

`testcontainers-setup/p0-05-retire-runtime-db-guard.plan.md` chỉ xoá **runtime db-guard**
(`setup-db-guard.ts`) — plan đó ghi rõ tường minh "KHÔNG thực thi xoá/sửa GritQL" và trỏ trách
nhiệm về plan Biome→oxlint. `.cursor/rules/test-data-safety.mdc` §5 hiện đang "Hai lớp phòng thủ"
(Cursor rule tĩnh + Biome GritQL) — sau bước này chỉ còn **1 lớp phòng thủ máy** (Cursor rule),
GritQL không có JS plugin Oxlint thay thế (quyết định đã chốt, không rewrite).

```bash
rm -rf tooling/biome-plugins/
```

(File `no-unscoped-db-mutation.grit` biến mất cùng thư mục — không còn dùng ở đâu khác ngoài
`biome.json`, đã xác nhận bằng `rg` trước đó trong quá trình phân tích.)

### 3. Cập nhật `.cursor/rules/test-data-safety.mdc` §5 — GritQL đã xoá thật

Sau khi xoá `tooling/biome-plugins/` ở bước 2, `test-data-safety.mdc` §5 ("Hai lớp phòng thủ") nói
sai thực tế — sửa lại:

```diff
-## 5. Hai lớp phòng thủ (hiểu để không phá nhầm)
+## 5. Một lớp phòng thủ (Cursor rule tĩnh) — không còn GritQL

 Quy tắc này (Cursor rule) là **lớp tĩnh** — ngăn code sai từ lúc viết. Ngoài ra hệ thống có:

-- **Biome GritQL** (`tooling/biome-plugins/no-unscoped-db-mutation.grit`, kế hoạch
-  `.cursor/plans/biome-monorepo-migration/p2-01-test-data-safety-guard.plan.md`):
-  chặn ở CI/lint các anti-pattern ở §2. Sẽ được xử lý lại khi migrate Biome → oxlint
-  (xem `.cursor/analysis/system-oxlint-migration.analysis.md`) — KHÔNG thuộc plan Testcontainers.
+- **Biome GritQL đã bị xoá** (migration Oxlint, `.cursor/plans/oxlint-migration/p0-07-retire-biome.plan.md`)
+  — không có JS plugin Oxlint thay thế. Từ giờ CHỈ còn lớp Cursor rule tĩnh này ngăn anti-pattern ở
+  §2 — không có enforcement tự động ở lint/CI. Review PR test integration phải tự kiểm tra kỹ hơn.

-KHÔNG dựa vào lớp GritQL để bỏ qua quy tắc này. Viết test đúng ngay từ đầu.
+Không còn lớp máy nào backstop — viết test đúng ngay từ đầu, review PR kỹ khi có `delete*`/
+`update*` trong file test.
```

### 4. Cập nhật `00-overview.md` của `testcontainers-setup` (nếu còn nhắc GritQL "chưa xử lý")

Kiểm tra `rg -n "GritQL" .cursor/plans/testcontainers-setup/` — nếu còn dòng nào nói "sẽ xử lý ở
plan Biome→oxlint" dưới dạng còn mở, không cần sửa (đã đúng, plan kia không thuộc phạm vi sửa của
plan này) — chỉ cần xác nhận không có mô tả sai lệch mới.

### 5. Xoá dependency

```bash
pnpm remove -w @biomejs/biome
```

### 6. Dọn `.vscode/settings.json` — xoá hẳn phần Biome song song đã giữ ở `p0-05`

Nếu `p0-05` đã giữ lại setting Biome dự phòng (theo khuyến nghị "giữ song song 2 bộ config" ở
`p0-05` §5) → xoá hẳn phần đó bây giờ.

### 7. Grep xác nhận không còn tham chiếu Biome nào sót lại

```bash
rg -i "biome" -g '!node_modules' -g '!pnpm-lock.yaml' -g '!.cursor/plans/**' -g '!.cursor/analysis/**'
```

Kết quả còn lại (nếu có) phải là tham chiếu lịch sử hợp lệ (VD comment giải thích "trước đây dùng
Biome" trong changelog) — không phải config/script còn sống.

### 8. Cập nhật `pnpm-lock.yaml`

```bash
pnpm install
```

### 9. Chạy lại toàn bộ verify cuối

```bash
pnpm check-types
pnpm ci
pnpm build   # spot-check ít nhất build không vỡ do thiếu Biome ở đâu bất ngờ (VD script build gọi biome)
```

## Verify hoàn tất

- [ ] User đã xác nhận "OK" bằng lời trước khi bắt đầu phase này (ghi lại trong PR description nếu
      có).
- [ ] `biome.json` đã xoá.
- [ ] `tooling/biome-plugins/no-unscoped-db-mutation.grit` đã xoá — GritQL không còn tồn tại ở đâu
      trong repo.
- [ ] `.cursor/rules/test-data-safety.mdc` §5 đã sửa thành "Một lớp phòng thủ" (bước 3), không còn
      nhắc GritQL như lớp đang hoạt động.
- [ ] `@biomejs/biome` đã xoá khỏi `devDependencies` + `pnpm-lock.yaml`.
- [ ] `.vscode/settings.json` không còn setting Biome dự phòng.
- [ ] `rg -i "biome"` toàn repo (trừ plan/analysis lịch sử) → 0 kết quả sống.
- [ ] `rg -i "gritql|no-unscoped-db-mutation"` toàn repo (trừ plan/analysis lịch sử) → 0 kết quả
      sống.
- [ ] `pnpm check-types` + `pnpm ci` + `pnpm build` (spot-check) đều xanh sau khi xoá.
