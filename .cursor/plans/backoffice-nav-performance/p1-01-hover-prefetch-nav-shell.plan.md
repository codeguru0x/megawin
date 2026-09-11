# p1-01 — `HoverPrefetchLink` cho nav shell (pilot → đo → rollout)

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc CỨNG:** `p0-01` phải xong + verify Network tab
> (không làm plan này trước — đây chính là thứ tự đã gây sự cố `/ai` 04/09) · Nên có `p0-02` xong trước
> để đo hiệu ứng tổng hợp (loading skeleton + hover prefetch cùng lúc)

## 1. Mục tiêu

Sidebar hiện tại (`nav-main.tsx`, `nav-user.tsx`, và các nơi khác — tổng **84 chỗ** `prefetch={false}`
trong `apps/backoffice/src`) chặn cứng mọi prefetch → mỗi click là 1 request RSC mới từ đầu, không có
cảm giác "app" (giống site tĩnh nhiều trang). Mục tiêu: chuyển sang **prefetch theo chủ đích** (hover
≥ ~100ms hoặc focus) — vẫn giữ được lợi ích tránh storm của `prefetch={false}`, nhưng thêm lại tốc độ
khi user *thực sự có ý định* điều hướng.

**Không dùng lại pattern đã gây sự cố `/ai`:** không tự gọi `router.prefetch()` trực tiếp trong
`onMouseEnter` với logic tự viết dedupe tay. Dùng đúng pattern chính thức Next docs gọi là
`HoverPrefetchLink` — **chỉ đổi giá trị prop `prefetch`** giữa `false` (mặc định, không hover) và
`null` (auto — để Next tự quyết theo `loading.js`/static) khi hover, không tự gọi imperative API.

## 2. Component mới — `HoverPrefetchLink`

Tạo tại `apps/backoffice/src/components/hover-prefetch-link.tsx`:

```tsx
"use client";

/**
 * `<Link>` chỉ prefetch khi user thực sự có ý định điều hướng (hover ≥ 100ms hoặc focus bàn phím),
 * KHÔNG prefetch ngay khi mount như `prefetch={true}`, KHÔNG bao giờ tắt hẳn như `prefetch={false}`.
 *
 * Vì sao không tự gọi `router.prefetch()` trong `onMouseEnter` (đã thử và revert ở
 * `chat-header.tsx`, xem `p0-01`): cách đó là imperative API, tự chịu trách nhiệm dedupe/cancel.
 * Component này chỉ đổi PROP `prefetch` của `<Link>` — Next tự dedupe theo href, tự cache theo
 * `staleTimes.dynamic` (đã set 30s ở `p0-01`). An toàn hơn vì đi đúng qua cơ chế khai báo của Next,
 * không viết lại state machine prefetch bằng tay.
 *
 * HOVER_DELAY_MS = 100 — đủ để lọc bỏ hover "quét ngang qua" (mouse di chuyển tới link khác),
 * đủ ngắn để vẫn kịp prefetch trước khi user click thật (thời gian trung bình từ hover tới click
 * của thao tác trỏ chuột có chủ đích là ~200-300ms).
 */

import { useRef, useState } from "react";

import Link, { type LinkProps } from "next/link";

const HOVER_DELAY_MS = 100;

interface HoverPrefetchLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  target?: string;
}

export function HoverPrefetchLink({ children, ...props }: HoverPrefetchLinkProps) {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startTimer = () => {
    timerRef.current = setTimeout(() => {
      setActive(true);
    }, HOVER_DELAY_MS);
  };

  const clearTimer = () => {
    clearTimeout(timerRef.current);
  };

  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={startTimer}
      onMouseLeave={clearTimer}
      onFocus={startTimer}
      onBlur={clearTimer}
      onTouchStart={() => setActive(true)} // mobile: touchstart là tín hiệu ý định rõ nhất
    >
      {children}
    </Link>
  );
}
```

**`target="_blank"`:** giữ `prefetch={false}` cứng, KHÔNG dùng `HoverPrefetchLink` — prefetch cho tab
mới lãng phí hoàn toàn (theo ma trận §5 của analysis doc).

## 3. Phạm vi pilot (KHÔNG rollout 84 chỗ cùng lúc)

| Vòng | Phạm vi | Số chỗ | Lý do chọn |
|---|---|---|---|
| **Pilot** | `nav-main.tsx` — 7 group header game (Keno, Bingo18, Lotto535, Mega645, Power655, Max3D, Max3DPro) + sub-item **operations**/**operations-hub** của mỗi game | ~14 | Route đã có `loading.tsx` (`p0-02` T1) → so sánh công bằng, traffic cao nhất nên dễ thấy hiệu ứng lẫn tác dụng phụ |
| **Rollout 1** | Còn lại `nav-main.tsx` (draws, reports, config, jackpot subitems) | ~40 | Sau khi pilot xanh ≥ 3 ngày thật |
| **Rollout 2** | Nav khác ngoài `nav-main.tsx` (breadcrumb, account switcher, quick links…) — grep `prefetch={false}` ngoài file này | ~30 | Sau rollout 1, review riêng vì context khác (không phải sidebar cố định) |

## 4. Việc phải làm (Pilot)

1. Tạo `hover-prefetch-link.tsx` theo §2.
2. Trong `nav-main.tsx`, đổi **CHỈ** 2 vị trí `<Link prefetch={false} href={item.url as Route} ...>`
   ứng với group header 7 game trong `NavItemExpanded` (nhánh `!item.subItems` — game có
   operations-hub thì item chính không có subItems) và item con "Operations"/"Operations Hub" trong
   `subItems.map`, còn lại giữ `prefetch={false}` y nguyên. Đổi thành:
   ```tsx
   <HoverPrefetchLink href={item.url as Route} target={item.newTab ? "_blank" : undefined}>
     {item.icon && <item.icon />}
     <span>{item.title}</span>
     {item.comingSoon && <IsComingSoon />}
   </HoverPrefetchLink>
   ```
   giữ nguyên `asChild` trên `SidebarMenuButton` cha (Radix Slot vẫn nhận `HoverPrefetchLink` như
   1 child hợp lệ vì nó render ra `<a>` cuối cùng qua `<Link>`).
3. **Không đổi** `NavItemCollapsed` (dropdown khi sidebar thu gọn) ở vòng pilot — thêm ở rollout 1 nếu
   pilot ổn, để giảm biến số cần đo.

## 5. Test/Review — đo bằng Network tab TRƯỚC khi rollout (bắt buộc, đây là câu hỏi #2 ở `00-overview.md`)

1. **Baseline (trước khi đổi code):** Network tab, filter `_rsc`, hover qua lại 7 group header hiện
   tại (đang `prefetch={false}`) — xác nhận **0 request** khi hover (đúng hành vi hiện tại).
2. Áp code §4. `pnpm --filter @megawin/backoffice check-types` xanh.
3. `pnpm --filter @megawin/backoffice dev`, mở Network tab, filter `_rsc`:
   - Hover 1 group header, giữ ≥ 100ms → kỳ vọng **đúng 1 request** RSC xuất hiện.
   - Rời chuột trước 100ms (hover lướt qua) → kỳ vọng **0 request**.
   - Hover đi hover lại CÙNG 1 link trong vòng 30s (TTL `staleTimes.dynamic` từ `p0-01`) → kỳ vọng
     **0 request thêm** (cache hit) — đây chính là test đã fail ở sự cố `/ai`, phải xanh lần này.
   - Hover 14 link pilot theo thứ tự nhanh (di chuột lướt qua sidebar từ trên xuống, dừng lại đúng
     100ms mỗi link) → đếm tổng request, kỳ vọng ≈ số link đã dừng đủ lâu, KHÔNG có storm (không có
     request > số lần hover thật).
   - Đợi > 30s rồi hover lại 1 link đã hover trước đó → kỳ vọng có **1 request mới** (cache đã hết
     TTL, đúng thiết kế — không phải bug).
4. Test blur khỏi tab (đổi sang tab khác trình duyệt) khi timer đang chạy — xác nhận `onBlur`/
   component unmount không giữ timer treo (không leak, dùng React DevTools Profiler hoặc console log
   tạm để xác nhận cleanup).
5. Click thật vào 1 link đã hover-prefetch — xác nhận chuyển trang **không tạo thêm request** (đã
   dùng cache), thời gian chuyển trang cảm giác nhanh hơn rõ rệt so với trước (subjective, nhưng nên
   note lại trong PR).
6. Dán ảnh Network tab (baseline vs sau khi đổi) vào PR.
7. `pnpm lint` xanh cho `hover-prefetch-link.tsx` + `nav-main.tsx`.

## 6. Tiêu chí để tiến sang Rollout 1/2

- [ ] Pilot chạy thật trên môi trường dev/staging ≥ 3 ngày làm việc, không có report "trang bị lag"
      hoặc "load liên tục" nào liên quan tới sidebar.
- [ ] Network tab không cho thấy request storm ở bất kỳ thời điểm nào trong 3 ngày (kiểm tra qua log
      server nếu có, hoặc theo dõi thủ công).
- [ ] Không phát sinh warning React (`act warnings`, memory leak timer) trong console khi dùng bình
      thường.

Chỉ khi đủ 3 tiêu chí trên mới áp dụng `HoverPrefetchLink` cho Rollout 1 (còn lại `nav-main.tsx`),
theo đúng cùng khuôn thay thế ở §4.2, lặp lại đúng bộ test §5 sau khi rollout (không bỏ bước đo).

## 7. Rủi ro & vì sao không ảnh hưởng dữ liệu

| Rủi ro | Đánh giá |
|---|---|
| Prefetch kéo theo server work (session check, layout) mỗi lần hover | Đã có `staleTimes.dynamic = 30s` (`p0-01`) dedupe — hover lặp lại trong 30s không tạo thêm request. Server work chỉ tốn khi hover THẬT (có chủ đích), thấp hơn nhiều so với `prefetch={true}` mount-time. |
| Prefetch RSC có kéo theo data API (RQ) không? | **Không.** RSC prefetch chỉ tải shell/JS route (layout, page skeleton nếu route là `"use client"` thì page component gần như rỗng phần RSC). Trang thật vẫn phải chờ `useQuery` chạy khi mount — không có rủi ro "data cũ hiện ra do prefetch". |
| Người dùng bàn phím (Tab để focus) có bị prefetch dư không? | Có, nhưng cùng rủi ro thấp như hover — `onBlur` clear timer nếu Tab tiếp qua nhanh. |

## 8. Rollback

Đổi `HoverPrefetchLink` trở lại `<Link prefetch={false}>` ở đúng các vị trí đã sửa (diff nhỏ, dễ
`git revert` theo từng vòng pilot/rollout độc lập). Xoá file `hover-prefetch-link.tsx` nếu rollback
toàn bộ. Không có migration, không đụng API/DB.
