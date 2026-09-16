# Backoffice — Navigation Performance & Prefetch (Next.js 16.3)

**Ngày:** 2026-09-10  
**Stack đo được:** `@megawin/backoffice` — Next.js **16.3.4**, React **19.2.8**, React Query v5  
**Mục tiêu:** cảm giác webapp (đổi trang nhanh) mà **dữ liệu vẫn đúng / tươi đúng nghiệp vụ** — phần lớn data đi qua **API route + React Query**, không qua RSC fetch.

---

## 1. Kết luận ngắn (đọc trước)

| Câu hỏi | Trả lời |
|---|---|
| Vì sao `prefetch={true}` từng làm trang “load liên tục”? | Client Router Cache của **segment động** mặc định `staleTimes.dynamic = 0` → payload prefetch **hết hạn ngay**. Kết hợp `prefetch={true}` (full RSC) hoặc `router.prefetch(..., { onInvalidate })` tự re-prefetch → **vòng request không giới hạn**. |
| Backoffice có nên bật `prefetch={true}` hàng loạt không? | **Sidebar chính: Có** (ít link cố định, shell UI ít đổi) — sau khi `staleTimes` > 0. **Không** trên bảng dày / Hub expand / `target="_blank"`. |
| Giải pháp đúng nhất? | **Tách 2 tầng:** (A) Next Client Cache = shell (`staleTimes` 300s + `<Link prefetch>` sidebar); (B) React Query = data API (prefetch on hover cho route nóng). **Không** dùng HoverPrefetchLink cho sidebar cố định — pattern đó cho marketing nhiều link viewport. |
| Cache Components / Partial Prefetching? | Hướng dài hạn tốt cho shell, **không thay** RQ+API. Chỉ adopt khi đã có Suspense shell và **không** kỳ vọng prefetch RSC thay API. |
| `staleTimes` 60s có đủ không? | **Không tối ưu cho backoffice.** Shell RSC ít đổi; staff thường ở 1 trang >60s. TTL **1800s (30 phút)** — Client Cache in-tab; deploy Vercel **không** tự clear; hard refresh / tab mới / hết TTL mới refetch shell. Data API vẫn RQ. |

---

## 2. Kiến trúc data thực tế của backoffice (bằng chứng code)

### 2.1 Pattern chủ đạo

```
Sidebar <Link>  →  App Router client navigation (RSC payload mỏng)
                         ↓
              page.tsx ("use client" hoặc RSC wrapper mỏng)
                         ↓
              React Query useQuery / useMutation
                         ↓
              apiClient → apps/backoffice/src/app/api/**/route.ts
                         ↓
              UseCase @megawin/*-application
```

Ví dụ đã có trong repo:

- Dashboard: RSC chỉ `requireSession()`, data nằm `DashboardContent` + RQ (`apps/backoffice/src/app/(main)/dashboard/page.tsx`).
- Bingo18 Ops Hub: `"use client"` + **một** `useHubQuery()` → `GET /bingo18/operations/hub-snapshot` (`use-hub-query.ts`).
- Layout `(main)`: `requireOperatorSession()` + `cookies()` — **dynamic** theo session.

Đếm nhanh (2026-09-10): ~**61/84** `page.tsx` dưới `(main)` là `"use client"`. Prefetch RSC **không** mang bảng/KPI; lần click vẫn phải chờ API (trừ khi RQ cache còn hot).

### 2.2 Hai cache khác nhau — không trộn

| Cache | Chủ | Chứa gì | Quyết định freshness |
|---|---|---|---|
| **Next Client Router Cache** | App Router | RSC Flight / tree segment (JS route, loading shell) | `staleTimes` / Partial Prefetching / `'use cache'` |
| **React Query** | FE app | JSON từ API route | `staleTime`, `refetchInterval`, `invalidateQueries` |

Bug prefetch loop thuộc cột **Next**. Sai data / data cũ thuộc cột **RQ**. Sửa một cột không thay được cột kia.

---

## 3. Cơ chế bug “prefetch = true → load không ngừng”

### 3.1 Defaults Next (docs 16.x)

Từ glossary + `staleTimes` + source client router:

- Route **dynamic** (đọc `cookies`/`headers`, `no-store`, session layout…) → Client Cache TTL **dynamic mặc định = 0 giây**.
- `<Link prefetch={true}>` / `router.prefetch()` coi payload như **static** TTL (mặc định ~5 phút) **chỉ khi** prefetch được phân loại static — còn full prefetch của cây **uncached dynamic** vẫn có thể invalidate ngay hoặc luôn refetch khi navigate.
- Có `loading.js` → default Link (`prefetch` auto/`null`) chỉ prefetch tới **loading boundary**, không full page — an toàn hơn `prefetch={true}`.

### 3.2 Vòng lặp điển hình (đúng triệu chứng đã gặp)

```
viewport có nhiều <Link prefetch={true}>
        ↓
server render full dynamic RSC (layout session + page)
        ↓
client ghi vào Router Cache
        ↓
staleTimes.dynamic = 0  →  entry coi như stale ngay
        ↓
(A) Link / router re-prefetch khi còn trong viewport
 hoặc (B) router.prefetch(href, { onInvalidate: lại prefetch })
        ↓
lặp vô hạn → Network tab “load liên tục”
```

Biến thể `(B)` nằm ngay trong docs Next (`ManualPrefetchLink` + `onInvalidate: poll`). Với TTL dynamic = 0, `onInvalidate` gần như fire ngay → **poll vô hạn**. **Cấm** pattern này trên backoffice trừ khi `staleTimes.dynamic` > 0 **và** có debounce/cancel rõ.

### 3.3 Vì sao tắt hết prefetch (`prefetch={false}`) từng là “vá đúng lúc”

- Sidebar / nav nhiều link + layout session = dynamic → default prefetch vẫn có thể tạo storm (đặc biệt prod).
- Hub table ~30 link → 30 prefetch trang operations nặng (đã ghi trong plan Hub: `p1-03`, guideline).
- Vá bằng `prefetch={false}` **đúng để dừng storm**, nhưng đánh đổi cảm giác SPA trên nav chính.

`prefetch={false}` hàng loạt (~130 chỗ) hiện là **phòng thủ**, chưa phải kiến trúc tối ưu cuối.

---

## 4. Giải pháp tối ưu cho *đúng* backoffice này

Nguyên tắc vàng:

> **Next tối ưu chuyển trang (shell). React Query tối ưu data (đúng & tươi).**  
> Không dùng `prefetch={true}` để “kéo data API sớm”.

### 4.1 Tầng A — Navigation shell (cảm giác webapp)

| Việc | Chi tiết | Data chuẩn? |
|---|---|---|
| **`staleTimes` 1800s** | Client Router Cache in-tab (không phải CDN). Deploy không tự xoá. Hard refresh / tab mới / hết TTL. | Không ảnh hưởng RQ. |
| **`<Link prefetch>` sidebar chính** | Ít link cố định → viewport prefetch đầy đủ. Forward mọi prop từ Radix `Slot` (`asChild`) — thiếu `className`/`[&>svg]:size-4` → icon vỡ. | Chỉ ấm JS/RSC shell. |
| **`loading.tsx` theo nhóm route** | Skeleton khớp layout → click thấy UI ngay. | Shell only. |
| **Giữ `prefetch={false}`** | Bảng dày (Hub expand, 30+ row), `target="_blank"`, link phụ drawer/`nav-user`. | Đúng như plan Hub. |
| **Không HoverPrefetchLink** | Pattern Next cho marketing nhiều link trong viewport. Sidebar backoffice không cần; đã thử → bug Slot + phức tạp thừa. | — |

```tsx
// Sidebar: full prefetch + forward Slot props (SidebarMenuButton asChild)
<Link {...slotProps} prefetch href={url}>
  {icon}
  <span>{title}</span>
</Link>
```

### 4.2 Tầng B — Data đúng (API + React Query) — **bắt buộc**

Đây là chỗ quyết định “dữ liệu chuẩn”.

| Loại màn | Chiến lược RQ | Ví dụ trong repo |
|---|---|---|
| **Monitor realtime** (Hub, live ops) | `refetchInterval` từ server config + `staleTime` **cùng nhịp** + `keepPreviousData` + invalidate sau mutation | `useHubQuery` |
| **Drill-down / report** | `staleTime` ngắn–trung (15–60s) hoặc 0 nếu tiền/audit; `enabled` theo param; invalidate theo `*Keys.all` sau ghi | Outstanding / settle |
| **Config / danh mục ít đổi** | `staleTime` dài (5–30 phút); prefetch RQ khi hover nav nếu muốn “instant data” | Game config, tenant list |
| **Sau mutation** | `invalidateQueries` / `setQueryData` — **không** dựa vào Next revalidate cho bảng RQ | Publish result → `kenoKeys.all` |

**Warm data khi hover (tối ưu tối đa, vẫn đúng):**

```tsx
onMouseEnter={() => {
  void router.prefetch("/games/bingo18/operations-hub"); // shell
  void queryClient.prefetchQuery({
    queryKey: bingo18Keys.opsHub(),
    queryFn: fetchOpsHubSnapshot,
    staleTime: 10_000, // khớp poll; không serve stale quá hạn nghiệp vụ
  });
}}
```

Click → shell sẵn + RQ cache hit → cảm giác webapp **và** payload vẫn từ API contract đã validate.

### 4.3 Những gì **không** nên làm (với kiến trúc hiện tại)

| Anti-pattern | Vì sao |
|---|---|
| `prefetch={true}` mọi sidebar link | Full dynamic RSC + session layout → cost cao, dễ storm; **không** fill RQ. |
| `router.prefetch(href, { onInvalidate: prefetch lại })` khi dynamic TTL = 0 | Loop vô hạn (đúng bug đã gặp). |
| Tăng `staleTimes.dynamic` lớn rồi tưởng data API cũng cache | Chỉ cache **RSC segment**, không phải JSON API; ops/money có thể **sai im lặng** nếu hiểu nhầm. |
| Bật `cacheComponents` rồi `'use cache'` bọc snapshot Hub/ops tiền | Dữ liệu vận hành phải tươi theo tick; cache Next sai chỗ = số sai trên màn monitor. |
| Đưa toàn bộ fetch từ RQ về RSC `fetch` chỉ để “dùng Instant Navigation” | Đổi kiến trúc lớn; lợi ích shell có, nhưng backoffice đã đầu tư RQ + invalidate — ROI thấp trừ khi redesign có chủ đích. |

### 4.4 Cache Components / Partial Prefetching — chỗ đứng đúng

Next 16 khuyến nghị:

```ts
cacheComponents: true
partialPrefetching: true
```

→ Link mặc định prefetch **App Shell**; dynamic stream sau Suspense; `prefetch={true}` chỉ khi cần resolve URL data **đã** `'use cache'`.

**Áp dụng cho backoffice khi nào:**

- Sau khi page có **shell tĩnh** (header, tab frame, skeleton) tách khỏi data động.
- Layout session bọc Suspense / `'use cache: private'` đúng docs Instant Navigation.
- Data nghiệp vụ **vẫn** RQ+API (hoặc dần chuyển từng read-only config sang `'use cache'`).

**Không** coi đây là fix thay cho RQ. Không bật global rồi để Hub/settle đi vào static shell sai freshness.

Thứ tự an toàn:

1. Hover prefetch nav + `loading.tsx`  
2. Chuẩn hóa RQ defaults (`staleTime` theo loại màn; đã có `refetchOnWindowFocus: false` global — Hub tự bật lại có chủ đích)  
3. Prefetch RQ trên hover cho 3–5 route “nóng”  
4. (Tuỳ chọn) Adopt Cache Components **từng cụm** route read-mostly (guides, static docs), không phải ops money trước  

### 4.5 View Transitions — polish, không phải correctness

`<ViewTransition>` (React 19.2) làm morph/slide khi navigate. Không sửa loop prefetch, không thay data layer. Làm sau khi A+B ổn định.

---

## 5. Ma trận quyết định `prefetch` trên backoffice

| Ngữ cảnh Link | `prefetch` | Ghi chú |
|---|---|---|
| Sidebar / top nav (ít link, hay click) | `prefetch` (`true`) | Sau `staleTimes` 300s — ấm shell; data vẫn RQ |
| Hub / table 10–50 link cùng lúc | `false` | Giữ nguyên rationale plan Hub |
| `target="_blank"` | `false` | Prefetch lãng phí (full document load) |
| Deep link `?drawId=` / report query | `false` (hoặc hover soft) | Không `true` — URL data + dynamic |
| Link nội bộ trong skeleton/static docs | default / hover | An toàn hơn ops |
| Custom `router.prefetch` + `onInvalidate` | **Cấm** trừ design có TTL > 0 + backoff | Nguồn loop kinh điển |

---

## 6. Checklist “data vẫn chuẩn”

Trước khi bật bất kỳ prefetch / cache Next nào trên route X:

1. Data X lấy từ đâu — RQ+API hay RSC?  
2. Freshness nghiệp vụ bao nhiêu giây? (Hub = `pollSeconds`; settle/audit có thể = 0 sau mutation)  
3. Mutation có `invalidateQueries` đúng key không?  
4. Prefetch Link có kéo theo server work nặng (session + aggregate) không?  
5. Network tab: sau khi hover/mount, request có **lặp vô hạn** không? Nếu có → tắt ngay, xem §3.  
6. Không bao giờ lấy “đúng số tiền / kỳ quay” từ Next Client Router Cache.

---

## 7. Roadmap đề xuất (ưu tiên ROI)

| Phase | Việc | Effort | Cảm giác | Rủi ro data |
|---|---|---|---|---|
| **P0** | `staleTimes` 300s + `loading.tsx` coverage | Thấp | Cao | Không |
| **P1** | Sidebar `<Link prefetch>` (không HoverPrefetchLink) + RQ prefetch on hover route nóng | Thấp | Rất cao | Thấp nếu `staleTime` khớp |
| **P1** | Document: cấm `router.prefetch` + `onInvalidate` poll khi TTL = 0 | Thấp | — | Phòng tái phát |
| **P2** | Cache Components chỉ cho guides / static; ops giữ RQ | Cao | Trung | Trung nếu làm ẩu |
| **P2** | View Transitions trên `(main)/template.tsx` | Trung | Polish | Không |

> Trạng thái thật: xem [`.cursor/plans/backoffice-nav-performance/00-overview.md`](../../.cursor/plans/backoffice-nav-performance/00-overview.md).

---

## 8. Tóm tắt một dòng cho team

**Next = shell nhanh (`staleTimes` + Link prefetch sidebar). React Query = data đúng (API).**  
Không nhầm Client Router Cache với cache số tiền / kỳ quay.

---

## 9. Plans phái sinh

Plan chi tiết từng bước (P0/P1/P2), có test/review/rollback cho mỗi việc, xem thư mục
[`.cursor/plans/backoffice-nav-performance/`](../../.cursor/plans/backoffice-nav-performance/00-overview.md).
Bảng roadmap §7 ở trên là bản tóm tắt gốc — nguồn cập nhật trạng thái thật (⏳/🔨/✅) nằm ở
`00-overview.md` §1 của thư mục plan.

## 10. Ma trận `staleTime` — chốt sau p1-03

Hai tầng cache độc lập (§2.2). Bảng dưới chỉ mô tả **React Query** (JSON từ API). Client Router
Cache (`staleTimes.dynamic/static = 1800` sau p0-01) không nằm ở đây.

| Loại màn | `staleTime` | `refetchInterval` | Ghi chú |
|---|---|---|---|
| Ops Hub (keno/bingo18) | `pollSeconds × 1000` | = staleTime | Đọc từ response |
| Ops snapshot 1 kỳ | `30_000` (hoặc derive poll) | khớp poll | 7 game |
| Live feed | `pollMs × 0.8` | `pollMs` từ `pollSeconds` | Fallback: keno/lotto/mega/power/bingo18 = 10s; max3d/pro = 30s (khớp `tickSeconds` default) |
| Đã settled | `Infinity` | tắt | Dữ liệu không đổi |
| Dashboard KPI hôm nay | `60_000` | `120_000` | Partial, đổi khi settle |
| Dashboard live strip | `0` | `30_000` | Outstanding/jackpot — không cache "tươi giả" |
| Outstanding theo account | `0` | — | Tiền treo |
| Audit / activity / api-logs / workers / resultfeed | `10_000` | tuỳ trang | Màn theo dõi, không phải tiền trực tiếp |
| Danh mục / draws list / jackpot | `60_000`–`5×60_000` | ít/không poll | Ít đổi trong session |

**p1-03 đã sửa:** bingo18 / max3d / max3dpro live feed — bỏ hardcode, derive `pollSeconds` như 4 game còn lại. Default server (`tickSeconds` 10 / 30 / 30) khớp hardcode cũ → hành vi runtime tại cấu hình mặc định không đổi.

## 11. Tham chiếu

- Next 16.3.5 local docs (bản THẬT đang cài):
  `apps/backoffice/node_modules/next/dist/docs/.../staleTimes.md`
- Instant navigation / Partial Prefetching: cùng thư mục docs trên
- Hub: `use-hub-query.ts`, plan `p1-03` trong `backoffice-nav-performance`
- Config: `apps/backoffice/next.config.ts` (`staleTimes.dynamic: 60` sau p0-01)
