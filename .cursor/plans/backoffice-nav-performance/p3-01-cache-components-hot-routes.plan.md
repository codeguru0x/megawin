# p3-01 — Cache Components 3-lever cho hot routes T1 (roadmap)

> **Phase:** P3 (roadmap) · **Status:** 📦 deferred — HOÃN (cổng p2-03) · **Phụ thuộc:** cổng
> [`p2-03`](./p2-03-instant-navigation-spike.plan.md) quyết định **MỞ** sau khi có bằng chứng từ
> [`p2-01`](./p2-01-cache-components-guides-pilot.plan.md) + [`p2-01b`](./p2-01b-partial-prefetching-rollout.plan.md)
> **Docs:** `next@16.3.5` `instant-navigation.md` (3 lever), `use-cache.md`, `use-cache-private.md`,
> `adopting-partial-prefetching.md`
> **Rủi ro dữ liệu:** Cao tiềm năng — đụng ops/tiền → mỗi route audit riêng, đọc code + test

## 0. Đây là roadmap có điều kiện — chưa spec chi tiết từng file

Plan này **không** cam kết implement ngay. Chi tiết hoá (file nào, Suspense boundary nào,
`cacheLife` nào) **sau** khi `p2-03` mở cổng dựa trên đo lường thật.

Mục tiêu #1 vẫn là **tối đa tốc độ tải trang** trên các màn staff dùng hàng ngày — phần ROI còn lại
sau `p0-01` (staleTimes) + `p1-*` (hover/RQ) + `p2-01`/`p2-01b` (hạ tầng Cache Components).

## 1. Bối cảnh kỹ thuật (gộp từ bằng chứng docs đã đọc ở `p2-03` cũ)

### 1.1. Instant Navigation cần gì

Theo `instant-navigation.md` Quick start:

```ts
cacheComponents: true
partialPrefetching: true
```

Sau đó follow validation insights: thiếu Suspense / thiếu cache / blocking ngoài boundary.

### 1.2. Ba lever chính thức (AI workflow docs)

1. **Push down** — tách I/O vào child bọc `<Suspense>` để parent/shell tĩnh hơn.
2. **Cache** — `'use cache'` + `cacheLife` (+ `cacheTag` khi cần invalidate).
3. **Per-link prefetch** — `prefetch={true}` khi route đọc URL data (`params`/`searchParams`) và
   muốn resolve trước click.

### 1.3. MainLayout blocking — lý do đúng (sửa hiểu nhầm bản cũ)

`cookies()`/`headers()` **không** tự loại route khỏi App Shell (`partialPrefetching.md`: shell có
thể gồm session data, cache per-session trên client).

`MainLayout` hiện tại:

- `await requireOperatorSession()` ngoài Suspense (có `redirect()`).
- `await cookies()` + preference reads ngoài Suspense.
- **Không** có `'use cache'` / `'use cache: private'` nào.

→ App Shell rỗng/tối thiểu vì **chưa cấu trúc 3-lever**, không phải vì "có cookies = mù".

`getPreference`/`getValueFromCookie` chỉ là `cookies().get()` — **không** I/O DB → tách Suspense
riêng cho preference **không** tạo ROI tốc độ đáng kể; **không** nằm trong scope mặc định plan này.

### 1.4. Auth-gate — NGOÀI scope mặc định

`requireOperatorSession()` → `redirect()` là side-effect, **không** nên nhét vào `'use cache: private'`.
Defer auth bằng Suspense = shell/chrome hiện **trước** khi biết user hợp lệ → thay đổi hành vi bảo mật
UI, cần **sign-off riêng**. Không gộp vào implement mặc định của `p3-01`.

Nếu sau này team muốn: tách plan `p3-02-auth-gate-suspense-signoff` với review bảo mật
(`ClientAccountGuard` đã có phía client — đọc lại trước khi thiết kế).

## 2. Phạm vi đề xuất khi cổng mở (tier T1 từ `p0-02`)

| Route | Lý do ưu tiên |
|---|---|
| `dashboard` | Vào mỗi ngày |
| `games/*/operations` (7 game) | Vận hành hàng ngày |
| `games/{keno,bingo18}/operations-hub` | Hub nóng |

**Cấm** trong vòng đầu (hoặc chỉ sau audit tài chính riêng):

- `reports/settle`, `reports/outstanding`, mọi màn tiền — `staleTime`/cache sai = sai số liệu im lặng.
- Không dùng GitNexus `impact` làm bằng chứng duy nhất (rule `gitnexus-code-graph.mdc` §4).

## 3. Việc phải làm khi chi tiết hoá (sau khi `p2-03` mở)

1. Với **từng** route T1: đọc `page.tsx` + data path (RSC fetch vs React Query client) — ghi bảng
   "cái gì được cache / cái gì phải Suspense / cái gì giữ RQ".
2. Áp lever phù hợp; **không** cache dữ liệu phải tươi theo poll hiện tại mà không đổi contract với RQ.
3. Dùng Next DevTools Navigation Inspector + (nếu có) `@next/playwright` `instant()` cho 1–2 flow
   quan trọng — theo `instant-navigation.md` §Prevent regressions.
4. Mỗi PR một cụm nhỏ (ví dụ chỉ `dashboard`, hoặc 1 game operations) — không 1 PR 10 route.

## 4. Điều kiện coi roadmap "sẵn sàng implement"

- [x] `p2-01` + `p2-01b` done
- [ ] `p2-03` ghi quyết định **MỞ** kèm ảnh/chứng đo — **KHÔNG** (đã HOÃN)
- [ ] Team chốt: auth-gate **không** refactor trong vòng này (hoặc đã có sign-off `p3-02`)
- [ ] Danh sách route T1 cụ thể + owner review tài chính/ops cho từng PR

> **16/09/2026:** Cổng `p2-03` chọn **HOÃN**. Plan này đóng vòng feature `backoffice-nav-performance`
> ở trạng thái deferred — không ship code hot-route Cache Components trong cycle này.

## 5. Test/Review (khung — chi tiết khi spec)

1. Build + check-types + lint.
2. So sánh số liệu ops trước/sau trên cùng kỳ (manual) — bắt buộc với mọi PR đụng operations.
3. Navigation Inspector: shell có nội dung meaningful, không chỉ full-page skeleton.
4. Không nới `staleTime`/`refetchInterval` màn tiền.

## 6. Rollback

Từng PR độc lập: revert `'use cache'` / Suspense wrapper trên route đó. Không phụ thuộc migration DB.
`partialPrefetching` / `cacheComponents` giữ nguyên trừ khi rollback cả chuỗi P2.

## 7. Liên kết

- Cổng quyết định: [`p2-03`](./p2-03-instant-navigation-spike.plan.md)
- Bước 1–2: [`p2-01`](./p2-01-cache-components-guides-pilot.plan.md), [`p2-01b`](./p2-01b-partial-prefetching-rollout.plan.md)
- Tier route: [`p0-02`](./p0-02-loading-skeleton-coverage.plan.md) §2
