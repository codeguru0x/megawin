# p2-02 — View Transitions qua `(main)/template.tsx` (polish, không correctness)

> **Phase:** P2 · **Status:** ✅ done · **Phụ thuộc:** không phụ thuộc chặt — làm bất kỳ lúc nào
> **sau khi P1 ổn định** (theo `00-overview.md` §2). Không chặn, không bị chặn.
> **Rủi ro dữ liệu: KHÔNG** — thuần CSS/UX, không đụng data/cache.
>
> **Điều tra 16/09/2026 — `startTime` là bug của Chrome DevTools, KHÔNG phải app (đã đóng):**
> Uncaught `Cannot read properties of undefined (reading 'startTime')` khi soft-nav phát sinh từ
> script **Live Metrics do chính Chrome DevTools inject**, không phải code app, không phải extension.
> Chuỗi bằng chứng:
> 1. HTML production (`curl https://www.mega68.xyz/login`) chỉ có `/_next/static/immutable/chunks/*` —
>    không có `vercel.live`, `feedback.js`, `speed-insights`. App cũng không import `web-vitals`,
>    không dùng `useReportWebVitals`; `rg 'web-vitals|SpeedInsights|onINP|onCLS' apps/backoffice` = 0 match.
> 2. Dòng 1 của script lỗi (`window.devToolsReportSoftNavs = true;`) khớp đúng
>    `devtools-frontend/front_end/models/live-metrics/LiveMetrics.ts:588`:
>    `` const source = `window.devToolsReportSoftNavs = ${softNavsSettingValue};\n` + await InjectedScript.get(); ``
> 3. Đoạn crash khớp `web-vitals-injected/spec/spec.ts` → `createInpChangeEvent`. Bản trong Chrome của
>    máy đang test đọc `t.entries[0].startTime` (không optional-chaining); `main` hiện tại đã là
>    `metric.entries?.[0]?.startTime` — tức đã vá.
> 4. Commit vá: `6a47f93` "Live Metrics: Handle empty INP entries" (31/08/2026). Nguyên nhân gốc là
>    commit "Enable soft navs for Live Metrics" (24/07/2026) bật `reportSoftNavs` → `onINP` fire với
>    `entries` rỗng ở soft-nav.
>
> Script này inject qua `addScriptToEvaluateOnNewDocument` vào **isolated world**
> (`LIVE_METRICS_WORLD_NAME`) → không thể ảnh hưởng JS của app, và **chỉ chạy khi DevTools mở** —
> user thật không bao giờ thấy. Cách dứt lỗi: update Chrome, hoặc tắt DevTools setting
> "Enable soft navigation performance monitoring" (`timeline-enable-soft-navigations`).
> Kết luận: giữ `<ViewTransition>`; rollback trước đó đã hoàn tác.
> **Nguồn API:** `next@16.3.5` guide `view-transitions.md` + `template.md` + `react@19.3.0`
> (`ViewTransition` đã ổn định — xác nhận bằng `Object.keys(require('react'))`).

## 1. Mục tiêu

Hiện tại chuyển route trong `(main)` là "cắt cứng" — nội dung cũ biến mất, nội dung mới xuất hiện
ngay (hoặc qua `loading.tsx` nếu route đó có, sau `p0-02`). React 19 `<ViewTransition>` cho phép
thêm animation morph/fade giữa 2 trạng thái DOM khi route đổi, tăng cảm giác "webapp" mà
**không đổi bất kỳ logic fetch/cache nào** — lớp trang trí cuối cùng, cố ý làm SAU khi mọi thứ
về tốc độ/đúng dữ liệu (P0, P1) đã ổn định.

## 2. ⚠️ Sửa lỗi thiết kế bản cũ — KHÔNG đặt trong `layout.tsx`

Bản đầu (10/09) đề xuất bọc `{children}` trong `(main)/layout.tsx`. **SAI** theo guide chính thức
`view-transitions.md` (Next 16.3.5):

> *"Put the wrapper in each `page.tsx`, not the layout. Layouts persist across navigations, so
> enter and exit never fire there."*

Đặt trong layout → enter/exit **không bao giờ chạy** — animation vô hiệu, chỉ tốn wrapper.

### 2.1. Vì sao chọn `template.tsx` thay vì sửa từng `page.tsx`

Guide chính thức dùng từng `page.tsx` vì ví dụ demo chỉ có vài route. Backoffice có **~84 route**
dưới `(main)` — sửa từng page là chắp vá, dễ sót, khó rollback.

`template.md` (file convention Next) xác nhận template:

- Nhận `key` riêng theo route segment → remount mỗi lần điều hướng ở segment đó.
- Mục đích chính thức gồm: reset state Client Components, re-sync `useEffect`, và
  *"Suspense boundaries inside layouts only show a fallback on first load, while templates show
  it on every navigation."*

→ `(main)/template.tsx` bọc `<ViewTransition>` **một lần** cover mọi page con, đúng convention,
không chắp vá.

### 2.2. Pattern motion — Suspense reveal + crossfade, KHÔNG directional slide

Áp Step 2 (Suspense reveal) + Step 4 (same-route / content crossfade) của `view-transitions.md`.

**Không** dùng Step 3 (directional `nav-forward` / `nav-back`):

- Backoffice là sidebar nav **phẳng** — 84 route không có hệ thống cấp bậc "đi sâu / quay lại" rõ.
- Guide cảnh báo: *"violating it feels disorienting"* khi gán hướng sai.
- Gán `transitionTypes` cho ~91 `<Link>` sidebar là scope lớn, dễ sai, không tỷ lệ với mục polish.

## 3. Việc phải làm

### 3.1. Tạo `apps/backoffice/src/app/(main)/template.tsx`

```tsx
import type { ReactNode } from "react";
import { ViewTransition } from "react";

/**
 * Remount theo route segment — bọc content bằng ViewTransition để enter/exit fire đúng.
 * KHÔNG đặt ViewTransition trong layout.tsx (layout persist → enter/exit không chạy).
 * Sidebar/header nằm ở layout → không animate lại mỗi lần đổi route.
 */
export default function MainTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter="auto"
      exit="auto"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
```

**API:** `import { ViewTransition } from "react"` — tên ổn định ở `react@19.3.0`.
**KHÔNG** dùng `unstable_ViewTransition` (đã bỏ).

### 3.2. CSS — ngắn, tôn trọng `prefers-reduced-motion`

Thêm vào `apps/backoffice/src/app/globals.css` (hoặc file CSS layout tương ứng nếu đã tách):

```css
/* View Transitions — backoffice content (p2-02). Ngắn: điều hướng công cụ, không marketing. */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 150ms;
}

::view-transition {
  pointer-events: none; /* giữ click được trong lúc transition (guide chính thức) */
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

**Nguyên tắc:** ≤ 150–200ms. Mục tiêu "liền mạch", không "hiệu ứng đẹp làm chậm cảm nhận".

### 3.3. KHÔNG sửa `layout.tsx` trong plan này

Chrome cố định (sidebar, header, providers) giữ nguyên ở layout. Chỉ thêm 1 file `template.tsx` + CSS.

### 3.4. State phải persist ở layout/context — không lọt vào cây template

Vì template remount theo thiết kế, mọi state client cần giữ qua điều hướng (search dialog mở,
AI panel, sidebar collapse đã có cookie, QueryClient, …) **phải** nằm trong `layout.tsx` /
provider — đã đúng hiện tại. Checklist §5 bắt buộc verify lại trước merge.

## 4. Việc KHÔNG làm ở vòng đầu

- Không lồng `<ViewTransition>` thêm ở từng page (tránh animation chồng).
- Không `transitionTypes` / directional slide.
- Không shared-element morph (không có cặp thumbnail↔hero trong backoffice ops).

## 5. Test/Review

1. `pnpm --filter @megawin/backoffice check-types` — `ViewTransition` resolve đúng từ `"react"`.
2. `pnpm --filter @megawin/backoffice dev` — chuyển dashboard → operations → reports: crossfade
   ~150ms, không giật, không che nội dung lâu.
3. Route có `loading.tsx` (sau `p0-02`): ViewTransition + skeleton **không xung đột**.
4. **`prefers-reduced-motion`:** bật Reduce motion (macOS Accessibility) → animation tắt / 0s.
5. Route DOM lớn (`reports/settle`): không lag rõ (cảm quan; Chrome Performance nếu nghi ngờ).
6. **State persist (bắt buộc — rủi ro template remount):**
   - Mở SearchDialog / gõ vài ký tự → đổi route → xác nhận state dialog/sidebar **không** bị reset
     sai (providers ở layout vẫn giữ).
   - AI panel mở → đổi route → panel vẫn mở (state từ cookie + provider ở layout).
   - React Query cache vẫn còn (QueryProvider ở layout).
7. `router.push` sau submit form (lưu config): toast vẫn hiện, không bị cắt giữa đường.
8. `pnpm lint` xanh cho `template.tsx` + CSS.

## 6. Tác dụng kỳ vọng

| Trước | Sau |
|---|---|
| Đổi route: cắt cứng | Crossfade ~150ms — liền mạch hơn |
| Plan cũ đặt VT trong layout → enter/exit không fire | `template.tsx` remount → enter/exit chạy đúng docs |

## 7. Rủi ro

| Rủi ro | Đánh giá |
|---|---|
| Data/cache | Không — CSS + React transition thuần |
| Performance DOM lớn | Thấp nếu ≤150ms, 1 boundary — theo dõi §5.5 |
| Browser không hỗ trợ View Transition API | React fallback không animation — không lỗi cứng |
| Remount template làm mất state | Thấp nếu state ở layout — bắt buộc test §5.6 |

## 8. Rollback

Xoá `apps/backoffice/src/app/(main)/template.tsx` + xoá CSS đã thêm. **Không** đụng `layout.tsx` —
rollback tức thời, cô lập hơn bản plan cũ.
