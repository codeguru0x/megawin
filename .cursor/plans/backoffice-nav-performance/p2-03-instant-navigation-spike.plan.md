# p2-03 — Spike: khả năng áp dụng `instant` (Instant Navigation, Next 16.3) cho backoffice

> **Phase:** P2 (dạng SPIKE — nghiên cứu có giới hạn thời gian, KHÔNG phải commit rollout) ·
> **Status:** ⏳ pending · **Phụ thuộc:** `p2-01` xong trước (cần `cacheComponents: true` đã bật + đã
> quen quy trình `'use cache'`/Suspense trên `/guides`) · **KHÔNG chặn** plan nào khác — đây là
> nhánh khám phá, có thể kết luận "không làm ở giai đoạn này" mà vẫn coi là hoàn thành plan.
> **Nguồn:** đọc TRỰC TIẾP file docs trong `node_modules/.pnpm/next@16.3.4.../next/dist/docs/`
> (chính bản `next` mà `apps/backoffice` cài — xác nhận version bằng
> `node -e "console.log(require('next/package.json').version)"` → `16.3.4`), ngày 11/09/2026.

## 0. ⚠️ Sửa lại toàn bộ so với bản đầu — bản đầu tra sai version

Bản đầu của plan này (10/09/2026) tra Context7 `/vercel/next.js` ở `v16.2.9` vì Context7 lúc đó
không có sẵn `16.3.4`. Khi người dùng hỏi lại "sao kiểm tra bản cũ", đã đọc trực tiếp docs THẬT nằm
sẵn trong `node_modules` của repo (đúng bản `16.3.4` đang cài) — phát hiện **API đã đổi tên và đổi
hành vi** giữa 2 bản. Toàn bộ nội dung dưới đây viết lại từ docs thật, không phải suy đoán.

| Sai ở bản đầu | Đúng theo `16.3.4` thật |
|---|---|
| Tên export: `unstable_instant` | **`instant`** — đã bỏ tiền tố `unstable_`, xem `instant.md` §Version History: `v16.x.x` — "introduced (Cache Components only)" |
| Shape: `{ prefetch: "static" }` | Chỉ nhận `true \| false \| { level: 'warning' }` — **không có** field `prefetch` nào trong `instant` |
| "Next validate ... fail build" | Mức `'warning'` (mặc định) **chỉ cảnh báo trong dev overlay, KHÔNG chặn `next build`**. Chưa có mức nào chặn build ở `16.3.4` — đọc `instant.md` §`level`: *"'warning': Validates in development only... the build is unaffected"* — chỉ 1 level tồn tại hiện tại |
| Ngụ ý phải khai báo `instant` mới có validate | **Sai — quan trọng nhất:** mặc định (`validationLevel: 'warning'`), Cache Components tự validate **MỌI Page/Default segment**, không cần khai báo `instant` tường minh (xem §1) |

## 1. Phát hiện quan trọng nhất — validate tự động, không cần khai báo `instant`

Đọc `instant-navigation.md` + `instant.md`:

> *"By **default** (`validationLevel: 'warning'`), Cache Components apps validate every Page and
> Default segment in development."*

Nghĩa là: **chỉ cần `cacheComponents: true` được bật (việc `p2-01` làm)**, Next sẽ tự động chạy
validate ở dev cho **mọi route Page/Default trong toàn app**, không riêng `/guides`. Đây là hệ quả
`p2-01` cần biết TRƯỚC khi bật, không phải chờ tới `p2-03` mới phát hiện — xem việc cần bổ sung ở §5.

Muốn tắt auto-validate toàn app, đổi sang `manual-warning` (chỉ validate route có khai báo `instant`
tường minh):

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
};
```

## 2. `instant` là gì — tóm tắt đúng từ `instant.md` + `instant-navigation.md`

```tsx
// page.tsx hoặc layout.tsx — CHỈ Server Component, KHÔNG dùng được trong Client Component
export const instant = true; // hoặc: false | { level: "warning" }
```

- **`true`**: opt-in validate ở mức global đang cấu hình (mặc định `'warning'`, dev-only).
- **`false`**: opt-out — segment được phép block khi navigate vào, Next không báo insight cho nó
  nữa. Dùng khi 1 layout cha không thể/không cần instant nhưng page con vẫn muốn được validate
  (`instant = false` ở layout cha, `instant = true` ở page con — page con vẫn validate được, `false`
  ở cha KHÔNG tự động ép `false` xuống con).
- **Điều kiện bắt buộc:** `instant` **chỉ hoạt động khi `cacheComponents` đã bật** — nếu chưa, dùng
  `instant` sẽ lỗi. Không dùng được trong Client Component (`"use client"`).
- Fix gợi ý khi validate fail: `'use cache'` (cache hoá phần block) hoặc bọc `<Suspense>` (đẩy phần
  block vào fallback, không chặn shell còn lại).

## 3. Áp dụng được không cho backoffice? — Có, nhưng có 1 rào cản cụ thể (không đổi so với bản đầu)

**Rào cản duy nhất nhưng lớn:** `apps/backoffice/src/app/(main)/layout.tsx` (`MainLayout`) hiện là
1 hàm `async` chặn cứng ngay từ dòng đầu:

```typescript
const session = await requireOperatorSession(); // ← blocking, ngoài Suspense
const cookieStore = await cookies();             // ← blocking
const [variant, collapsible, aiPanelState, aiPanelWidthRaw] = await Promise.all([...]); // ← blocking
```

Layout này áp dụng cho **cả 84 route** dưới `(main)` — theo §1, validate tự động sẽ chỉ tay vào
`MainLayout` cho **mọi route**, không riêng route nào bật `instant` tường minh.

## 4. Việc phải làm — ĐÚNG NGHĨA "spike", có deadline quyết định, không lan sang refactor lớn ngay

### 4.1. Bước 1 — quan sát validate tự động NGAY khi `p2-01` bật `cacheComponents` (không cần chờ)

Vì §1 cho biết validate chạy tự động cho MỌI route, bước quan sát này thực ra nên làm **ngay trong
`p2-01`**, không cần đợi riêng `p2-03`:

1. Sau khi `p2-01` bật `cacheComponents: true`, chạy `pnpm --filter @megawin/backoffice dev`.
2. Vào vài route dưới `(main)` (không chỉ `/guides` — thử cả `/dashboard`, `1 trang Hub`) — đọc dev
   overlay, xác nhận Next có báo insight chỉ vào `MainLayout` hay không.
3. Chụp lại lỗi thật (không suy đoán) — đây là bằng chứng quyết định bước tiếp theo.
4. Nếu overlay báo ồn ào ở NHIỀU route ngoài `/guides` (nhiễu không mong muốn cho pilot `p2-01` chỉ
   scope `/guides`) → set `experimental.instantInsights.validationLevel = "manual-warning"` trong
   `next.config.ts` ngay ở `p2-01` để giữ đúng scope pilot (chỉ validate route có khai báo `instant`
   tường minh) — **cập nhật ngược lại `p2-01` §3.1 nếu bước này xác nhận cần**.

### 4.2. Bước 2 — thử khai báo `instant = true` cho `/guides` (nếu bước 1 không đủ thông tin)

```tsx
// apps/backoffice/src/app/(main)/guides/[...slug]/page.tsx — CHỈ để thử, xoá ngay sau khi lấy bằng chứng
export const instant = true;
```

Vào `/guides/power655/resettle/type-a`, đọc lỗi/insight trong dev overlay — kỳ vọng: chỉ tay vào
`MainLayout` (`requireOperatorSession()`/`cookies()`), xác nhận đúng giả thuyết §3.

**Xoá dòng `instant` vừa thêm ngay sau khi lấy bằng chứng** — bước này chỉ để lấy thông tin, không
giữ lại code thử nghiệm trong nhánh chính.

### 4.3. Bước 3 — QUYẾT ĐỊNH dựa trên kết quả bước 1+2 (không tự động đi tiếp)

| Kết quả | Hành động |
|---|---|
| Lỗi đúng như dự đoán, chỉ vào `MainLayout` | Đánh giá effort refactor layout (§6) — nếu team đồng ý effort/risk chấp nhận được, mở plan mới `p3-01-instant-navigation-layout-refactor` (phase P3, cần approval rõ ràng trước khi làm vì đụng auth flow của TOÀN app) |
| Lỗi khác dự đoán (ví dụ chỉ vào chỗ khác, hoặc không có lỗi) | Ghi lại phát hiện mới, cập nhật §3 — có thể phạm vi hẹp hơn tưởng, xem xét áp dụng ngay cho `/guides` nếu rào cản thực tế nhỏ hơn |
| Validate ồn ào ở nhiều route ngoài scope, gây khó review PR `p2-01` | Set `manual-warning` theo §4.1 bước 4 — không coi là lý do dừng, chỉ là điều chỉnh cấu hình |

**Plan này COI LÀ XONG khi có kết luận rõ ràng ở bảng trên — không bắt buộc phải "làm cho ra Instant
Navigation" mới coi là hoàn thành.** Đây là điểm khác biệt với các plan khác trong thư mục.

## 5. Việc CẦN bổ sung ngược lại vào `p2-01` trước khi thực hiện `p2-01`

Vì phát hiện ở §1 (validate tự động toàn app khi bật `cacheComponents`, không riêng `/guides`),
người thực hiện `p2-01` cần đọc thêm mục này của `p2-03` trước khi bật flag — không phải một bất ngờ
khi mở dev overlay sau đó. Cụ thể: bước `p2-01` §5 (Test/Review) nên thêm 1 dòng — mở dev overlay ở
2-3 route NGOÀI `/guides` (dashboard, 1 trang Hub) ngay sau khi bật `cacheComponents: true`, xác nhận
hành vi RUNTIME không đổi (đã có ở `p2-01` §5.5) **và** ghi nhận insight cảnh báo (nếu có) là *bằng
chứng tham khảo cho `p2-03`*, không phải lỗi cần fix ngay trong `p2-01` (`p2-01` chỉ scope `/guides`).

## 6. Vì sao đây LÀ P2/P3 (không phải P0/P1) — đánh giá ROI thẳng thắn

Sau khi đọc kỹ `MainLayout`, nhận ra: refactor để hết chặn (defer `requireOperatorSession()` +
4 cookie reads bằng Suspense, theo đúng pattern Next docs "Deferring `cookies()` access") có 2 vấn đề
lớn hơn effort thuần kỹ thuật:

1. **Đụng auth gate của TOÀN app (84 route).** `requireOperatorSession()` hiện đang redirect nếu
   chưa đăng nhập, TRƯỚC khi render bất kỳ UI nào. Nếu defer bằng Suspense, **shell** (sidebar rỗng,
   khung layout) sẽ render TRƯỚC khi biết user có hợp lệ hay không — cần review bảo mật kỹ (dữ liệu
   thật vẫn an toàn vì API luôn tự check quyền riêng, nhưng UI framework/chrome lộ ra sớm hơn là thay
   đổi hành vi cần sign-off, không tự quyết một mình).
2. **ROI đã bị `p0-01` lấy phần lớn.** Phát hiện quan trọng nhất khi audit `MainLayout` (xem
   `p0-01` §1.1): phần lớn "chi phí chậm" khi điều hướng là do `staleTimes.dynamic = 0` (default)
   khiến Next chạy lại TOÀN BỘ `MainLayout` (session + cookie reads) ở **mọi click**, không phải vì
   thiếu Instant Navigation. Sau khi `p0-01` nâng `dynamic` lên 60s, phần lớn lợi ích "không phải
   chờ" mà Instant Navigation nhắm tới **đã đạt được** ở mức thấp rủi ro hơn (không đụng auth flow,
   không cần Suspense hoá session).
3. **Instant Navigation cần CẢ 2 flag để phát huy đầy đủ** (đọc `instant-navigation.md` §Quick
   start): `cacheComponents: true` **và** `partialPrefetching: true`. `partialPrefetching` mới có từ
   `v16.3.0` (`partialPrefetching.md` §Version History) — chưa nằm trong scope bất kỳ plan nào ở
   `00-overview.md` hiện tại. Thêm 1 flag nữa nghĩa là thêm 1 lớp thay đổi hành vi `<Link prefetch>`
   toàn app cần pilot riêng, không nên gộp vào spike này.

**Kết luận:** Instant Navigation là công cụ ĐÚNG về mặt kỹ thuật cho use-case này, nhưng effort/risk
để lấy phần ROI **còn lại** (sau khi đã có `p0-01`+`p1-01`+`p0-02`) không rõ ràng lớn hơn rủi ro đụng
auth gate của cả app. Vì vậy plan này dừng ở mức **spike xác nhận giả thuyết + quyết định có/không**,
không cam kết refactor ngay.

## 7. Test/Review

1. Bước 4.1 + 4.2 tự nó là test — output là 1-2 ảnh chụp dev overlay thật (hoặc xác nhận không có
   insight nào).
2. Nếu tiến tới `p3-01` (do quyết định ở §4.3) — plan đó phải có review bảo mật riêng (không nằm
   trong phạm vi `p2-03`), tối thiểu: xác nhận `ClientAccountGuard` (client component bọc ngoài) có
   tự redirect độc lập nếu server chưa xác thực xong hay không — đọc `client-account-guard.tsx`
   trước khi thiết kế `p3-01`.
3. `git diff` sau khi hoàn thành `p2-03` phải **rỗng** ở nhánh chính (bước 4.2 chỉ thử tạm rồi xoá) —
   kết quả của plan này là 1 quyết định + ảnh chụp bằng chứng, ghi vào PR/issue, không phải code diff.
   (Ngoại lệ: nếu §4.1 bước 4 xác nhận cần `manual-warning`, dòng đó ĐƯỢC giữ lại trong `next.config.ts`
   vì nó thuộc scope `p2-01`, không phải scope thử nghiệm riêng của `p2-03`.)

## 8. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Validate tự động (§1) gây nhiễu dev overlay ở route ngoài `/guides` khi `p2-01` bật `cacheComponents` | 🟡 | Đã có hướng xử lý ở §4.1 bước 4 (`manual-warning`) — không phải bug, chỉ cần biết trước |
| Nhầm lẫn "đã thử = đã áp dụng" | 🟢 | §4.2 bắt buộc xoá code thử nghiệm, không để sót trong nhánh chính |
| `instant` mới giới thiệu ở `16.x.x`, chỉ có 1 validation level (`'warning'`) — có thể đổi ở minor version sau | 🟡 | Đây là lý do chỉ spike, không rollout; theo dõi changelog Next trước khi mở `p3-01` |

## 9. Rollback

Không có gì để rollback nếu tuân đúng §4.2 (xoá thử nghiệm ngay sau khi lấy bằng chứng). Nếu lỡ merge
nhầm dòng `instant` thử nghiệm, xoá 1 dòng đó. Nếu đã set `manual-warning` theo §4.1 bước 4 và muốn
rollback, xoá field `experimental.instantInsights` khỏi `next.config.ts` (validate tự động toàn app
trở lại mức mặc định `'warning'`).
