# Backoffice — Navigation Performance & Prefetch — Master Plan (00-overview)

> **Nguồn:** [`docs/analytics/backoffice-navigation-performance.md`](../../../docs/analytics/backoffice-navigation-performance.md)
> **Ngày chốt scope:** 10/09/2026 · **Cập nhật v2:** 15/09/2026 (đối chiếu `next@16.3.5` + `react@19.3.0` trong `node_modules`)
> **Mục tiêu #1:** tối đa tốc độ tải trang / điều hướng trong `apps/backoffice`.
> **Hệ quả:** cảm giác webapp liền mạch, sửa dứt điểm lỗi "load liên tục" khi prefetch, **không** đánh đổi độ chính xác dữ liệu (ops/tiền).
> **Feature slug:** `backoffice-nav-performance` · tuân [`.cursor/plans/README.md`](../README.md)

---

## 0. Bằng chứng mới tìm thấy khi lập plan — SỬA LẠI khuyến nghị của analysis doc

Analysis doc gốc đề xuất P0 là *"`HoverPrefetchLink` cho sidebar + bỏ `prefetch={false}` cứng"* làm
việc đầu tiên. Khi đọc code để lập plan này, phát hiện **bằng chứng thật tại hiện trường** mà
analysis doc chưa có: `apps/backoffice/src/components/ai-chat/chat-header.tsx` dòng 24-30 có đúng
comment cảnh báo, ghi lại một sự cố **CÙNG loại bug** đã xảy ra và được tự tay revert ngày 04/09/2026:

> *"⚠️ KHÔNG prefetch khi hover/focus (đã bỏ 04/09). Từng thêm `router.prefetch()` ở `onMouseEnter`/
> `onFocus`... nhưng `/ai` là route dynamic session-gated, không cache được (`staleTimes.dynamic` = 0
> mặc định), nên MỌI lần gọi đều tạo 1 request RSC mới, hết hạn ngay. Production ghi nhận **hàng trăm
> request `_rsc` lặp lại** dù đã thêm guard dedupe-theo-href."*

**Kết luận rút ra (đổi thứ tự P0 so với analysis doc):**

1. Gốc bug là `staleTimes.dynamic = 0` (default Next 15+, xem `p0-01` §1) — **KHÔNG phải** việc gọi
   `router.prefetch()` hay dùng `<Link>` tự nó sai. Sửa **cấu hình gốc** trước, không sửa từng
   component một.
2. Toàn bộ 84 route dưới `(main)` **đều dynamic** — layout gọi `requireOperatorSession()` +
   `cookies()` cho MỌI request. Không có route nào "an toàn hơn route khác" theo tiêu chí static/dynamic.
3. `HoverPrefetchLink` (pattern chính thức của Next — flip `prefetch` prop, KHÔNG tự gọi
   `router.prefetch()` trong event handler) là **an toàn hơn** pattern `/ai` đã dùng (gọi
   `router.prefetch()` trực tiếp, tự viết dedupe tay). Nhưng vẫn phải **pilot đo network trước**,
   không rollout toàn bộ 91 chỗ `prefetch={false}` cùng lúc — đúng bài học từ `/ai`.
4. Vì vậy plan này tách `p0-01` (sửa root cause + viết guardrail cấm lặp lại đúng bug `/ai`) làm
   **P0 thật**, đẩy hover-prefetch sidebar xuống `p1-01` với yêu cầu đo lường trước khi rollout rộng.

### 0.1. Cập nhật v2 (15/09/2026) — đối chiếu docs thật `next@16.3.5` / `react@19.3.0`

| Phát hiện | Hệ quả cho plan |
|---|---|
| `ViewTransition` đã ổn định (không còn `unstable_ViewTransition`) | `p2-02` dùng `import { ViewTransition } from "react"` |
| Guide: wrapper **không** đặt trong `layout.tsx` (layout persist → enter/exit không fire) | `p2-02` dùng `(main)/template.tsx` — remount theo route, cover 84 route mà không sửa từng page |
| `partialPrefetching` (16.3.0+) là cờ thứ 2 bắt buộc cùng `cacheComponents` để Instant Navigation phát huy | Plan mới `p2-01b` — không còn chỉ nhắc 1 dòng trong spike |
| `cookies()`/`headers()` **không** tự loại route khỏi App Shell; shell có session data nếu cấu trúc đúng (`use cache` + Suspense) | `MainLayout` hiện block **ngoài** Suspense, **không** có `'use cache'` → shell rỗng; lý do đúng = thiếu 3-lever, không phải "có cookies = mù" |
| `getPreference`/`getValueFromCookie` chỉ là `cookies().get()` (không I/O DB) | Không tối ưu preference reads riêng — ROI thấp |
| `'use cache: private'` có thể vào App Shell nếu `stale >= 5 phút`; auth `redirect()` **không** nên đặt trong đó | Refactor `requireOperatorSession()` tách riêng, cần sign-off — nằm ngoài scope mặc định `p3-01` |

---

## 1. Bảng trạng thái

| Plan | Phase | Status | Việc chính | Rủi ro dữ liệu |
|---|---|---|---|---|
| [`p0-01-fix-prefetch-loop-root-cause`](./p0-01-fix-prefetch-loop-root-cause.plan.md) | P0 | ✅ done | `staleTimes.dynamic/static` = **1800s** (30 phút; Client Cache in-tab, không phải CDN). Deploy Vercel không tự clear — hard refresh/tab mới/hết TTL | Không — chỉ Next Client Cache |
| [`p0-02-loading-skeleton-coverage`](./p0-02-loading-skeleton-coverage.plan.md) | P0 | ✅ done | 3 primitive + `loading.tsx` cho toàn bộ route thiếu (trừ not-found/unauthorized) | Không — server component tĩnh, không fetch |
| [`p1-01-hover-prefetch-nav-shell`](./p1-01-hover-prefetch-nav-shell.plan.md) | P1 | 📦 retired | **Không dùng HoverPrefetchLink** cho sidebar. Thay bằng `<Link prefetch>` trực tiếp + forward Slot props (sửa icon). HoverPrefetchLink phù hợp marketing nhiều link viewport; backoffice sidebar ít link → full prefetch tốt hơn. File `hover-prefetch-link.tsx` đã xoá | — |
| [`p1-02-react-query-prefetch-on-hover`](./p1-02-react-query-prefetch-on-hover.plan.md) | P1 | ✅ done | Hover RQ: Dashboard, 2 Hub, outstanding, **workers**, **resultfeed**, **audit-logs** | Thấp — `staleTime` khớp hook |
| [`p1-03-react-query-staletime-matrix`](./p1-03-react-query-staletime-matrix.plan.md) | P1 | ✅ done | Chuẩn hoá live feed bingo18/max3d/max3dpro → derive `pollSeconds`; JSDoc + ma trận docs §10 | Trung — đã đối chiếu default `tickSeconds` (10/30/30) = hardcode cũ, không nới lỏng |
| [`p2-01-cache-components-guides-pilot`](./p2-01-cache-components-guides-pilot.plan.md) | P2 | ✅ done | `cacheComponents: true` + `'use cache'` + `cacheLife('days')` cho `/guides` + `/guides/[...slug]`. Confirm: không filter role. `instantInsights: manual-warning` | Không — markdown build-time |
| [`p2-01b-partial-prefetching-rollout`](./p2-01b-partial-prefetching-rollout.plan.md) | P2 | ✅ done | `partialPrefetching: true`. Audit: sidebar `prefetch` (App Shell); còn lại `prefetch={false}` (Hub/table). Không legacy full-prefetch cần migrate | Thấp — hạ tầng shell |
| [`p2-02-view-transitions-polish`](./p2-02-view-transitions-polish.plan.md) | P2 | ⏸️ rolled back | Từng ship `(main)/template.tsx` + `<ViewTransition>`; **gỡ trên prod** vì web-vitals `startTime` spam khi soft-nav vào `config/tenant`/settle | Không — thuần CSS/UX |
| [`p2-03-instant-navigation-spike`](./p2-03-instant-navigation-spike.plan.md) | P2 (cổng) | ✅ done | **HOÃN `p3-01`**: ROI shell đã lấy phần lớn từ staleTimes+Link+loading; Auth-gate `requireOperatorSession` ngoài Suspense vẫn blocker Instant layout; không đụng auth không sign-off. Mở lại khi cần 3-lever page-level | Không — quyết định |
| [`p3-01-cache-components-hot-routes`](./p3-01-cache-components-hot-routes.plan.md) | P3 | 📦 deferred | **Không implement vòng này.** Auth-gate ngoài Suspense = Instant layout không đạt; ROI còn lại nhỏ so với risk ops/tiền. Mở lại khi sign-off `p3-02` auth Suspense | — |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked · 📦 retired (chỉ còn tham khảo).

---

## 2. Thứ tự phụ thuộc

```
p0-01 (fix staleTimes root cause + guardrail)  ──┬──► p1-01 (hover prefetch nav — pilot rồi rollout)
                                                  │                    │
p0-02 (loading.tsx coverage) ────────────────────┘                    ▼
                                                          p1-02 (RQ prefetch on hover — 4-5 route nóng)
                                                                       │
                                                                       ▼
                                            p1-03 (chuẩn hoá staleTime matrix — làm SONG SONG được,
                                                    không phụ thuộc p1-01/p1-02, nhưng nên làm trước
                                                    p1-02 để prefetch dùng ĐÚNG staleTime đã chuẩn hoá)

p1-01 + p1-02 chạy thật ≥ 1 tuần
        │
        ├──► p2-01 (Cache Components — chỉ /guides)  ──► p2-01b (partialPrefetching rollout)
        │                                                      │
        │                                                      ▼
        │                                            p2-03 (cổng quyết định → mở / không mở p3-01)
        │                                                      │
        │                                                      ▼
        │                                            p3-01 (3-lever hot routes T1 — nếu cổng mở)
        │
        └──► p2-02 (View Transitions qua template.tsx — polish, làm bất kỳ lúc nào sau P1)
```

**Lộ trình Cache Components (3 bước) — mục tiêu #1 tốc độ tải trang:**

1. **`p2-01`** — pilot an toàn trên `/guides` (nội dung tĩnh).
2. **`p2-01b`** — bật `partialPrefetching` (hạ tầng App Shell prefetch đúng chuẩn Next 16.3).
3. **`p3-01`** — áp 3-lever (Suspense / `use cache`+`cacheLife` / per-link prefetch) lên hot routes T1.

**Điểm chặn cứng duy nhất:** `p0-01` phải xong và **verify bằng Network tab thật** trước khi làm bất
kỳ plan nào gọi `router.prefetch()` hoặc bật lại prefetch trên link (`p1-01`) — đây chính xác là thứ
tự đã bị đảo ngược trong lần thử nghiệm `/ai` (04/09): thêm hover-prefetch TRƯỚC khi sửa
`staleTimes`, gây storm, phải revert. Không lặp lại.

`p1-03` khuyến nghị làm **trước hoặc cùng lúc** `p1-02` (không bắt buộc thứ tự cứng) vì `p1-02` cần
biết đúng `staleTime` của từng query để prefetch không phá tính "tươi" của dữ liệu.

---

## 3. Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **Next tối ưu shell. React Query tối ưu data.** Không bao giờ dùng cơ chế prefetch/cache của Next
   (`staleTimes`, `cacheComponents`, `router.prefetch`, `partialPrefetching`) để thay cho
   `staleTime`/`refetchInterval` của React Query. Hai tầng cache độc lập — xem
   `docs/analytics/backoffice-navigation-performance.md` §2.2.
2. **Cấm tuyệt đối pattern `router.prefetch(href, { onInvalidate: poll })`** (docs Next gọi là
   `ManualPrefetchLink`) trên toàn bộ `apps/backoffice`, trừ khi thiết kế mới có `staleTimes.dynamic`
   dương **và** có debounce/cancel rõ ràng đã review riêng. Đây là nguồn gốc chính xác của cả 2 sự cố
   đã biết (bug gốc user báo + sự cố `/ai` 04/09).
3. **Không thay đổi behavior tài chính/vận hành để lấy tốc độ.** `staleTime`/`refetchInterval` của
   màn hình tiền (settle, outstanding, exposure) chỉ được SIẾT chặt hơn hoặc giữ nguyên, không được
   nới lỏng vì "cho nhanh hơn" — theo `gitnexus-code-graph.mdc` §4 (code tài chính đọc bằng mắt, không
   suy đoán). Code tài chính trong `p3-01`: **tuyệt đối không** dùng `impact` graph làm bằng chứng duy nhất.
4. **Đo trước khi rollout rộng.** Mọi thay đổi liên quan prefetch (`p1-01`, `p1-02`, `p2-01b`) phải có
   bước đo Network tab / React Query Devtools / Next Navigation Inspector trên 1 nhóm nhỏ TRƯỚC khi
   áp dụng rộng. Không "sửa 1 lần cho tất cả" — chính cách làm này đã gây sự cố `/ai`.
5. **Mỗi plan có mục Test/Review + Rollback** — không có ngoại lệ, vì thay đổi thuộc tầng hạ tầng
   (Next config, cache) ảnh hưởng đồng thời nhiều trang, khó khoanh vùng nếu không có checklist rõ.
6. **Tiếng Việt cho prose, tiếng Anh cho thuật ngữ.** JSDoc bắt buộc theo `code-quality-standards.mdc`.

---

## 4. Risk Register tổng hợp

| Rủi ro | Plan liên quan | Mức | Đã kiểm soát bằng |
|---|---|---|---|
| Role đổi giữa session vẫn hiện quyền cũ tối đa 1800s | `p0-01` | Thấp | App nội bộ; shell cache — data ops/tiền vẫn RQ |
| Prefetch storm RQ khi hover nhiều link | `p1-02` | Thấp | `intentFiredRef` 1 lần/mount; chỉ 4 route nóng |
| `staleTime` nới lỏng làm số liệu ops/tiền cũ lâu hơn | `p1-03` | Trung | Review từng use-case; chỉ siết hoặc giữ nguyên với màn tiền |
| Leak nội dung `/guides` giữa role (nếu tương lai phân role) | `p2-01` | Thấp (hiện tại) | Test đa session bắt buộc mỗi lần guides đổi |
| Dev overlay nhiễu khi bật `cacheComponents` toàn app | `p2-01` / `p2-01b` | Thấp | `experimental.instantInsights.validationLevel = "manual-warning"` nếu cần |
| `partialPrefetching` đổi hành vi link đang dùng `prefetch={true}` legacy | `p2-01b` | TB | Audit theo bảng migrate chính thức trước khi bật cờ |
| `template.tsx` remount làm mất state client không mong muốn | `p2-02` | Thấp | Test hồi quy: state persist phải nằm ở layout/context, không trong cây template |
| Refactor auth-gate (`requireOperatorSession`) để mở Instant Navigation đầy đủ | `p3-01` (tách riêng) | Cao | **KHÔNG tự quyết** — cần sign-off riêng; chưa nằm trong scope mặc định |

---

## 5. Câu hỏi phải trả lời BẰNG ĐO LƯỜNG (không quyết trước)

| # | Câu hỏi | Chốt ở | Kết quả |
|---|---|---|---|
| 1 | `staleTimes` 1800s: nav lặp trong TTL dùng Client Cache (không `_rsc` mới)? | `p0-01` | ✅ Code — verify prod/`next start` (dev tắt Link prefetch) |
| 2 | Sidebar `<Link prefetch>` + Slot forward: icon size đúng, không storm? | `p1-01` retired → Link trực tiếp | ✅ Icon fix; HoverPrefetchLink đã xoá |
| 3 | Hover Tồn đọng / Hub: RQ prefetch trước click, data khớp `staleTime` hook? | `p1-02` | ✅ CDP verified trước đó |
| 4 | Cache Components + `'use cache'` cho `/guides` có leak nội dung giữa 2 session khác quyền xem không? | `p2-01` §4 | ✅ Confirm: `STAFF_GUIDE_MANIFEST` không filter role — nội dung chung mọi operator |
| 5 | Sau `p2-01`+`p2-01b`, ROI còn lại của 3-lever trên hot routes T1 có đủ để mở `p3-01` không? | `p2-03` | ✅ **HOÃN** — auth-gate blocker; shell đã đủ nhanh từ P0–P2 |
| 6 | `template.tsx` + `<ViewTransition>` có làm mất state sidebar/search khi đổi route không? | `p2-02` | ✅ State ở layout/context — template chỉ wrap children |

---

## 6. Định nghĩa "xong" (Definition of Done) cho toàn feature

1. [x] Network / Client Cache: `staleTimes` 1800 + sidebar `<Link prefetch>` — không storm (dev tắt Link prefetch; verify prod/`next start`).
2. [x] Route hay dùng có `loading.tsx` (trừ not-found/unauthorized theo p0-02).
3. [x] `check-types` + build xanh sau Cache Components (`instant=false` login + main layout).
4. [x] Không nới `staleTime`/`refetchInterval` màn tiền (p1-03).
5. [x] Analysis doc + overview cập nhật.
6. [x] `p2-01` → `p2-01b` done; `p2-03` quyết định **HOÃN `p3-01`** (ghi trong plan).

---

## 7. Sau khi hoàn thành

- [x] Docs analytics + overview khớp `staleTimes` 1800s + `<Link prefetch>` sidebar.
- [x] `HoverPrefetchLink` retired; guides Link mặc định prefetch (đã `'use cache'`).
- [x] RQ hover prefetch mở rộng: workers / resultfeed / audit-logs.
- [x] Feature cycle **đóng** — `p3-01` deferred tới khi có sign-off auth-gate.
