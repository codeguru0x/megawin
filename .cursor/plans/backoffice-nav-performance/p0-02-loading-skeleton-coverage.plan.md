# p0-02 — Bổ sung `loading.tsx` cho các nhóm route chưa có

> **Phase:** P0 · **Status:** ⏳ pending · **Phụ thuộc:** không (độc lập hoàn toàn với `p0-01`) ·
> **Chặn:** không chặn plan nào, nhưng nên xong trước `p1-01` để đo hiệu ứng tổng hợp cùng lúc

## 1. Vì sao đây vẫn là P0 (không phải polish)

Theo bảng "Automatic prefetch" trong Next docs local
(`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`):

| Context | Prefetch tự động | Client Cache TTL |
|---|---|---|
| Route dynamic, **KHÔNG có** `loading.js` | **KHÔNG prefetch gì cả** | — |
| Route dynamic, **có** `loading.js` | Layout → tới loading boundary | `staleTimes.dynamic` (đã fix = 30s ở `p0-01`) |

**Không có `loading.tsx` = route đó không được Next tự prefetch bất cứ thứ gì, ngay cả với `<Link>`
default (`prefetch={null}`).** Đây không phải chi tiết vặt — nó là điều kiện BẮT BUỘC để mọi cải
thiện prefetch ở `p1-01`/`p1-02` có tác dụng. Thêm `loading.tsx` trước tiên, độc lập với việc sửa
`staleTimes`, vì đây là 2 điều kiện CẦN khác nhau cho cùng một mục tiêu (prefetch hoạt động).

Lợi ích phụ (không cần chờ `p0-01`): trên **lần điều hướng đầu tiên** tới 1 route (JS chunk client
component chưa tải), `loading.tsx` là Server Component nằm sẵn trong shell — hiện ra ngay trong khi
JS của trang (thường là `"use client"`, xem thống kê ở analytics doc §2.1: 61/84 route là client)
còn đang tải, thay vì màn hình trắng.

## 2. Kiểm kê — route đang THIẾU `loading.tsx` (đã grep xác nhận 10/09/2026)

Route ĐÃ có `loading.tsx`: `(main)/loading.tsx` (fallback gốc — KHÔNG tự động áp cho route con nếu
route con không kế thừa qua cùng thư mục cha kiểu Next segment), `ai/`, `accounts/players/`,
`accounts/company/`, `accounts/agents/`, `tenants/`.

**Route CHƯA có, chia theo mức ưu tiên traffic (staff dùng hàng ngày → hiếm dùng):**

| Tier | Route pattern | Số route | Ví dụ |
|---|---|---|---|
| **T1 — Vận hành hàng ngày** | `games/{7 game}/operations`, `games/{keno,bingo18}/operations-hub`, `dashboard` | 10 | `games/keno/operations`, `dashboard` |
| **T1 — Vận hành hàng ngày** | `games/{7 game}/draws` | 7 | `games/lotto535/draws` |
| **T2 — Báo cáo hay xem** | `reports/settle`, `reports/outstanding`, `games/{7 game}/reports/settle`, `games/{7 game}/reports/outstanding` | 16 | `games/mega645/reports/settle` |
| **T2 — Vận hành phụ** | `resultfeed`, `resultfeed/review`, `resultfeed/periods`, `resultfeed/sources`, `system/workers`, `audit-logs` | 6 | `resultfeed/review` |
| **T3 — Ít xem, ít đổi** | `games/{7 game}/reports/void`, `games/{3 game jackpot}/jackpot` | 10 | `games/power655/jackpot` |
| **T3 — Cấu hình, đổi hiếm** | `games/{7 game}/config/game`, `games/{7 game}/config/tenant` | 14 | `games/keno/config/tenant` |
| **T3 — Giao dịch đại lý** | `reports/transactions/dispatch`, `reports/transactions/api-logs` | 2 | — |
| **T3 — Khác** | `me/activity`, `accounts/players/[accountId]/**` (settle/outstanding con), `guides`, `guides/[...slug]` | ~6 | — |

Tổng ~65-70 route thiếu. **Không làm hết trong 1 PR** — chia theo tier, T1 làm trước (P0 thật), T2/T3
làm theo sau như cải thiện liên tục (không chặn phase nào khác).

## 3. Chiến lược — Skeleton chia sẻ, KHÔNG viết tay 65 file riêng

Nhiều page đã tự có skeleton nội bộ qua `<Suspense fallback={<XSkeleton/>}>` bọc quanh content client
(ví dụ `games/max3dpro/reports/outstanding/page.tsx` đã đọc ở bước khảo sát — có `OutstandingPageSkeleton`
ngay trong `page.tsx`). `loading.tsx` ở cấp route **khác mục đích**: nó là boundary Next tạo SẴN khi
prefetch, không phải Suspense do page tự viết. Hai thứ **không thay nhau được** — page vẫn giữ
Suspense nội bộ nguyên vẹn, `loading.tsx` là lớp NGOÀI, hiện trong khoảng chờ JS chunk tải/route
segment fetch.

**Bước 1 — Tạo skeleton primitive tái dùng** tại `apps/backoffice/src/components/skeletons/`
(thư mục mới, barrel `index.ts`):

```typescript
// apps/backoffice/src/components/skeletons/route-skeletons.tsx

/**
 * Skeleton dùng cho `loading.tsx` của các trang vận hành (operations, hub) — layout chuẩn:
 * header + KPI strip + 1 block bảng lớn. Khớp shape chung của 7 trang operations + 2 trang hub.
 */
export function OperationsRouteSkeleton() { /* ... */ }

/**
 * Skeleton cho trang báo cáo (settle/outstanding/void) — header + KPI cards (3-6 cột) + 1 bảng.
 */
export function ReportRouteSkeleton() { /* ... */ }

/**
 * Skeleton cho trang danh sách đơn giản (draws, config, danh mục) — header + 1 bảng/list.
 */
export function ListRouteSkeleton() { /* ... */ }
```

3 primitive là đủ cho toàn bộ 65 route — KHÔNG cần skeleton riêng cho từng game (7 game cùng layout
theo `financial-report-ui.mdc`/`operations-page-ui.mdc`).

**Bước 2 — File `loading.tsx` chỉ import + render** (2-4 dòng mỗi file):

```tsx
// apps/backoffice/src/app/(main)/games/keno/operations/loading.tsx
import { OperationsRouteSkeleton } from "@/components/skeletons/route-skeletons";

export default function Loading() {
  return <OperationsRouteSkeleton />;
}
```

Lặp lại đúng khuôn này cho từng route theo tier — không cần viết logic riêng, chỉ chọn đúng
primitive (`OperationsRouteSkeleton` / `ReportRouteSkeleton` / `ListRouteSkeleton`) theo bảng §2.

**Bước 3 — Route đã có skeleton nội bộ chi tiết hơn (vd `max3dpro/reports/outstanding`)**: có thể
tái dùng CHÍNH skeleton đó cho `loading.tsx` nếu đã match layout thật (giảm 1 primitive dùng chung
xuống còn tái dùng luôn cái đã viết) — ưu tiên tái dùng, không tự viết 2 bản cho cùng 1 trang.

## 4. Thứ tự thực thi (không cần PR riêng cho từng route — nhóm theo tier)

1. Tạo `components/skeletons/route-skeletons.tsx` (3 primitive) — review 1 lần.
2. T1 (17 route) — 1 PR/commit, review layout khớp thật (so ảnh chụp page thật với skeleton).
3. T2 (22 route) — 1 PR/commit.
4. T3 (~28 route) — có thể tách nhỏ hơn theo game nếu muốn review dễ hơn, không bắt buộc 1 PR.

## 5. Tác dụng & cách đo

| Đo gì | Cách đo | Kỳ vọng |
|---|---|---|
| Khoảng trắng khi vào route lần đầu | Throttle Network "Slow 3G" trong DevTools, click 1 link T1 chưa từng vào | Thấy skeleton ngay (< 100ms), không phải màn trắng |
| Prefetch có chạy không | Network tab, filter theo path route, hover link T1 | Thấy 1 request RSC ngay sau khi `loading.tsx` tồn tại (trước đó: 0 request vì "no loading.js") |
| Không phá Suspense nội bộ page đã có | So sánh UI trước/sau ở `max3dpro/reports/outstanding` | Skeleton nội bộ (`OutstandingPageSkeleton`) vẫn chạy như cũ khi data đang tải; `loading.tsx` chỉ thấy ở lần đầu route segment chưa sẵn |

## 6. Test/Review checklist

- [ ] `components/skeletons/route-skeletons.tsx` — 3 export, mỗi export có JSDoc, dùng `Skeleton`
      từ `@/components/ui/skeleton` (tái dùng component có sẵn, không tự vẽ div màu xám).
- [ ] Mỗi `loading.tsx` mới **đúng 1 import + 1 return** — không thêm logic, không thêm `"use client"`
      (Loading UI luôn là Server Component).
- [ ] Grep sau khi xong T1: `find apps/backoffice/src/app/\(main\)/games/*/operations -name loading.tsx`
      → phải ra đủ 7 (+ 2 hub).
- [ ] `pnpm --filter @megawin/backoffice check-types` + `pnpm lint` xanh.
- [ ] Test tay: throttle "Slow 3G", vào lần lượt 3 route T1 chưa cache, xác nhận skeleton hiện trước
      khi nội dung thật load — quay 1 đoạn screen record ngắn nếu cần minh chứng trong PR.
- [ ] **Không** sửa bất kỳ `page.tsx` nào trong bước này — `git diff --stat` chỉ có file `loading.tsx`
      mới + 1 file skeleton mới. Nếu cần sửa `page.tsx` (ví dụ bỏ Suspense nội bộ trùng lặp), tách
      sang PR riêng ngoài phạm vi plan này.

## 7. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Skeleton layout lệch với UI thật (dễ nhận ra, không nguy hiểm) | 🟢 | So ảnh chụp thật trước khi merge từng tier |
| Quên 1 route trong tier khi liệt kê | 🟢 | Script kiểm: `comm -23 <(list tất cả page.tsx dir) <(list tất cả loading.tsx dir)` trước khi đóng plan |
| Ai đó nhúng data-fetching vào `loading.tsx` (sai mục đích) | 🟡 | Review checklist §6 — Loading UI chỉ render tĩnh |

## 8. Rollback

Xoá các file `loading.tsx` mới thêm (hoặc `git revert` theo tier). Không đụng `page.tsx`, không
đụng route logic — rollback từng tier độc lập, không ảnh hưởng tier khác.
