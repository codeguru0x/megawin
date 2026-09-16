# p2-01b — Partial Prefetching rollout (bước 2/3 lộ trình Cache Components)

> **Phase:** P2 · **Status:** ✅ done · **Phụ thuộc:** [`p2-01`](./p2-01-cache-components-guides-pilot.plan.md)
> **Docs:** `next@16.3.5` — `partialPrefetching.md`, `adopting-partial-prefetching.md`,
> `instant-navigation.md` (Quick start: cần **cả** `cacheComponents` + `partialPrefetching`)
> **Rủi ro dữ liệu:** Thấp — không thêm `'use cache'` ngoài `/guides`; cờ đổi hành vi prefetch shell

## 1. Mục tiêu (đặt kỳ vọng đúng — không hiểu nhầm "bật cờ = nhanh ngay")

Bật `partialPrefetching: true` để Next prefetch **App Shell** theo route (một shell dùng chung cho
mọi link tới cùng route), thay vì legacy full prefetch per-link.

**Sau bước này:**

| Route | Kỳ vọng tốc độ |
|---|---|
| `/guides/**` (đã có `'use cache'` từ `p2-01`) | Prefetch shell + nội dung cached — nhanh hơn rõ |
| Route ops/tiền (chưa `'use cache'` / Suspense cấu trúc) | App Shell **gần rỗng** — cờ **không** tự làm nhanh ngay; chỉ chuẩn bị hạ tầng cho `p3-01` |

Ghi rõ trong PR description để reviewer không hiểu nhầm "bật cờ = xong việc tốc độ".

## 2. Điều kiện vào

1. `p2-01` đã merge, chạy production/staging ≥ 1 tuần không lỗi runtime liên quan `cacheComponents`.
2. Câu hỏi #4 ở `00-overview` (leak guides) đã pass.
3. `cacheComponents: true` đã có trong `next.config.ts`.

## 3. Việc phải làm

### 3.1. Audit TRƯỚC khi bật cờ (bắt buộc)

Theo `adopting-partial-prefetching.md` §"Migrate existing full prefetches":

Trước Partial Prefetching, `<Link prefetch={true}>` / `prefetch` trần / wrapper resolve `true`
prefetch **toàn bộ** destination kể cả uncached dynamic. Sau khi bật cờ, cùng prop chỉ prefetch
App Shell (+ cached URL data nếu có) — **không** còn kéo uncached dynamic.

**Checklist audit:**

```bash
# Trong apps/backoffice
rg -n 'prefetch=\{true\}|prefetch=\{null\}|prefetch\b' --glob '*.tsx' src/
```

| Tìm thấy | Hành động trước khi bật |
|---|---|
| `prefetch={false}` (~91 chỗ hiện tại) | Không đổi ở bước này — vẫn tắt prefetch; `p1-01` lo HoverPrefetchLink riêng |
| `prefetch={true}` hoặc `prefetch` trần | Phân loại theo bảng migrate docs: static/cached → bỏ `prefetch={true}`; uncached muốn giữ → cache bằng `'use cache'` trước; URL data → giữ `prefetch={true}`; realtime → bỏ `prefetch={true}` |
| Không có legacy full prefetch | Ghi nhận trong PR — an toàn hơn khi bật |

### 3.2. Bật cờ

```ts
// apps/backoffice/next.config.ts
const nextConfig: NextConfig = {
  // ... giữ staleTimes (p0-01), cacheComponents (p2-01) ...
  cacheComponents: true,
  partialPrefetching: true,
};
```

`partialPrefetching` **bắt buộc** `cacheComponents` — thiếu sẽ throw ở config validation (`partialPrefetching.md`).

### 3.3. (Tuỳ chọn) Giảm nhiễu validate

Nếu dev overlay `blocking-route` ồn ở nhiều route ngoài `/guides` (đã biết từ `p2-01` §4.1):

```ts
experimental: {
  // ... staleTimes, optimizePackageImports ...
  instantInsights: { validationLevel: "manual-warning" },
},
```

Chỉ validate route khai báo `instant` tường minh. Quyết định lúc review PR — không bắt buộc trước.

### 3.4. KHÔNG làm trong plan này

- Không thêm `'use cache'` ngoài `/guides` (đó là `p3-01`).
- Không refactor `MainLayout` / `requireOperatorSession`.
- Không đổi `staleTime` React Query.
- Không rollout `HoverPrefetchLink` (đã thuộc `p1-01`).

## 4. Test/Review

1. `pnpm --filter @megawin/backoffice check-types` + `pnpm --filter @megawin/backoffice build` xanh.
2. Dev: vào `/guides` + 2–3 route ops (dashboard, 1 Hub) — hành vi runtime **không đổi** ngoài
   `/guides` (vẫn dynamic như cũ vì chưa cache).
3. Network tab: hover/link tới `/guides` — quan sát prefetch App Shell (ghi nhận, không pass/fail cứng).
4. Dev overlay: liệt kê insight `blocking-route` mới (nếu có) → đính kèm PR làm bằng chứng cho `p2-03`.
5. Regression: sidebar `prefetch={false}` vẫn không prefetch (hành vi cũ giữ nguyên).
6. `pnpm lint` xanh.

## 5. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đổi hành vi link đang `prefetch={true}` legacy | TB | Audit §3.1 bắt buộc trước khi bật |
| Hiểu nhầm "bật cờ = toàn app instant" | Thấp | §1 + PR description |
| Dev overlay nhiễu | Thấp | `manual-warning` (§3.3) |
| Build fail thiếu `cacheComponents` | Thấp | Config validation; `p2-01` đã bật trước |

## 6. Rollback

Xoá `partialPrefetching: true` (và `instantInsights` nếu đã thêm). Không migration — rollback tức thời.
Giữ `cacheComponents` + `'use cache'` guides từ `p2-01` trừ khi rollback cả chuỗi.
