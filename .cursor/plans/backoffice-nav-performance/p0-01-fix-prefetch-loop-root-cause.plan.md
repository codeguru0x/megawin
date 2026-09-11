# p0-01 — Sửa gốc lỗi "load liên tục" (`staleTimes.dynamic = 0`) + cấm anti-pattern

> **Phase:** P0 · **Status:** ⏳ pending · **Phụ thuộc:** không · **Chặn:** `p1-01`, mọi việc dùng
> `router.prefetch()` hoặc bật lại prefetch trên `<Link>`
> **Nguồn bằng chứng:** `apps/backoffice/src/components/ai-chat/chat-header.tsx` dòng 24-30 (sự cố
> thật 04/09/2026) + [`docs/analytics/backoffice-navigation-performance.md`](../../../docs/analytics/backoffice-navigation-performance.md) §3

## 0. Đây là plan quan trọng nhất — đọc trước khi làm bất kỳ plan khác trong thư mục

Toàn bộ 91 file đang có `prefetch={false}` là **phòng thủ đúng nhưng chưa xong** — nó dừng được loop
nhưng chưa sửa được nguyên nhân. Nguyên nhân là **một dòng config thiếu**, không phải cách viết
`<Link>`. Sửa đúng 1 dòng này trước khi đụng vào bất kỳ component nào.

## 1. Nguyên nhân — xác nhận từ Next docs local (16.3) + bằng chứng thật trong repo

Từ `node_modules/next/dist/docs/.../staleTimes.md` (đã đọc trực tiếp, không suy đoán):

| Property | Default | Version history |
|---|---|---|
| `staleTimes.dynamic` | **0 giây** (đổi từ 30s → 0s ở Next **15.0.0**) | Route KHÔNG static, KHÔNG fully prefetched |
| `staleTimes.static` | 300 giây (5 phút) | Route static, hoặc `prefetch={true}`, hoặc gọi `router.prefetch()` |

`next.config.ts` hiện tại (`apps/backoffice/next.config.ts`) **không khai báo `staleTimes`** — nghĩa
là toàn bộ 84 route dưới `(main)` (layout gọi `requireOperatorSession()` + `cookies()` → **100%
dynamic**) đang chạy với TTL = **0 giây** cho bất kỳ payload nào Next coi là "dynamic, chưa fully
prefetch". Payload hết hạn ngay lập tức sau khi cache → mọi cơ chế tự-refetch-khi-invalidate
(`onInvalidate`, hoặc hover lặp lại) sẽ luôn thấy cache "stale" và gọi lại **ngay**, tạo request
storm — đúng triệu chứng "load liên tục" user báo ban đầu, và đúng triệu chứng ghi lại trong
`chat-header.tsx` khi thử hover-prefetch cho `/ai` (04/09).

**Đây là default của chính Next, không phải lỗi cấu hình sai** — nhưng default này chỉ an toàn nếu
codebase **không** dùng `router.prefetch()`/hover-prefetch. Backoffice cần hover-prefetch để có cảm
giác webapp → phải nâng TTL này lên một giá trị dương nhỏ trước.

## 1.1. Xác nhận lại bằng docs THẬT của bản đang cài (16.3.4) — trả lời 2 câu hỏi hay bị nhầm

⚠️ **Sửa nguồn (11/09/2026):** bản đầu của mục này trích Context7 `/vercel/next.js` ở `v16.2.9` —
Context7 lúc đó không có sẵn bản `16.3.4`. Đã đọc lại TRỰC TIẾP file docs nằm ngay trong
`node_modules/.pnpm/next@16.3.4.../next/dist/docs/.../staleTimes.md` (chính bản `next` mà
`apps/backoffice` cài, xác nhận bằng `node -e "require('next/package.json').version"` → `16.3.4`)
— nội dung về `staleTimes` **giống nguyên văn** giữa 2 bản, nên kết luận/số liệu ở mục này không đổi.
Chỉ sửa lại nguồn trích dẫn cho đúng, không sửa số liệu:

> *"The `dynamic` property is used when a page is neither statically generated nor fully prefetched,
> with a default of 0 seconds (not cached). The `static` property applies to statically generated
> pages or when the `prefetch` prop on `Link` is set to `true`, or when calling `router.prefetch`,
> with a default of 5 minutes."* — `staleTimes.mdx`

**Câu hỏi 1 — `staleTimes.dynamic` có ảnh hưởng độ tươi dữ liệu API (React Query) không?**
**KHÔNG**, xác nhận lại bằng docs chính thức: `staleTimes` thuộc **Client Router Cache** — cache
riêng cho RSC Flight payload của segment (layout + page shell), hoàn toàn tách khỏi `fetch()` cache
(`cache: "force-cache" | "no-store"`, điều khiển ở tầng Route Handler/Server Component) và tách
khỏi React Query (chạy hoàn toàn ở client, tự có `staleTime`/`refetchInterval` riêng — xem `p1-03`).
Ba tầng cache này **độc lập nhau theo thiết kế của Next**, không có tầng nào ghi đè tầng khác.

**Câu hỏi 2 — tăng giá trị này có lợi gì thật, ngoài chống loop?** Đọc lại
`apps/backoffice/src/app/(main)/layout.tsx` (10/09/2026) phát hiện thêm 1 lý do cụ thể ủng hộ tăng
(không chỉ "chống loop cho đủ"): `MainLayout` là **1 hàm async block cứng** —
`await requireOperatorSession()` rồi `await cookies()` rồi `Promise.all([...3 lần getPreference/
getValueFromCookie])` — **trước khi** trả JSX. Vì layout này dynamic (đọc `cookies()`), với
`staleTimes.dynamic = 0` (default), Next phải chạy lại **toàn bộ chuỗi await này trên server** ở
MỖI lần điều hướng sang route con dưới `(main)` (dù sidebar/header không remount phía client, RSC
Flight payload của segment layout vẫn bị coi "stale ngay" nên bị fetch lại). Tăng `dynamic` lên > 0
nghĩa là trong khoảng TTL đó, Next **tái dùng** payload layout đã có, không gọi lại
`requireOperatorSession()` + 4 cookie read mỗi click — đây là phần "cảm giác nhanh hơn" đo được rõ
nhất, tách biệt hoàn toàn với mọi thứ liên quan React Query.

**Kết luận cho quyết định "có nên tăng lên không":** Có nên, và lợi ích không chỉ là "chống loop".
Nhưng KHÔNG nên tăng tối đa (bằng `static` = 300s) mà không có cơ chế invalidate riêng — vì đây vẫn
là cache của **kết quả `requireOperatorSession()`/cookie đọc lúc TTL bắt đầu**: nếu role của
1 nhân viên bị đổi/khoá giữa session (admin revoke quyền), sidebar (menu theo role) + `AppSidebar`
vẫn hiện theo quyền CŨ cho tới khi TTL hết hoặc có hard navigation. 30-60s là biên độ hợp lý cho rủi
ro này (ứng dụng nội bộ, revoke quyền giữa session là tình huống hiếm nhưng có thật — ví dụ khoá tài
khoản nhân viên vi phạm ngay lập tức). Đã **nâng từ 30s → 60s** so với bản đầu (xem §2.1) vì lợi ích
giảm số lần re-run session/cookie gần như tuyến tính theo TTL trong biên độ nhỏ này, còn rủi ro
"quyền cũ hiện thêm 30s" là chấp nhận được cho ứng dụng nội bộ vận hành (không phải public-facing).
**Không** đề xuất vượt 60-120s — vượt mốc đó lợi ích thêm nhỏ dần (đa số điều hướng thật diễn ra
trong vài chục giây liên tiếp, không phải liên tục nhiều phút) trong khi rủi ro "quyền cũ" tăng lên.

## 2. Việc phải làm

### 2.1. Thêm `staleTimes.dynamic` vào `next.config.ts`

```typescript
// apps/backoffice/next.config.ts
const nextConfig: NextConfig = {
  // ... giữ nguyên các field hiện có ...
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@radix-ui/react-icons"],
    staleTimes: {
      // 60s (nâng từ đề xuất ban đầu 30s sau khi audit lại — xem §1.1) — đủ để hover-prefetch
      // (p1-01) không bị coi "stale ngay" và tự lặp lại vô hạn; đủ để tránh chạy lại
      // requireOperatorSession() + 4 lần đọc cookie trong MainLayout ((main)/layout.tsx) ở MỌI
      // click điều hướng trong ~1 phút liên tục làm việc — đây là phần chi phí server lớn nhất bị
      // lặp lại không cần thiết khi TTL = 0 (default). KHÔNG liên quan tới độ tươi dữ liệu API —
      // đó là việc của React Query (staleTime riêng, xem p1-03). Đây CHỈ cache khung RSC
      // (layout/route JS + kết quả session/cookie đọc lúc TTL bắt đầu), không cache JSON từ
      // apiClient. Đánh đổi: nếu role 1 nhân viên bị đổi/khoá giữa session, sidebar vẫn hiện theo
      // quyền CŨ tối đa 60s (chấp nhận được — ứng dụng nội bộ, không public-facing). KHÔNG tăng
      // vượt 60-120s nếu chưa có cơ chế invalidate riêng cho role — xem lý giải đầy đủ ở §1.1.
      dynamic: 60,
    },
  },
};
```

Giữ `static` ở default (5 phút) — không cần đổi, chỉ ảnh hưởng route thật sự static (backoffice
hiện không có route nào tĩnh 100%, mọi page đều sau layout session-gated).

### 2.2. Viết rule/guardrail chống lặp lại đúng bug đã xảy ra

Thêm một mục vào JSDoc/comment **đúng vị trí có nguy cơ tái phạm cao nhất** — không viết rule mới
riêng ở bước này (để `p1-01` quyết định có cần `.cursor/rules/` riêng hay không sau khi có dữ liệu
thật từ pilot). Bước này chỉ cần:

1. Sửa comment trong `chat-header.tsx` (dòng 24-30) — thêm 1 dòng trỏ sang plan này, để người đọc
   sau biết root cause đã được sửa ở tầng config, KHÔNG có nghĩa là an toàn để quay lại pattern
   `router.prefetch()` gọi trực tiếp trong `onMouseEnter`/`onFocus` mà không dùng `<Link prefetch>`.

```typescript
// ⚠️ KHÔNG prefetch khi hover/focus bằng router.prefetch() trực tiếp (đã bỏ 04/09) — xem lý do gốc
// và fix root cause (staleTimes.dynamic) tại
// .cursor/plans/backoffice-nav-performance/p0-01-fix-prefetch-loop-root-cause.plan.md.
// staleTimes.dynamic đã nâng lên 60s (p0-01) nên storm dạng "mọi lần gọi = 1 request mới" không
// còn xảy ra CHO <Link prefetch>. NHƯNG pattern ở đây là gọi router.prefetch() THẲNG trong event
// handler (không qua <Link>) — vẫn KHÔNG khôi phục nếu chưa đo lại bằng Network tab trên chính nút
// này; ưu tiên pattern HoverPrefetchLink (p1-01) nếu cần khôi phục ý tưởng.
```

2. Cập nhật §3 nguyên tắc chung ở `00-overview.md` (đã có sẵn — không cần sửa gì thêm ở đây, chỉ
   xác nhận khi review).

### 2.3. KHÔNG đụng gì khác trong bước này

Không thêm `cacheComponents`, không thêm `partialPrefetching`, không sửa bất kỳ `<Link>` nào, không
sửa React Query. Đây là plan 1 dòng config + 1 comment — cố ý nhỏ để dễ verify và dễ rollback.

## 3. Tác dụng

| Trước | Sau |
|---|---|
| Mọi payload "dynamic" hết hạn ngay (0s) → bất kỳ cơ chế tự-refetch-khi-stale nào cũng lặp vô hạn | Có 60s đệm — hover lặp lại trong 60s tái dùng cache, không tạo request mới; cùng lúc bớt số lần chạy lại `requireOperatorSession()` + cookie reads trong `MainLayout` (§1.1) |
| Không có nền tảng an toàn để làm `p1-01` (hover prefetch sidebar) | Có nền tảng — nhưng vẫn phải đo (không tự động "an toàn hoàn toàn", xem §5) |
| Comment cảnh báo trong `chat-header.tsx` dễ bị hiểu lầm là "cấm vĩnh viễn mọi prefetch" | Rõ ràng: root cause đã sửa ở tầng config, pattern cụ thể (gọi `router.prefetch` trực tiếp) vẫn cần đo lại trước khi khôi phục |

## 4. Rủi ro & vì sao KHÔNG ảnh hưởng dữ liệu

| Rủi ro | Đánh giá |
|---|---|
| Cache RSC layout/shell 60s có làm session cũ (role đã đổi) hiện sai quyền? | Rất hiếm (role hiếm đổi giữa session) và 60s là ngắn; nếu cần chặt hơn, hạ xuống 15-30s ở bước review — không phải lý do trì hoãn plan. Xem phân tích đầy đủ trade-off ở §1.1 |
| `staleTimes` có cache JSON trả về từ `apiClient`/API route không? | **Không.** Chỉ áp dụng cho Client Router Cache (RSC Flight payload của route segment), không chạm `fetch`/`apiClient` gọi từ Client Component. Xem `docs/analytics/backoffice-navigation-performance.md` §2.2 bảng "Hai cache khác nhau" |
| Có ảnh hưởng `loading.tsx` hiện tại (`(main)/loading.tsx`, `ai/loading.tsx`, …)? | Không đổi hành vi runtime của `loading.tsx` — chỉ đổi thời gian client giữ payload đã prefetch trong cache trước khi coi là cũ |

## 5. Test/Review — BẮT BUỘC trước khi coi plan này "done"

1. **Trước khi sửa** — mở DevTools Network, filter `_rsc`, hover lặp lại (~10 lần trong 5s) vào 1
   link sidebar bất kỳ đang có sẵn `prefetch={false}` nhưng tạm bật `prefetch={null}` để test. Ghi số
   request. (Kỳ vọng: nhiều request nếu test bằng cách gọi `router.prefetch()` tay qua console; nếu
   test bằng `<Link prefetch={null}>` mặc định có thể không lộ rõ vì Next tự dedupe theo href — vẫn
   nên thử để có baseline).
2. Sửa `next.config.ts` theo §2.1, `pnpm --filter @megawin/backoffice check-types` xanh.
3. Chạy `pnpm --filter @megawin/backoffice dev`, lặp lại đúng kịch bản #1. Kỳ vọng: cùng href, hover
   lại trong vòng 60s → **0 request mới** trong Network tab.
4. Mô phỏng lại chính xác kịch bản đã gây sự cố `/ai` (04/09): gọi `router.prefetch(href)` thủ công
   nhiều lần liên tiếp qua console trên 1 route dynamic (ví dụ `/dashboard`) trong vòng < 60s — xác
   nhận **chỉ 1 request** thật sự đi ra, các lần gọi sau đó cache-hit.
5. Đo thêm hiệu ứng mới phát hiện ở §1.1: mở Network tab, filter theo path route (không filter
   `_rsc` để thấy cả request thường), điều hướng qua lại 5 route con dưới `(main)` liên tục trong
   < 60s — so sánh **response time** của request RSC lần 2+ (nên nhanh hơn rõ rệt lần đầu vì Next
   tái dùng payload layout đã cache, không phải chạy lại `requireOperatorSession()`).
6. Dán ảnh chụp Network tab (trước/sau) vào PR — đây là câu hỏi #1 ở `00-overview.md` §4, phải có
   bằng chứng ảnh, không chỉ mô tả bằng lời.
7. `pnpm lint` xanh cho `next.config.ts` + `chat-header.tsx`.
8. Test hồi quy nhanh: vào `/ai`, mở panel chat, dùng thử gửi tin nhắn — xác nhận **không** có gì đổi
   hành vi (plan này không sửa logic `/ai`, chỉ sửa comment).

## 6. Rollback

Xoá field `staleTimes` khỏi `experimental` trong `next.config.ts`. Revert comment
`chat-header.tsx` về bản cũ (`git diff` chỉ 2 file, dễ revert độc lập). Không có migration DB, không
endpoint mới — rollback tức thời, an toàn 100%.
