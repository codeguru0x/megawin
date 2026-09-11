# p2-01 — Cache Components pilot CHỈ cho `/guides` (nội dung tĩnh, không ops/tiền)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** `p1-01` + `p1-02` chạy thật ≥ 1 tuần không
> lỗi (xem `00-overview.md` §2) · **KHÔNG** áp dụng ngoài `/guides` trong plan này

## 1. Vì sao chỉ `/guides`, không phải toàn app

Theo `docs/analytics/backoffice-navigation-performance.md` §4.4 và §4.3 (bảng anti-pattern): bật
`cacheComponents` toàn cục rồi để dữ liệu vận hành/tiền (Hub, settle, outstanding) vô tình lọt vào
"static shell" là rủi ro **sai số liệu im lặng** — không được làm. `/guides` là ứng viên AN TOÀN vì:

1. **Nội dung 100% tĩnh, build-time.** Đọc `apps/backoffice/src/app/(main)/guides/[...slug]/page.tsx`
   — `generateStaticParams()` prerender toàn bộ doc, nội dung lấy từ `DOC_CONTENT[found.doc.file]`
   (markdown compile-time, không phải DB/API). Không có `useQuery`, không state realtime.
2. **Không phân quyền theo role riêng** — mọi user đã qua `requireOperatorSession()` ở layout đều xem
   được cùng nội dung guides (cần xác nhận lại bằng đọc code trước khi bật — xem câu hỏi #4 ở
   `00-overview.md` §4, KHÔNG giả định).
3. **Không có write/mutation nào trong route này** — chỉ đọc, không risk write-after-cache-stale.

## 2. Vấn đề kỹ thuật cần giải — layout `(main)` là dynamic, kéo theo route con

`(main)/layout.tsx` gọi `requireOperatorSession()` + `cookies()` cho **mọi** route con (kể cả
`/guides`), khiến Next coi toàn bộ cây `/guides/**` là "dynamic" theo định nghĩa Next — dù nội dung
trang tự nó tĩnh 100%. Đây chính là điều Cache Components (`cacheComponents: true`) + `'use cache'`
được thiết kế để giải: đánh dấu **riêng phần nội dung guides** là cacheable, tách khỏi phần
session-check của layout, qua Suspense boundary + `'use cache'` directive.

## 3. Việc phải làm

### 3.1. Bật `cacheComponents` — SCOPED, không phải flag global vô điều kiện

```typescript
// apps/backoffice/next.config.ts
const nextConfig: NextConfig = {
  // ... giữ nguyên các field hiện có (kể cả staleTimes đã thêm ở p0-01) ...
  cacheComponents: true,
};
```

**Lưu ý quan trọng:** `cacheComponents: true` là flag **toàn app** (Next chưa hỗ trợ scope theo
route ở tầng config) — nhưng chỉ THỰC SỰ cache những gì được đánh dấu `'use cache'` tường minh. Route
khác (Hub, operations, dashboard...) **không** có `'use cache'` nào → hành vi không đổi, vẫn dynamic
như cũ. An toàn vì Cache Components là **opt-in per-component**, không tự động cache mọi thứ.

### 3.2. Thêm `'use cache'` cho phần nội dung guides

```tsx
// apps/backoffice/src/app/(main)/guides/[...slug]/page.tsx
async function GuideDocContent({ slug }: { slug: string[] }) {
  "use cache";
  const resolved = resolveDoc(slug);
  if (!resolved) notFound();
  // ... toàn bộ JSX hiện tại của GuideDocPage, tách vào đây ...
}

export default async function GuideDocPage({ params }: PageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<GuideDocSkeleton />}>
      <GuideDocContent slug={slug} />
    </Suspense>
  );
}
```

Tương tự cho `guides/page.tsx` (landing page — cũng 100% tĩnh, `STAFF_GUIDE_MANIFEST` là hằng số
compile-time).

### 3.3. KHÔNG đụng route nào khác trong bước này

Không thêm `'use cache'` ở bất kỳ file nào ngoài 2 file trong `guides/`. Không đổi `partialPrefetching`
(để riêng, không phải scope plan này — nếu cần, tách plan `p2-01b` sau khi `/guides` ổn định).

## 4. ⚠️ Xác nhận BẮT BUỘC trước khi bật — câu hỏi #4 `00-overview.md`

**Đọc lại toàn bộ `(main)/layout.tsx` + `guides/**`** để xác nhận `/guides` **không** có bất kỳ
điều kiện hiển thị theo role nào (vd nếu tương lai thêm "chỉ role X mới xem hướng dẫn settle
Type C") — nếu có, `'use cache'` sẽ cache **chung 1 bản cho mọi role**, có thể leak nội dung
staff-only cho role thấp hơn nếu không tách theo `cacheTag`/`cacheLife` đúng. Tại THỜI ĐIỂM viết
plan này (10/09/2026), `STAFF_GUIDE_MANIFEST` không filter theo role — nhưng phải re-confirm lúc
implement (code có thể đã đổi).

**Nếu tương lai guides có phân role:** dùng `cacheTag` theo role hoặc bỏ `'use cache'` ở phần đó,
không tự ý giữ cache chung.

## 4.1. ⚠️ Hệ quả mới phát hiện — `cacheComponents: true` tự validate MỌI route, không riêng `/guides`

Đọc `node_modules/next/dist/docs/.../instant-navigation.md` (bản `16.3.4` thật đang cài, xem
`p2-03` §1 để có bằng chứng đầy đủ): mặc định (`validationLevel: 'warning'`), việc bật
`cacheComponents: true` khiến Next **tự động validate MỌI Page/Default segment trong dev** — không
chỉ `/guides`. Vì `MainLayout` block (`requireOperatorSession()`/`cookies()` ngoài Suspense), dev
overlay CÓ THỂ hiện insight cảnh báo ở nhiều route khác (dashboard, Hub, ...) ngay khi bật flag ở
bước 3.1, dù plan này chỉ chủ đích thêm `'use cache'` cho `/guides`.

**Đây chỉ là cảnh báo dev-only, KHÔNG chặn build, KHÔNG đổi hành vi runtime** (xác nhận ở
`instant.md`: mức `'warning'` — *"the build is unaffected"*) — nhưng có thể gây nhiễu khi review PR
nếu không biết trước. Nếu nhiễu quá nhiều, thêm vào `next.config.ts`:

```ts
experimental: {
  instantInsights: { validationLevel: "manual-warning" },
},
```

để chỉ validate route có khai báo `instant` tường minh (hiện tại backoffice chưa khai báo `instant`
ở đâu, nên `manual-warning` tương đương "tắt validate hoàn toàn" cho tới khi `p2-03` quyết định dùng
`instant`). Quyết định bật cờ này để riêng cho lúc review PR thật — không cần quyết trước.

## 5. Test/Review

1. `pnpm --filter @megawin/backoffice check-types` xanh (Cache Components + `'use cache'` cần
   TypeScript hiểu directive — xác nhận Next 16.3 type support đã đủ, đọc lại
   `node_modules/next/dist/docs` nếu lỗi type lạ).
2. `pnpm --filter @megawin/backoffice build` — build phải qua được bước "collecting build traces" mà
   không lỗi liên quan `cacheComponents` (đây là điểm hay gãy khi bật lần đầu — Next in ra danh sách
   route KHÔNG tương thích nếu có).
2.1. Mở dev overlay ở 2-3 route NGOÀI `/guides` (dashboard, 1 trang Hub) ngay sau khi bật
   `cacheComponents: true` — xác nhận đúng dự đoán ở §4.1 (có thể có insight cảnh báo, KHÔNG phải
   lỗi cần fix trong plan này, chỉ ghi nhận làm bằng chứng tham khảo cho `p2-03`).
3. Chạy `pnpm --filter @megawin/backoffice dev`, vào `/guides` và `/guides/power655/resettle/type-a`:
   - Nội dung hiển thị đúng như trước (so sánh trực quan, không lệch chữ/hình).
   - Network tab: lần vào thứ 2 (cùng session, cùng doc) — kiểm tra có tận dụng cache (không phải
     tiêu chí bắt buộc pass/fail cứng, ghi nhận quan sát).
4. **Test đa session/role (bắt buộc, đúng rủi ro §4):** đăng nhập 2 tài khoản role khác nhau (nếu có
   sẵn tài khoản test), vào cùng 1 doc guides ở cả 2 session — xác nhận nội dung **giống nhau và
   đúng** (không có gì bị cache lẫn giữa 2 session, vì nội dung này KHÔNG phân quyền — nếu thấy khác
   nhau bất thường, đó là bug, phải điều tra trước khi merge).
5. Test các route KHÁC `/guides` (dashboard, operations-hub, 1 trang settle) — xác nhận **hành vi
   không đổi** sau khi bật `cacheComponents: true` ở config (vì chưa có `'use cache'` nào ở đó).
6. `pnpm lint` xanh.

## 6. Tác dụng kỳ vọng

| Trước | Sau |
|---|---|
| Mỗi lần vào `/guides/**`, Next vẫn coi là dynamic route (do layout), render lại từ đầu mỗi request | Phần nội dung doc được cache qua `'use cache'`, chỉ phần session-check của layout còn dynamic — vào lại doc đã xem nhanh hơn |
| Không có ranh giới rõ giữa "phần phải tươi" (session) và "phần tĩnh" (nội dung doc) trong cùng 1 route | Ranh giới rõ bằng Suspense boundary + `'use cache'` — pattern mẫu cho các route tĩnh khác sau này (nếu có) |

## 7. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Leak nội dung giữa session khác quyền (nếu tương lai guides có phân role mà quên bỏ `'use cache'`) | 🟡 (hiện tại 🟢 vì chưa phân role) | Test §5.4 bắt buộc mỗi lần deploy lại sau khi guides đổi cấu trúc phân quyền |
| Build fail do Cache Components chưa tương thích 1 phần khác của app | 🟢 | Bước build test §5.2 phát hiện sớm trước khi merge |
| Nhầm tưởng `cacheComponents: true` tự cache luôn Hub/settle | 🟢 | Đã xác nhận opt-in per-`'use cache'`, ghi rõ trong PR description để reviewer không hiểu nhầm |

## 8. Rollback

Xoá `cacheComponents: true` khỏi `next.config.ts` + xoá `'use cache'`/Suspense wrapper trong 2 file
guides (trả về đúng cấu trúc hàm cũ, gộp lại thành 1 async function không Suspense). Không migration,
không đổi schema — rollback tức thời.
