# p2-01 — Chromatic scoped cho `packages/ui` (CÓ ĐIỀU KIỆN — cần quyết định user)

Ghi lại điều kiện + số liệu để chuyển từ Playwright tự host ([p1-01](p1-01-visual-regression-self-hosted.plan.md))
sang Chromatic **CHỈ cho `packages/ui`** — KHÔNG liên quan tới `apps/backoffice` (đã có phân tích
riêng, vẫn đứng ở `ui-visual-regression/p2-01`, không đổi).

## 1. Điều kiện mở khoá — ĐÃ ĐỦ sau khi `p0-01` xong (khác `apps/backoffice`)

`ui-visual-regression/p2-01` chặn Chromatic cho `apps/backoffice` vì **chưa có Storybook** (TurboSnap
chỉ hoạt động qua story). Sau khi [p0-01](p0-01-storybook-foundation.plan.md) hoàn thành,
`packages/ui` **CÓ Storybook** → điều kiện đó đã thoả. Đây là lý do phase này tồn tại tách riêng
khỏi `ui-visual-regression/p2-01` — không phải mâu thuẫn, mà là 2 package ở 2 trạng thái khác nhau.

## 2. Số liệu thật (pricing verify 09/2026, xem `00-overview.md` mục Research)

- Free tier: 5.000 billed snapshot/tháng ≈ 25.000 turbosnap.
- `packages/ui` hiện có rất ít component (2 component thật: `MoneyInput`, `Toaster` — số story sau
  [p0-01](p0-01-storybook-foundation.plan.md) ước tính dưới 10). Với quy mô này, **ngay cả chạy full
  capture (không TurboSnap) mỗi lần cũng chỉ tốn ~10 billed snapshot/lần** — free tier dư thừa nhiều
  lần so với `apps/backoffice` (86 trang, lý do chính khiến `apps/backoffice` không đáng dùng
  Chromatic qua Playwright thuần).
- Build không đổi UI = 0 billed snapshot (tính năng mới 08/2026, "bypassed build") — càng giảm rủi ro
  vượt quota khi package ít thay đổi.
- **Kết luận số liệu:** về mặt quota, `packages/ui` là ứng viên TỐT cho Chromatic — tốt hơn nhiều so
  với `apps/backoffice`. Đây KHÔNG phải khuyến nghị bắt buộc dùng — chỉ là "nếu muốn, quota không
  phải rào cản" — quyết định vendor lock-in/thêm SaaS dependency vẫn cần user tự chốt (mục 4).

## 3. Cách tích hợp nếu user chốt dùng

```bash
pnpm --filter @megawin/ui exec npx storybook add @chromatic-com/storybook
```

Thêm script:

```json
{
  "scripts": {
    "chromatic": "chromatic --project-token=<CHROMATIC_PROJECT_TOKEN>"
  }
}
```

Token lưu ở GitHub Actions secret **khi CI được quyết định lập** (repo chưa có `.github/workflows/`)
— **TUYỆT ĐỐI KHÔNG** ghi vào `.env*` cam kết local (`no-env-file-modification.mdc`). Nếu cần chạy
thử trước khi có CI, dùng biến môi trường shell tạm thời (`CHROMATIC_PROJECT_TOKEN=... pnpm chromatic`),
không persist vào file.

## 4. Không tự quyết — chỉ báo cáo điều kiện

Agent chỉ trình bày lại mục 1-3 khi được hỏi, KHÔNG tự chạy `pnpm add @chromatic-com/storybook`,
KHÔNG tự tạo tài khoản/project Chromatic. Đây là quyết định có phát sinh chi phí SaaS (nếu vượt free
tier) + vendor lock-in (baseline nằm trên cloud Chromatic thay vì Git), cần user xác nhận rõ ràng —
kể cả khi số liệu ở mục 2 thuận lợi hơn nhiều so với `apps/backoffice`.

## Không làm

- Không quyết định thay cho `ui-visual-regression/p2-01` (`apps/backoffice`) — đó là phân tích riêng,
  vẫn đứng nguyên trạng "cần Storybook cho backoffice trước", không đổi bởi việc `packages/ui` có
  Storybook.
- Không tạo tài khoản Chromatic hoặc chạy `npx chromatic`/`storybook add @chromatic-com/storybook`
  mà chưa có xác nhận rõ ràng từ user.
- Không tắt/thay thế [p1-01](p1-01-visual-regression-self-hosted.plan.md) — nếu Chromatic được chọn,
  đó là bổ sung (cross-browser, dashboard) hoặc thay thế hoàn toàn, quyết định đó cũng cần hỏi user
  (không tự xoá Playwright self-hosted đang chạy được).
