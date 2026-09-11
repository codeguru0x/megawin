# p2-02 — View Transitions cho layout content khi đổi route (polish, không correctness)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** không phụ thuộc chặt vào plan nào khác —
> có thể làm bất kỳ lúc nào **sau khi P1 ổn định** (theo `00-overview.md` §2: "làm bất kỳ lúc nào sau
> P1"). Không chặn, không bị chặn. **Rủi ro dữ liệu: KHÔNG** — thuần CSS/UX, không đụng data/cache.

## 1. Mục tiêu

Hiện tại chuyển route trong `(main)` là "cắt cứng" — nội dung cũ biến mất, nội dung mới xuất hiện
ngay (hoặc qua `loading.tsx` nếu route đó có, sau `p0-02`). React 19.2's `<ViewTransition>` cho phép
thêm animation morph/fade/slide mượt giữa 2 trạng thái DOM khi route đổi, tăng cảm giác "webapp" mà
**không đổi bất kỳ logic fetch/cache nào** — đây là lớp trang trí cuối cùng, cố ý làm SAU khi mọi thứ
về tốc độ/đúng dữ liệu (P0, P1) đã ổn định, để không lẫn nguyên nhân nếu có regression.

## 2. Phạm vi — CHỈ vùng content chính, không đụng chrome cố định

`(main)/layout.tsx` là nơi duy nhất cần sửa — bọc phần `{children}` (content thay đổi theo route)
bằng `<ViewTransition>`, **giữ nguyên** sidebar/header (không animate lại mỗi lần đổi route, chúng
không đổi DOM).

```tsx
// apps/backoffice/src/app/(main)/layout.tsx — minh hoạ, đọc file thật trước khi sửa để khớp cấu trúc
import { unstable_ViewTransition as ViewTransition } from "react";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  // ... giữ nguyên phần requireOperatorSession() + sidebar/header hiện có ...
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <main className="...">
          <ViewTransition>{children}</ViewTransition>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Lưu ý API:** React 19.2 tại thời điểm viết plan này export `unstable_ViewTransition` (chưa stable
API name) — xác nhận lại đúng tên export khi implement bằng cách đọc
`node_modules/react/index.js`/types thật trong repo (`react@19.2.8` theo phân tích ban đầu), không
copy tên export từ tài liệu cũ nếu đã đổi ở bản patch mới hơn.

## 3. CSS animation — dùng transition tối giản, không gây chú ý quá mức

```css
/* apps/backoffice/src/app/globals.css — thêm mới, không sửa rule cũ */

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 150ms; /* ngắn — đây là điều hướng công cụ vận hành, không phải marketing site */
}
```

**Nguyên tắc:** animation phải NGẮN (≤ 150-200ms) và không che khuất nội dung — mục tiêu là "cảm giác
liền mạch", không phải "hiệu ứng đẹp mắt làm chậm cảm nhận". Test với `prefers-reduced-motion` (staff
có thể đã tắt animation ở OS) — đảm bảo tôn trọng setting đó (React ViewTransition/CSS
`@media (prefers-reduced-motion: reduce)` tự tắt theo chuẩn, xác nhận lại bằng test tay §5.4).

## 4. Việc phải làm

1. Đọc `(main)/layout.tsx` hiện tại để xác định đúng vị trí bọc `{children}`.
2. Thêm `<ViewTransition>` theo §2.
3. Thêm CSS transition theo §3 vào `globals.css` (hoặc file CSS layout tương ứng nếu có tách riêng).
4. **Không** áp dụng `<ViewTransition>` lồng nhau ở cấp con (ví dụ trong từng page riêng) ở vòng đầu
   — chỉ 1 boundary ở layout gốc, tránh animation chồng animation gây giật.

## 5. Test/Review

1. `pnpm --filter @megawin/backoffice check-types` — xác nhận export `ViewTransition` tồn tại đúng
   tên trong version React đã cài (`react@19.2.8`), nếu lỗi type, kiểm tra lại tên export thật.
2. `pnpm --filter @megawin/backoffice dev`, chuyển qua lại giữa vài route khác nhau (dashboard →
   operations → reports) — quan sát trực quan: có animation mượt, KHÔNG giật/nhấp nháy, KHÔNG che
   mất nội dung quá lâu.
3. Test route có `loading.tsx` (sau `p0-02`) — xác nhận `ViewTransition` + `loading.tsx` **không xung
   đột** (animation áp dụng đúng lúc, không làm skeleton hiện sai thời điểm hoặc bị animation che).
4. **Test `prefers-reduced-motion`:** bật setting này ở OS (macOS: System Settings → Accessibility →
   Display → Reduce motion), chuyển route lại — xác nhận animation tắt hoặc giảm đáng kể, không ép
   staff xem hiệu ứng nếu họ đã tắt ở hệ thống.
5. Test trên route có nội dung dài/bảng lớn (vd `reports/settle` với nhiều dòng) — xác nhận animation
   không gây lag rõ rệt khi DOM lớn (đo bằng cảm quan; nếu cần số liệu, dùng Chrome Performance panel
   ghi 1 lần chuyển route, xem thời gian frame).
6. `pnpm lint` xanh cho `layout.tsx` + `globals.css`.
7. Test hồi quy nhanh: các luồng có `router.push` bên trong (submit form rồi chuyển trang, ví dụ sau
   khi lưu config) — xác nhận View Transition không làm mất state cần giữ (toast thông báo vẫn hiện
   đúng, không bị animation "cắt" giữa đường).

## 6. Tác dụng kỳ vọng

| Trước | Sau |
|---|---|
| Đổi route: nội dung cũ biến mất ngay lập tức, nội dung mới xuất hiện đột ngột | Có transition mượt 150ms — cảm giác liên tục hơn, giống app native |
| Không phân biệt được "trang đang tải" và "trang đã đổi xong" chỉ bằng UI (phải nhìn kỹ) | Animation tự thân là tín hiệu "đã chuyển trang", rõ ràng hơn cho user |

## 7. Rủi ro & vì sao KHÔNG ảnh hưởng dữ liệu

| Rủi ro | Đánh giá |
|---|---|
| Ảnh hưởng data/cache | Không — CSS + React rendering transition thuần, không chạm `fetch`/`useQuery`/Next cache |
| Ảnh hưởng performance nếu lạm dụng | Thấp nếu tuân §3 (animation ngắn, 1 boundary duy nhất) — theo dõi qua test §5.5 |
| Browser cũ không hỗ trợ View Transition API | React tự fallback (render không animation) nếu browser không hỗ trợ — không lỗi cứng, chỉ mất hiệu ứng |

## 8. Rollback

Xoá `<ViewTransition>` wrapper trong `layout.tsx` (trả `{children}` về render trực tiếp), xoá CSS
đã thêm trong `globals.css`. Không migration, không đụng logic nghiệp vụ — rollback tức thời, độc lập
hoàn toàn với mọi plan khác trong thư mục.
