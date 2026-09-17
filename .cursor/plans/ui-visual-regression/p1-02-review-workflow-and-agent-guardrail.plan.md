# p1-02 — Review Workflow (diff) + Agent Guardrail

Định nghĩa quy trình xem/duyệt diff khi `test:e2e` fail, và rule chặn agent tự "sửa" baseline
để làm fail biến mất. Không phụ thuộc `p1-01` (độc lập, làm song song được) nhưng nên xong trước khi
baseline `p1-01` được ai đó review thật.

## 1. Xem diff — mặc định dùng report có sẵn của Playwright, KHÔNG cần cài thêm gì

`playwright.config.ts` ([p0-01](p0-01-playwright-foundation.plan.md)) đã cấu hình
`reporter: [["html", ...]]`. Khi `test:e2e` fail:

```bash
pnpm --filter @megawin/backoffice exec playwright show-report playwright-report
```

Mở HTML report có sẵn 3 ảnh side-by-side (expected/actual/diff) cho mỗi test fail — **đây là
baseline flow, luôn hoạt động, không có dependency ngoài**. Dùng flow này làm mặc định.

## 2. Tuỳ chọn — `diffscope` cho UI duyệt đẹp hơn

Đã research: [`bricebdht/diffscope`](https://github.com/bricebdht/diffscope) là web app tĩnh
(không backend, không npm package) đọc trực tiếp `playwright-report/index.html` bằng drag-and-drop,
cho duyệt side-by-side + phím tắt Approve/Needs Changes/Skip, lưu tiến trình review vào
`localStorage`. **Repo hiện rất nhỏ (1 star, mới)** — coi là thử nghiệm cá nhân, KHÔNG coi là
dependency chính thức của quy trình. Nếu muốn thử: clone về máy, mở local, kéo-thả folder
`playwright-report/` vào — không cần cài qua `pnpm`, không thêm vào `package.json`.

Nếu sau vài lần dùng thấy giá trị thật → cân nhắc lại (không quyết trong plan này, vì repo quá mới
để cam kết maintain lâu dài).

## 3. Rule guardrail cho agent — MỚI, thêm vào `.cursor/rules/`

Tạo `.cursor/rules/visual-regression-baseline.mdc` (`alwaysApply: false`, glob
`apps/backoffice/test/e2e/**`):

```markdown
---
description: Quy tắc khi Playwright visual regression fail — KHÔNG tự update baseline.
globs:
  - "apps/backoffice/test/e2e/**"
alwaysApply: false
---

# Visual Regression — KHÔNG Tự Update Baseline

Khi `pnpm --filter @megawin/backoffice test:e2e` fail vì screenshot lệch baseline:

1. **KHÔNG tự chạy `test:e2e:update`** để làm fail biến mất. Baseline là "bản đã được người
   duyệt", tự update = tự duyệt hộ — mất hết giá trị của lớp kiểm tra này (baseline sẽ chấp nhận
   luôn cả bug nếu đó là bug).
2. Mở report (`playwright show-report playwright-report`), xác định: đây là **regression thật**
   (code sửa gây lệch UI ngoài ý muốn) hay **thay đổi có chủ đích** (task đang làm chính là đổi UI
   đó)?
3. Nếu có chủ đích: báo cho user diff cụ thể (link ảnh actual/expected), đề xuất chạy
   `test:e2e:update`, **để user tự chạy hoặc xác nhận rõ ràng** trước khi agent chạy hộ.
4. Nếu KHÔNG chắc (không phải task đang làm, hoặc không hiểu vì sao lệch) → dừng, báo cho user,
   KHÔNG đoán rồi update.
```

Đây là mirror đúng pattern đã có với `test-data-safety.mdc` (agent không tự xoá dữ liệu không
scope) — áp dụng cùng nguyên tắc cho baseline (agent không tự "duyệt" thay người).

## 4. Ghi vào `00-overview.md` của plan này sau khi hoàn thành

Không tạo file mới — chỉ cập nhật bảng trạng thái `00-overview.md`.

## Verify

- Cố tình sửa 1 style trong Ops Hub (VD đổi padding), chạy `test:e2e` → fail đúng, mở report
  thấy diff rõ ràng.
- Revert lại, chạy lại → pass.
- Đọc lại rule mới viết, xác nhận glob chỉ áp dụng `apps/backoffice/test/e2e/**` — không áp dụng
  nhầm sang `test/unit/` (Vitest, khác mục đích).

## Không làm

- Không cài `diffscope` như dependency chính thức (mục 2 — chỉ ghi nhận, không cam kết).
- Không tạo bot GitHub tự comment PR — cần CI trước (ngoài scope, xem `00-overview.md`).
