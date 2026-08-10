# Backoffice — Tối ưu Loading, Performance & UX (Next.js 16 / React 19)

> **Status:** `discussing` · **Ngày:** 2026-08-09
> **Nguồn tham chiếu:** Vercel React Best Practices v1.0.0, Vercel Composition Patterns v1.0.0, Next.js 16 Cache Components docs, khảo sát trực tiếp `apps/backoffice` (chi tiết ở §2).

---

## 1. Bối cảnh & mục tiêu

`apps/backoffice` là app monitoring/vận hành nội bộ cho staff: dashboard tài chính, operations 7 game, reports settle/void/outstanding, quản lý tenant/account. Đặc thù:

- Dữ liệu **thay đổi liên tục** (draw đóng/mở, settle, jackpot) → polling dày đặc là chủ đích.
- Người dùng là **staff nội bộ** đăng nhập cả ngày, điều hướng qua lại giữa nhiều trang → chi phí per-navigation và per-request quan trọng hơn cold-load SEO.
- Không có ảnh, không SEO — mục tiêu là **TTI nhanh, điều hướng mượt, giảm tải server/Mongo** chứ không phải LCP marketing.

Mục tiêu của analysis: rà theo best practices Vercel (React + Next.js) và Next 16, chỉ ra khoảng cách giữa hiện trạng và chuẩn, đề xuất giải pháp **cụ thể, đúng phiên bản đang dùng** (Next `^16.3.0`, React `^19.2.8`, React Compiler bật, Turbopack dev+build).

---

## 2. Hiện trạng (đã đọc code thực tế, không phỏng đoán)

### 2.1. Số liệu tổng quan

| Hạng mục | Giá trị | Bằng chứng |
|---|---|---|
| Pages (`page.tsx`) | 82 (80 trong route group `(main)`) | `src/app/**` |
| API routes (`route.ts`) | 324, 323 route dùng `withApi` | `src/app/api/**`, `src/lib/api.ts` |
| File có `"use client"` | **572 / 1.123** file `.ts(x)` (~51%) | grep toàn `src/` |
| Page là Client Component nguyên trang | **57 / 82** (toàn bộ games/*, reports/*, audit-logs…) | vd `games/keno/reports/settle/page.tsx` |
| `next/dynamic` / `React.lazy` | **0** usage | grep toàn `src/` |
| `loading.tsx` | 5 (thiếu ở đa số segment games/reports) | `(main)/loading.tsx` + 4 segment accounts/tenants |
| `error.tsx` per-segment | **0** (chỉ có `global-error.tsx`) | `src/app/` |
| Server-side caching (`React.cache`, `"use cache"`, LRU) | **0** | grep toàn `src/` |
| React Compiler | **BẬT** (`reactCompiler: true`) | `next.config.ts` |
| `optimizePackageImports` | `lucide-react`, `recharts`, `date-fns`, `@radix-ui/react-icons` | `next.config.ts` |

### 2.2. Kiến trúc data-fetch hiện tại — "client-fetch-everything"

Mô hình thống nhất toàn app:

```
Server Component (chỉ requireSession) → Client Component
  → React Query useQuery → /api/** (withApi → better-auth getSession → use-case → Mongo)
```

- **0 trang** fetch data ở Server Component. First paint của mọi trang là skeleton, data chỉ về sau khi: HTML → hydrate JS → `useQuery` bắn request → API route resolve session lại lần nữa → Mongo. Đây là **double round-trip có chủ ý bị lãng phí**: request page đã đi qua server (đã có session, đã có DB connection) nhưng không mang theo data nào về.
- `QueryProvider` (`src/providers/query-provider.tsx`) tạo `QueryClient` mặc định `retry: 1`, `refetchOnWindowFocus: false` — **không set `staleTime` mặc định** → mọi query không khai báo riêng có `staleTime: 0`, mount lại là refetch.
- Polling dày: dashboard 4 query song song (KPIs 2ph; draws/jackpots/outstanding 30s + `staleTime: 0`), operations 7 game 30s, settle reports 60s, bingo18 draws **15s**, cùng nhiều `setInterval` UI 1s/15s.
- Mỗi API call chạy `auth.api.getSession()` trong `getSession` của `src/lib/api.ts`. App chạy **DB-less better-auth** (stateless cookie session, `cookieCache` 24h trong `src/lib/auth.ts`) → resolve session là decode/verify cookie, không query DB — chi phí chấp nhận được, nhưng vẫn lặp per-request.

### 2.3. Bundle & rendering

- `lucide-react` named-import trong **364 file**, `date-fns` 29 file — đã được `optimizePackageImports` cover. ✅
- **`radix-ui` (gói unified v1.4)** được import barrel `from "radix-ui"` trong toàn bộ 54 file `components/ui/*` — **KHÔNG nằm trong `optimizePackageImports`** (config chỉ có `@radix-ui/react-icons`, vốn không được dùng). ❌
- `recharts` (~100KB+ gzip) import tĩnh trong `components/ui/chart.tsx` + `dashboard/_components/game-performance.tsx` — nằm trong client bundle dashboard ngay cả trước khi chart hiển thị.
- `react-markdown` + `remark-gfm` import tĩnh (trang guides), `@dnd-kit/*` import tĩnh.
- `<Suspense>` xuất hiện 44 file nhưng chủ yếu để wrap `useSearchParams`/nuqs (bắt buộc của Next), **không phải data streaming**.
- Sidebar chủ động `prefetch={false}` trên mọi `Link` (`components/sidebar/nav-main.tsx`, `app-sidebar.tsx`) → mỗi lần điều hướng phải chờ tải RSC payload + chunk JS của trang đích ngay lúc click.
- `proxy.ts` (Next 16 convention) chỉ đọc cookie, không gọi DB — nhẹ. ✅
- Theme boot bằng inline script chống flicker (`src/scripts/theme-boot.tsx`) — đúng best practice §6.5. ✅
- Không dùng ảnh (`next/image`/`<img>`: 0) — không có việc phải làm. ✅
- Font qua `next/font/google` (`src/lib/fonts/registry.ts`) nhưng đăng ký **nhiều font** cho preferences → mọi font đều được preload dù user chỉ dùng 1.

### 2.4. Điểm cộng sẵn có (không cần đụng)

React Compiler bật (bỏ qua nhóm memo/useMemo thủ công của best practices), Turbopack dev+build, `removeConsole` production, `serverExternalPackages` cho mongodb/AWS SDK, proxy cookie-only, nuqs cho URL state, TanStack Table/Query v5 hiện đại.

---

## 3. Phân tích — khoảng cách so với best practices & trade-off

### 3.1. Waterfall là vấn đề số 1 (Vercel BP §1 — CRITICAL)

Chuỗi hiện tại cho mọi lần vào trang:

```
GET /page → SC requireSession → HTML skeleton → tải JS → hydrate
  → useQuery bắn 1-4 request /api/** → mỗi request lại getSession → Mongo → render data
```

Ít nhất **2 round-trip mạng tuần tự** (page + API) cộng thời gian hydrate ở giữa. Với dashboard là 5 request (1 page + 4 API). Trên mạng văn phòng nội bộ latency thấp nên "cảm giác" chấp nhận được, nhưng đây là chi phí nhân với mọi navigation × mọi staff × cả ngày.

**Hai phương án xử lý:**

| Phương án | Cách làm | Ưu | Nhược |
|---|---|---|---|
| **A. Server-fetch + hydrate React Query** (khuyến nghị) | SC gọi thẳng use-case (không qua HTTP), `HydrationBoundary` + `dehydrate` bơm data vào cache React Query; client giữ nguyên `useQuery` + polling | First paint có data thật; giữ nguyên toàn bộ polling/invalidation hiện có; use-case đã import sẵn trong app | Phải viết prefetch per-page; cần `queryFn` server-side tách khỏi `apiClient` |
| B. Chuyển hẳn sang RSC render data | SC fetch + render, bỏ React Query | Ít JS nhất | Mất polling/optimistic update — **không phù hợp app monitoring**, refactor khổng lồ |

Phương án A đúng tinh thần TanStack Query v5 (`prefetchQuery` + `HydrationBoundary` là API chính thức) và không phá kiến trúc `_lib/use-*-queries.ts` hiện tại. Điểm mấu chốt: **API route và use-case đã sống chung một app** — SC gọi `useCase.run()` trực tiếp, không cần HTTP loop-back.

### 3.2. React Query config mặc định đang chống lại chính mình

- `staleTime` mặc định 0 → quay lại trang cũ (điều hướng sidebar) là refetch toàn bộ dù data 10 giây trước vẫn hiển thị được. Với app polling 30s, `staleTime` mặc định 15–30s là hợp lý và **giảm đáng kể request lặp** khi user điều hướng qua lại.
- Polling `refetchInterval` chạy cả khi **tab bị ẩn** trừ khi tự xử lý. TanStack v5 hỗ trợ `refetchIntervalInBackground: false` (mặc định) — cần xác nhận các hook không bật ngược; và nên cân nhắc tạm dừng polling khi `document.visibilityState === "hidden"` đã được v5 xử lý sẵn. Điểm cần chủ động: **các `setInterval` UI 1s/15s** (draw-countdown, relative-time) không tự dừng khi tab ẩn.

### 3.3. Bundle — 3 lỗ hổng cụ thể

1. **`radix-ui` unified thiếu trong `optimizePackageImports`** — 54 file UI import barrel. Next 16 hỗ trợ optimize gói này (nằm trong danh sách built-in của Next từ 13.5, nhưng gói `radix-ui` unified mới — cần thêm tường minh). Chi phí sửa: 1 dòng config.
2. **`recharts` static import trong dashboard** — thư viện chart lớn nhất trong dependency. `next/dynamic` với `ssr: false` cho `game-performance.tsx` loại nó khỏi first-load chunk của dashboard (BP §2.4).
3. **`react-markdown` + `remark-gfm`** (guides) và **`@dnd-kit/*`** — chỉ dùng ở segment riêng; App Router đã code-split per-route nên tác hại giới hạn trong segment đó, ưu tiên thấp hơn recharts.

### 3.4. Navigation UX — prefetch bị tắt toàn bộ

`prefetch={false}` trên toàn sidebar là quyết định có lý do (80 trang × prefetch tự động = tải thừa), nhưng **tắt hết** làm mọi navigation phải chờ chunk JS. Next 16 có 2 công cụ tốt hơn "tắt hết":

- `prefetch="auto"` (mặc định) chỉ prefetch khi Link vào viewport — với sidebar luôn hiển thị thì tương đương prefetch tất cả → đúng là nên tránh.
- **Prefetch theo intent (hover/focus)**: Next 16 hỗ trợ `prefetch` khi hover qua việc để mặc định trên `<Link>` — hoặc tự làm `onMouseEnter → router.prefetch(href)` (BP §2.5). Chi phí gần bằng 0, cải thiện cảm nhận điều hướng rõ rệt cho staff dùng cả ngày.

### 3.5. Thiếu `loading.tsx` / `error.tsx` per-segment

- 57 trang client tự render skeleton **sau khi hydrate** — nghĩa là giữa lúc click và lúc skeleton hiện ra có khoảng trắng/đứng hình nếu chunk chưa về. `loading.tsx` per-segment cho instant loading UI từ server, hiện chỉ có 5.
- **0 `error.tsx`**: một lỗi render trong bất kỳ trang nào sẽ nổ lên `global-error.tsx`, mất toàn bộ shell (sidebar, theme). App vận hành tài chính cần error boundary per-segment để lỗi 1 bảng không giết cả trang.

### 3.6. Next 16 Cache Components (`cacheComponents: true`) — đánh giá: CHƯA nên bật toàn app

PPR + `use cache` là công nghệ mới nhất của Next 16, nhưng backoffice là app **100% dynamic, per-session, không SEO**:

- Static shell prerender không có giá trị lớn khi mọi trang đều sau login và layout đã nhẹ.
- `use cache` yêu cầu tách runtime API (cookies) khỏi hàm cache — với 324 API route + kiến trúc use-case hiện tại, chi phí migration cao.
- **Ngoại lệ đáng dùng**: các data gần-tĩnh đọc lặp nhiều (game config, danh sách tenant, fonts/theme presets, ops-docs guides) có thể dùng `"use cache"` function-level + `cacheTag` khi có server-fetch (sau khi làm §3.1-A). Đây là bước 2, không phải bước 1.

Thay vào đó, tầng caching phù hợp ngay là **LRU in-process** (BP §3.3) cho các use-case read-heavy ít đổi (config, tenant list) ngay trong API route — vì backoffice self-host long-running server, LRU sống tốt giữa các request.

### 3.7. Những thứ KHÔNG cần làm (đã tốt hoặc không áp dụng)

| Best practice | Verdict | Lý do |
|---|---|---|
| memo/useMemo/useCallback thủ công (BP §5) | **Bỏ qua** | React Compiler đã bật |
| next/image, blur placeholder | **N/A** | App không có ảnh |
| Edge runtime | **Không dùng** | Mongo driver cần Node.js |
| SWR thay React Query | **Không** | React Query v5 đã chuẩn |
| Chuyển toàn bộ sang RSC (bỏ React Query) | **Không** | Mất polling — trái bản chất app monitoring |
| `after()` cho logging | **Theo dõi** | Audit log hiện qua use-case; chỉ áp dụng nếu đo thấy blocking |

---

## 4. Đề xuất đã re-review — kèm verdict và giải pháp cụ thể

Xếp theo **ROI = tác động / chi phí**, mã hoá P1 (làm ngay) → P3 (khi có nhu cầu).

### P1-01 · Quick wins config — verdict: **keep** (chi phí ~1 giờ)

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  reactCompiler: true,
  // ...
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "radix-ui", // ← THÊM: gói unified đang dùng trong 54 file components/ui
      // XOÁ "@radix-ui/react-icons" — không được dùng
    ],
  },
};
```

Kèm theo: chạy `next build --turbopack` với biến `ANALYZE` (hoặc `@next/bundle-analyzer`) trước/sau để có số liệu baseline — mọi đề xuất bundle bên dưới đo bằng cùng công cụ.

### P1-02 · React Query defaults — verdict: **keep** (chi phí ~0.5 ngày, tác động toàn app)

```typescript
// src/providers/query-provider.tsx
new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,      // ← điều hướng qua lại trong 30s không refetch
      gcTime: 5 * 60 * 1000,     //   giữ cache 5 phút cho back-navigation
    },
  },
});
```

Query nào cần realtime hơn (operations 15-30s polling) đã tự khai báo `staleTime`/`refetchInterval` riêng — default này chỉ đỡ cho ~50% query không khai báo. Cần rà lại các hook đang set `staleTime: 0` tường minh (dashboard draws/jackpots/outstanding): với polling 30s sẵn có, `staleTime: 25s` cho kết quả hiển thị tương đương mà không refetch khi remount.

### P1-03 · `loading.tsx` + `error.tsx` per-segment — verdict: **keep** (chi phí ~1 ngày)

- Thêm `loading.tsx` cho các segment lớn: `games/[game]/(draws|operations|reports)`, `reports/`, `audit-logs/`, `system/` — dùng chung 1 component skeleton từ `@/components`, mỗi file 3 dòng.
- Thêm `error.tsx` ("use client", nút retry qua `reset()`) tối thiểu ở `(main)/error.tsx` để lỗi không giết shell, lý tưởng là per-segment games/reports. Next 16 có `forbidden`/`unauthorized` convention nếu muốn tinh chỉnh sau.

### P1-04 · Dynamic import recharts — verdict: **keep** (chi phí ~0.5 ngày)

```typescript
// dashboard/_components/game-performance.tsx → tách phần chart
import dynamic from "next/dynamic";

const GamePerformanceChart = dynamic(
  () => import("./game-performance-chart").then((m) => m.GamePerformanceChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
```

Áp dụng cùng pattern cho `react-markdown` (guides) nếu bundle analyzer xác nhận đáng kể. **Không** dynamic-hoá dnd-kit/embla trước khi đo — App Router đã split per-route.

### P2-01 · Server-fetch + HydrationBoundary cho trang nặng — verdict: **keep, làm từng trang** (chi phí ~0.5-1 ngày/trang)

Mẫu chuẩn, áp dụng trước cho **dashboard** (5 request → 1), sau đó operations/reports theo mức độ dùng:

```tsx
// dashboard/page.tsx — Server Component
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

export default async function DashboardPage() {
  const session = await requireSession();
  const { todayFd, yesterdayFd, compareFd } = computeDefaultFilters();

  const qc = new QueryClient();
  // Gọi thẳng use-case — KHÔNG HTTP loop-back về /api/**
  await Promise.all([
    qc.prefetchQuery({
      queryKey: dashboardKeys.kpis(todayFd),
      queryFn: () => new GetDashboardKpisUseCase().run({ fd: todayFd, compare: `${yesterdayFd},${compareFd}` }),
    }),
    qc.prefetchQuery({ queryKey: dashboardKeys.draws(), queryFn: () => new GetDashboardDrawsUseCase().run({}) }),
    // ... jackpots, outstanding
  ]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardContent />
    </HydrationBoundary>
  );
}
```

- Client component **không đổi** — `useQuery` cùng `queryKey` nhận data đã hydrate, polling tiếp tục như cũ.
- Ràng buộc: `queryKey` phải khớp tuyệt đối giữa server prefetch và client hook → export key factory từ `_lib/` dùng chung (đã có pattern `dashboardKeys`).
- Lưu ý auth: use-case chạy dưới quyền session đã verify ở `requireSession` — cần truyền context tenant/role tương đương những gì `withApi().auth()` làm, không bypass check role.

### P2-02 · Prefetch theo intent cho sidebar — verdict: **keep** (chi phí ~0.5 ngày)

Giữ `prefetch={false}` (tránh prefetch 80 trang), thêm hover-intent:

```tsx
// components/sidebar/nav-main.tsx
const router = useRouter();
<Link
  prefetch={false}
  href={item.url}
  onMouseEnter={() => router.prefetch(item.url)}
  onFocus={() => router.prefetch(item.url)}
>
```

Hover ~200-300ms trước khi click là đủ để RSC payload + chunk về trước.

### P2-03 · Tạm dừng polling/interval khi tab ẩn — verdict: **keep** (chi phí ~0.5 ngày)

- Xác nhận không hook nào bật `refetchIntervalInBackground: true` (TanStack v5 mặc định đã dừng polling khi tab ẩn).
- Các `setInterval` UI (draw-countdown 1s ×2, relative-time 15s, operations tick 1s): gom về 1 hook `useVisibleInterval` — dừng khi `document.visibilityState === "hidden"`, chạy lại khi visible. Giảm CPU/battery và request nền khi staff mở nhiều tab.

### P2-04 · LRU cache in-process cho use-case read-heavy ít đổi — verdict: **keep, phạm vi hẹp** (chi phí ~1 ngày)

Ứng viên: game config (đọc mỗi lần vào trang config/operations), danh sách tenant, ops-docs. TTL ngắn 30-60s + invalidate khi mutation tương ứng chạy. **KHÔNG** cache số liệu tài chính (KPIs, outstanding, settle) — sai lệch dù 30s cũng gây nhầm lẫn vận hành.

### P3-01 · `cacheComponents: true` + `use cache` — verdict: **demote, chờ** 

Chỉ xét lại sau khi P2-01 phủ các trang chính: khi SC đã fetch data, `"use cache"` function-level + `cacheTag`/`updateTag` là bước nâng cấp tự nhiên thay LRU tự quản. Không bật flag toàn app khi 57 trang còn là client-fetch — không có gì để PPR hưởng lợi.

### P3-02 · Giảm font preload — verdict: **keep, ưu tiên thấp**

`src/lib/fonts/registry.ts` đăng ký nhiều font cho preferences → chỉ `preload: true` cho font mặc định, các font còn lại `preload: false` (vẫn self-host qua next/font, tải khi được chọn).

### Đề xuất bị CẮT sau re-review

| Đề xuất | Verdict | Lý do cắt |
|---|---|---|
| Migrate sang RSC thuần, bỏ React Query | **cut** | Trái bản chất app polling/monitoring; refactor 57 trang |
| Bật `cacheComponents` ngay | **cut → P3-01** | Không có content static/cacheable ở tầng page hiện tại |
| Virtualize mọi bảng (tanstack-virtual) | **cut** | Bảng đã phân trang server-side; chưa có bằng chứng bảng >200 dòng |
| Service Worker / offline cache | **cut** | App nội bộ realtime, stale data nguy hiểm hơn chậm |
| Thay `lucide-react` bằng import path trực tiếp | **cut** | `optimizePackageImports` đã cover, sửa 364 file vô nghĩa |

---

## 5. Thứ tự thực thi khuyến nghị & cách đo

1. **Baseline trước**: bundle analyzer + Lighthouse (hoặc Chrome DevTools performance trace) trên dashboard, 1 trang operations, 1 trang report. Ghi số first-load JS, TTI, số request/phút khi idle.
2. P1-01 → P1-04 (1 tuần, rủi ro thấp, không đổi kiến trúc).
3. P2-01 pilot trên dashboard → đo lại → rollout operations/reports.
4. P2-02 → P2-04 song song.
5. Đánh giá lại P3 sau khi P2-01 phủ ≥ các trang chính.

Chỉ số theo dõi: first-load JS per route (analyzer), thời gian click-→-data-hiển-thị (DevTools), tổng request `/api/**` per phút khi idle (đo trước/sau P1-02 + P2-03).

---

## 6. Câu hỏi mở

1. **P2-01 auth context**: use-case gọi trực tiếp từ SC cần nhận session/role context như `withApi().auth()` — xác nhận `NextApiUseCase` có đường truyền context này chưa, hay cần thêm adapter?
2. Polling intervals hiện tại (15s bingo18, 30s operations) là yêu cầu nghiệp vụ cứng hay có thể nới khi tab không focus vào trang tương ứng?
3. Có kế hoạch multi-instance deploy cho backoffice không? Nếu có, P2-04 LRU cần cân nhắc Redis thay in-process (ảnh hưởng cả P3-01 cache handler).
4. Bảng nào thực tế render >200 dòng không phân trang? (quyết định có hồi sinh đề xuất virtualization đã cắt)

---

## 7. Plans phái sinh

Chưa tạo — chờ chốt analysis. Dự kiến khi approved:

- `.cursor/plans/backoffice-performance/p1-quick-wins.plan.md` (P1-01 → P1-04)
- `.cursor/plans/backoffice-performance/p2-server-hydration.plan.md` (P2-01, pilot dashboard)
- `.cursor/plans/backoffice-performance/p2-runtime-tuning.plan.md` (P2-02 → P2-04)


