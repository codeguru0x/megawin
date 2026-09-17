# p2-01 — Chromatic Evaluation (CÓ ĐIỀU KIỆN — cần quyết định team)

Ghi lại điều kiện cụ thể để chuyển từ Playwright thuần ([p0-01](p0-01-playwright-foundation.plan.md)/
[p1-01](p1-01-ops-hub-coverage.plan.md)) sang Chromatic — **KHÔNG thực thi phase này trước khi điều
kiện ở mục 1 được xác nhận đúng.** Đây là câu trả lời trực tiếp cho câu hỏi "free tier 5.000 billed
snapshot có dùng được không, có hơn `toHaveScreenshot()` không" — xem số liệu đầy đủ trong canvas
`ui-qa-architecture-for-agents` (mục "Chromatic free tier — dùng được không?").

## 1. Điều kiện BẮT BUỘC trước khi bắt đầu phase này

**Storybook phải được quyết định cài cho `packages/ui` trước.** Lý do: ưu điểm định lượng lớn nhất
của Chromatic là TurboSnap (quota thực tế ~25.000 nhờ chỉ chụp lại story bị ảnh hưởng bởi file đổi) —
**chỉ hoạt động qua Storybook stories**, KHÔNG áp dụng khi chạy Chromatic qua
`@chromatic-com/playwright` (tính đúng 1:1 mỗi screenshot assertion, không giảm). `apps/backoffice`
hiện có **0 file `*.stories.tsx`**. Nếu chạy Chromatic qua Playwright thuần mà không có TurboSnap:

- 86 page × 1 browser (free tier chỉ Chrome) = 86 snapshot/lần chạy đầy đủ.
- Nhịp PR thực tế (nhiều lần push/PR) rất dễ vượt 5.000/tháng nếu test nhiều hơn vài chục trang.

→ Không đợi Storybook = Chromatic không có lợi thế thật so với Playwright thuần, chỉ thêm vendor
lock-in (baseline nằm trên cloud của họ) + giới hạn browser (free tier = Chrome only) mà không đổi
lại được gì tương xứng.

## 2. Nếu điều kiện ở mục 1 đã đúng (Storybook đã có) — cách tích hợp

```bash
pnpm --filter @megawin/backoffice add -D @chromatic-com/playwright chromatic
```

`playwright.config.ts` thêm reporter Chromatic-compatible, hoặc chạy song song:

```bash
npx chromatic --playwright --project-token=<CHROMATIC_PROJECT_TOKEN>
```

Token lưu ở **GitHub Actions secret** (khi CI được quyết định lập — xem `00-overview.md` mục
"Không làm"), **TUYỆT ĐỐI KHÔNG** ghi vào `.env*` cam kết local (vi phạm
[`no-env-file-modification.mdc`](../../rules/no-env-file-modification.mdc) nếu agent tự tạo file đó).

## 3. Theo dõi usage — tránh vượt quota âm thầm

Chromatic có dashboard usage theo tháng. Nếu đi theo hướng này, thêm việc **kiểm tra usage dashboard
hàng tháng** vào quy trình vận hành (không có cơ chế tự động cảnh báo trong free tier theo thông tin
hiện có — cần tự xác nhận trực tiếp với Chromatic support trước khi cam kết, trang pricing không nêu
rõ hành vi khi vượt quota).

## 4. Không tự quyết — chỉ báo cáo điều kiện

Khi phase này được nhắc tới, agent chỉ trình bày lại mục 1 (điều kiện) và số liệu ở canvas, KHÔNG tự
chạy `pnpm add @chromatic-com/playwright` hay tạo tài khoản Chromatic thay user — đây là quyết định
có phát sinh chi phí SaaS + vendor lock-in, cần user xác nhận rõ ràng.

## Không làm

- Không cài Storybook trong plan này (đó là quyết định riêng, ngoài scope UI visual regression).
- Không tạo tài khoản Chromatic hoặc chạy `npx chromatic` mà chưa có token thật từ user.
