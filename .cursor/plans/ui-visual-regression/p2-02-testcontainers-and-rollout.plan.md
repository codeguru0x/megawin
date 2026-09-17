# p2-02 — Testcontainers Seed + Rollout Game Còn Lại (PHỤ THUỘC plan ngoài, CHƯA CÓ TIMELINE)

Hai việc độc lập nhưng gộp cùng phase vì cả hai đều là "mở rộng sau khi `p1-01` ổn định", không
phải nền tảng bắt buộc.

## 1. Chuyển seed data sang Testcontainers (thay `page.route()` mock)

**Điều kiện:** `.cursor/plans/testcontainers-setup/00-overview.md` phải hoàn thành **và** được mở
rộng sang `apps/backoffice` — verify 17/09/2026: phần "hoàn thành" **ĐÃ ĐÚNG** (13 package Mongo +
`cache` đã migrate sang `integrationConfig` + `@megawin/vitest-config/global-setup-mongo`/
`global-setup-redis`, `tooling/vitest-config/src/testcontainers/*` tồn tại thật trên đĩa — không còn
là plan trên giấy). Phần CHƯA đủ vẫn là **"mở rộng sang `apps/backoffice`"** — plan đó target đúng
14 package Vitest (`game-*-application`, `resultfeed-application`, `identity-application`,
`tenant-gateway`, `tenant-dispatch`, `audit`, `cache`), KHÔNG bao gồm app Next.js nào. Vậy điều kiện
đã unblock được 1 nửa; nửa còn lại (seed script riêng cho `apps/backoffice`, chưa viết) vẫn là gap
thật cần lấp nếu muốn dùng.

**Vì sao đáng làm (khi điều kiện đủ):** mock ở `page.route()` (p0-01) chặn ở tầng HTTP — nếu route
handler thật (`apps/backoffice/src/app/api/keno/operations/hub-snapshot/route.ts`) có bug parse/map
response, Playwright test vẫn pass (vì chặn trước khi route handler chạy). Seed qua Testcontainers
Mongo (data thật, container riêng, không chạm Atlas staging) cho Playwright test đi qua **toàn bộ
pipeline thật** (route → use-case → repo → Mongo) — bắt được lớp bug rộng hơn.

**Cách làm khi điều kiện đủ:** Next.js dev server (`webServer` trong `playwright.config.ts`) đọc
`MONGODB_URI` từ container do `global-setup-mongo.ts` (nguồn: `testcontainers-setup/p0-01`) khởi
tạo, thay vì mock JSON tĩnh. Cần thêm seed script riêng cho `apps/backoffice` visual test (seed 1
kỳ quay Keno cố định, tương đương fixture JSON hiện tại nhưng ghi thật vào Mongo container) —
**chưa viết trong plan này**, chỉ ghi nhận hướng đi.

## 2. Rollout 5 game còn lại (Lotto535, Mega645, Power655, Max3d, Max3dpro)

**Điều kiện:** `p1-01` (Keno + Bingo18) đã chạy ổn định ≥ vài tuần, không phát sinh flaky test do
nguyên nhân môi trường (font rendering, timing). Rollout thêm 5 game theo cùng pattern
(mock helper + fixture + spec file), KHÔNG cần thiết kế lại — copy cấu trúc `p1-01` cho từng game,
đọc đúng route/hook riêng của game đó trước khi viết (không giả định giống 100% Keno).

**Ưu tiên game nào trước:** game có review UI gần nhất / nhiều bug UI được tìm thấy nhất trong
review thủ công — đo bằng số finding trong các file `*ui-review*.md` khác nếu có, KHÔNG rollout
theo thứ tự ngẫu nhiên.

## Không làm

- Không tự bắt đầu mục 1 hoặc mục 2 khi điều kiện chưa đủ — đây là "chờ tín hiệu", không lên kế
  hoạch thời gian cụ thể (khác các phase khác trong plan này, tất cả đều có thể bắt đầu ngay).
- Không mở rộng viết seed script cho `testcontainers-setup` trong plan này — đó thuộc phạm vi plan
  đó (nếu được mở rộng scope), không phải plan này.
