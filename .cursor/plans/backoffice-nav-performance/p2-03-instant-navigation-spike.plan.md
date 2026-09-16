# p2-03 — Cổng quyết định: có mở `p3-01` (Cache Components hot routes) hay không

> **Phase:** P2 (cổng quyết định) · **Status:** ✅ done — **HOÃN `p3-01`** · **Phụ thuộc:**
> [`p2-01`](./p2-01-cache-components-guides-pilot.plan.md) + [`p2-01b`](./p2-01b-partial-prefetching-rollout.plan.md)
> đã chạy · **Không chặn** `p2-02`
> **Docs xác nhận:** `next@16.3.5` (`instant.md`, `instant-navigation.md`, `partialPrefetching.md`,
> `use-cache-private.md`) — đọc trực tiếp từ `node_modules`, không Context7 cũ
> **Output của plan này:** quyết định ghi rõ + bằng chứng — **không** bắt buộc phải ship Instant
> Navigation mới coi là xong

## 0. Đổi vai trò so với bản đầu (10–11/09)

| Bản cũ | Bản v2 (15/09) |
|---|---|
| Spike `instant` rồi **dừng** nếu risk cao (nhánh chết) | **Cổng quyết định** CÓ/KHÔNG mở [`p3-01`](./p3-01-cache-components-hot-routes.plan.md) |
| Nhắc `partialPrefetching` 1 dòng rồi bỏ | Đã tách thành plan riêng `p2-01b` |
| Hiểu nhầm "cookies() = loại khỏi App Shell" | Sửa: shell có thể gồm session; `MainLayout` mù vì thiếu 3-lever + auth `redirect()` ngoài Suspense |

Nội dung bằng chứng API (`instant` export, `validationLevel`, auto-validate) **giữ nguyên giá trị** —
xem §1–2 dưới đây (tham khảo). Lộ trình implement nằm ở `p3-01`.

## 1. Bằng chứng API đã xác nhận (`next@16.3.5`)

| Sai ở bản Context7 cũ | Đúng theo docs trong `node_modules` |
|---|---|
| `unstable_instant` | **`instant`** — bỏ tiền tố `unstable_` |
| `{ prefetch: "static" }` | `true \| false \| { level: 'warning' }` — không có field `prefetch` |
| "Validate fail build" | Mức `'warning'` (mặc định) chỉ cảnh báo **dev overlay**, **không** chặn `next build` |
| Phải khai báo `instant` mới validate | Mặc định (`validationLevel: 'warning'`): Cache Components validate **mọi** Page/Default |

Tắt auto-validate toàn app (nếu nhiễu khi pilot):

```ts
experimental: {
  instantInsights: { validationLevel: "manual-warning" },
},
```

## 2. Rào cản MainLayout — vẫn đúng, lý do chính xác hơn

`apps/backoffice/src/app/(main)/layout.tsx`:

```ts
const session = await requireOperatorSession(); // redirect() — side-effect, ngoài Suspense
const cookieStore = await cookies();
// + getPreference / getValueFromCookie (chỉ cookies().get — không I/O DB)
```

- **Không** refactor auth-gate trong cổng này / trong `p3-01` mặc định — cần sign-off riêng.
- Preference cookie reads: ROI thấp nếu chỉ đẩy vào Suspense — **không** ưu tiên.
- ROI lớn còn lại: 3-lever trên **page** hot routes (dashboard/operations/hub), không nhất thiết
  phải "Instant toàn layout" ngay.

## 3. Việc phải làm — đúng nghĩa cổng quyết định

### 3.1. Thu thập bằng chứng từ `p2-01` + `p2-01b` (không code mới)

1. Danh sách insight `blocking-route` / Navigation Inspector sau khi `cacheComponents` +
   `partialPrefetching` đã bật (ảnh chụp hoặc ghi chú PR).
2. So sánh cảm quan/Network: `/guides` (đã cache) vs 1 hot route T1 (chưa cache) — khoảng cách ROI.
3. Xác nhận lại: `p0-01` staleTimes 60s đã lấy phần lớn "không re-run MainLayout mỗi click" — phần
   còn lại của Instant Navigation là gì, có đáng effort `p3-01` không.

### 3.2. (Tuỳ chọn) Thử `instant = true` trên `/guides` rồi xoá

```tsx
// CHỈ thử tạm trên guides/[...slug]/page.tsx — xoá ngay sau khi lấy bằng chứng
export const instant = true;
```

Kỳ vọng insight chỉ tay vào `MainLayout` / phần uncached. **Không** giữ dòng này trên nhánh chính.

### 3.3. QUYẾT ĐỊNH (bảng bắt buộc ghi vào PR/issue)

| Kết quả quan sát | Hành động |
|---|---|
| ROI hot routes rõ (shell rỗng vs guides nhanh), team chấp nhận effort audit từng route T1 | **MỞ** [`p3-01`](./p3-01-cache-components-hot-routes.plan.md) — chi tiết hoá + schedule PR nhỏ |
| ROI còn lại nhỏ sau `p0-01`+`p1-*`+`p2-01`/`p2-01b`; auth-gate là blocker chính | **HOÃN** `p3-01` — ghi lý do; có thể mở lại sau |
| Cần Instant đầy đủ kể cả layout → đụng auth | **KHÔNG** gộp vào `p3-01`; mở thảo luận `p3-02-auth-gate-suspense-signoff` riêng |
| Validate ồn | Giữ/set `manual-warning` (thuộc scope `p2-01`/`p2-01b`) — không phải lý do dừng cổng |

**Plan này COI LÀ XONG khi có một dòng quyết định rõ trong bảng trên** — không bắt buộc ship code.

## 4. Test/Review

1. Output: quyết định + 1–2 ảnh/chứng đo (hoặc link PR `p2-01`/`p2-01b` đã có chứng).
2. `git diff` nhánh chính sau plan này **rỗng** (trừ khi chỉ ghi docs/plan) — thử `instant` phải xoá.
3. Nếu mở `p3-01`: đảm bảo `p3-01` §4 checklist điều kiện đã tick.

## 5. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Nhầm "đã thử instant = đã áp dụng Instant Navigation" | Thấp | §3.2 xoá thử nghiệm; output là quyết định |
| Tự mở `p3-01` không có đo | Trung | Bắt buộc §3.1 trước §3.3 |
| Đụng auth-gate không sign-off | Cao | Cấm trong quyết định mặc định — tách `p3-02` |

## 6. Rollback

Không có runtime rollback nếu tuân §3.2. File plan này giữ làm tài liệu tham khảo bằng chứng docs.

## 6.1. Quyết định chốt (16/09/2026)

| Quan sát | Kết luận |
|---|---|
| `staleTimes` 1800 + sidebar `prefetch` + `loading.tsx` + RQ hover | Đã lấy phần lớn cảm giác “webapp” |
| `cacheComponents` + `'use cache'` `/guides` (build: `1d`/`1w`) | Guides nhanh; opt-in an toàn |
| `partialPrefetching` bật; `(main)/layout` + `/login` = `instant = false` | Layout vẫn blocking — App Shell layout rỗng cho đến khi refactor auth |
| ROI 3-lever hot routes T1 vs effort + rủi ro tiền | **HOÃN `p3-01`**. Mở lại khi sign-off auth-gate Suspense (`p3-02`) hoặc cần thêm tốc độ page-level rõ ràng |

## 7. Liên kết

- Tiếp theo nếu MỞ: [`p3-01-cache-components-hot-routes`](./p3-01-cache-components-hot-routes.plan.md)
- Hạ tầng: [`p2-01`](./p2-01-cache-components-guides-pilot.plan.md), [`p2-01b`](./p2-01b-partial-prefetching-rollout.plan.md)
- Overview: [`00-overview`](./00-overview.md) §2 lộ trình 3 bước + Risk Register
