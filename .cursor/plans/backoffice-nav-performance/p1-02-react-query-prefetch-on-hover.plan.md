# p1-02 — `queryClient.prefetchQuery` on hover cho 4-5 route nóng

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** `p1-01` nên xong trước (dùng chung cơ chế
> hover-intent, tránh 2 timer khác nhau trên cùng 1 link) · Nên làm sau/cùng `p1-03` (cần đúng
> `staleTime` đã chuẩn hoá trước khi quyết định prefetch bao lâu 1 lần)

## 1. Mục tiêu — khác `p1-01` ở tầng nào

`p1-01` làm ấm **shell** (RSC/JS route). Route đích vẫn là `"use client"` với `useQuery` riêng — khi
trang mount, `useQuery` mới bắt đầu gọi API, user vẫn thấy loading state của chính query đó (skeleton
nội bộ trang, không phải `loading.tsx`). Plan này làm ấm **luôn cả data** bằng
`queryClient.prefetchQuery` cùng lúc với hover-prefetch shell — khi user click, `useQuery` mount thấy
cache đã có sẵn (`initialData` hiệu quả), hiện data ngay, không có khoảng loading nào cả.

## 2. Phạm vi — đúng 4 route nóng nhất (không làm tràn lan)

Chọn theo tiêu chí: (a) traffic cao nhất trong nav, (b) đã có sẵn `useQuery` hook export rõ ràng dễ
tái dùng `queryFn`, (c) đại diện đủ 3 dạng data (today snapshot, live poll, aggregate report):

| # | Route | Hook có sẵn | Query key | `staleTime` hiện tại |
|---|---|---|---|---|
| 1 | `/dashboard` | `useDashboardKpis`, `useDashboardJackpots`, `useDashboardDraws`, `useDashboardOutstanding` (`_lib/use-dashboard-queries.ts`) | `dashboardKeys.*` | 60s / 0 / 0 / 0 (poll 30s-2m) |
| 2 | `/games/bingo18/operations-hub` | `useHubQuery` (`_lib/use-hub-query.ts`) | `bingo18Keys.opsHub()` | = `pollSeconds` server trả (mặc định 10s) |
| 3 | `/games/keno/operations-hub` | tương tự Bingo18 (cùng pattern hub) | `kenoKeys.opsHub()` | tương tự |
| 4 | `/reports/outstanding` (system-level, khác `/dashboard` outstanding — kiểm tra lại hook đúng khi
      implement, có thể trùng `dashboardKeys.outstanding` nếu cùng nguồn — xác nhận bằng đọc code
      trước khi viết prefetch, không giả định) | cần xác nhận | — | — |

**Không** làm route reports/settle hoặc reports/void ở vòng P1 này — dữ liệu đó gắn với filter/param
động (kỳ quay, khoảng ngày) nên khó "prefetch đúng" khi mới hover (chưa biết param); để lại cho lần
sau nếu cần (không nằm trong scope P1 hiện tại).

## 3. Việc phải làm

### 3.1. Điểm treo prefetch — dùng chung timer với `p1-01`

`HoverPrefetchLink` (`p1-01`) chỉ đổi prop `prefetch`. Để thêm `prefetchQuery` cùng lúc, mở rộng
component (hoặc tạo biến thể) nhận thêm prop tuỳ chọn `onIntent`:

```tsx
// apps/backoffice/src/components/hover-prefetch-link.tsx — mở rộng từ bản p1-01

interface HoverPrefetchLinkProps extends LinkProps {
  children: React.ReactNode;
  className?: string;
  target?: string;
  /**
   * Gọi khi hover-intent kích hoạt (sau HOVER_DELAY_MS) — dùng để `queryClient.prefetchQuery`
   * data của route đích cùng lúc với prefetch shell. Optional — hầu hết link không cần.
   */
  onIntent?: () => void;
}

// Trong startTimer:
const startTimer = () => {
  timerRef.current = setTimeout(() => {
    setActive(true);
    onIntent?.();
  }, HOVER_DELAY_MS);
};
```

### 3.2. Áp dụng cho 4 route nóng trong `nav-main.tsx`

```tsx
// Ví dụ cho link "Operations Hub" của Bingo18 trong nav-main.tsx
import { useQueryClient } from "@tanstack/react-query";
import { bingo18Keys } from "@/lib/query-keys/bingo18";
import { fetchOpsHubSnapshot } from "@/app/(main)/games/bingo18/operations-hub/_lib/use-hub-query";
// ⚠️ Nếu fetchOpsHubSnapshot chưa export riêng (đang khai báo local trong use-hub-query.ts),
// tách nó ra thành named export trước — KHÔNG copy lại logic fetch (DRY, §5 code-quality-standards).

const qc = useQueryClient();

<HoverPrefetchLink
  href={item.url as Route}
  onIntent={() =>
    qc.prefetchQuery({
      queryKey: bingo18Keys.opsHub(),
      queryFn: fetchOpsHubSnapshot,
      staleTime: 10_000, // PHẢI khớp staleTime thật của useHubQuery — xem §4 cảnh báo
    })
  }
>
  ...
</HoverPrefetchLink>
```

Lặp lại cho Dashboard (4 query cùng lúc trong 1 `onIntent`), Keno Hub, Outstanding — mỗi route đúng
1 chỗ gọi trong `nav-main.tsx` (hoặc nơi chứa link tương ứng nếu không nằm trong sidebar chính).

### 3.3. Export lại `queryFn` nếu đang khai báo inline

Kiểm tra từng hook (`use-dashboard-queries.ts`, `use-hub-query.ts`, hook outstanding) — nếu `queryFn`
đang viết **inline** trong `useQuery({...})` (như `useDashboardDraws`/`useDashboardJackpots` hiện tại:
`queryFn: () => apiClient.get(...)`), tách thành function riêng có tên (`fetchDashboardDraws`,
`fetchDashboardJackpots`, …) rồi cả `useQuery` và `prefetchQuery` cùng gọi **1 hàm duy nhất** — tránh
2 bản logic fetch lệch nhau (DRY, đúng nguyên tắc §5 `code-quality-standards.mdc`).

## 4. ⚠️ Cảnh báo bắt buộc đọc — `staleTime` prefetch PHẢI khớp `staleTime` thật của hook

Đây là **rủi ro dữ liệu duy nhất** của plan này (câu hỏi #3 ở `00-overview.md` §4). Nếu
`queryClient.prefetchQuery({..., staleTime: X})` dùng `X` khác với `staleTime` thật khai báo trong
`useQuery` của hook đó:

- **`X` lớn hơn thật** → khi `useQuery` mount sau click, React Query thấy cache "còn tươi" theo TTL đã
  cấp lúc prefetch → **có thể trì hoãn** lần refetch đầu, hiện data cũ hơn *ý định thiết kế* của hook
  gốc trong vài giây/chục giây (Hub/live poll bị ảnh hưởng nhiều nhất vì `pollSeconds` là hợp đồng
  hiển thị "tick đúng nhịp" với vận hành viên).
- **`X` nhỏ hơn hoặc = 0** → an toàn hơn (query luôn coi là stale, tự refetch ngay khi mount dù đã có
  cache) nhưng **mất tác dụng UX** — vẫn thấy 1 nhịp loading ngắn khi mount vì background refetch chạy
  ngay (dù data cũ hiện tạm trong lúc chờ, đỡ hơn không có gì).

**Quy tắc bắt buộc:** `staleTime` truyền vào `prefetchQuery` phải **đọc trực tiếp từ chính hook** tại
thời điểm viết code (không hardcode số đoán) — ưu tiên **import hằng số chung** nếu hook đã có
(`DEFAULT_POLL_SECONDS` ở `use-hub-query.ts`) thay vì chép lại số `10_000`. Nếu hook dùng
function-form `staleTime: (q) => ...` (như `useHubQuery`), `prefetchQuery` **không** thể tái dùng
trực tiếp function đó (context khác — chưa có `query.state.data`) → dùng giá trị mặc định an toàn
nhất là **cùng `DEFAULT_POLL_SECONDS`** (giả định server chưa trả `pollSeconds` tu�ỳ biến, đây là input
hover đầu tiên nên hợp lý).

## 5. Test/Review

1. Với mỗi route trong §2: hover link tương ứng, đợi ≥ 100ms (kích hoạt `onIntent`), kiểm tra
   React Query Devtools — query key xuất hiện với status `fresh`/`success` **trước khi click**.
2. Click vào link đã hover — xác nhận trang hiện data **ngay lập tức**, không có skeleton nội bộ nào
   chớp qua (trước đây luôn có, vì `useQuery` mount lần đầu = chưa có cache).
3. **Test lệch staleTime (bắt buộc, đây là bài test chính của rủi ro §4):** hover 1 link, chờ CHÍNH
   XÁC lâu hơn `staleTime` thật của hook đó (ví dụ Hub: chờ > `pollSeconds` giây), rồi mới click →
   xác nhận trang **tự động refetch ngay khi mount** (Network tab thấy request mới), không hiển thị
   mãi data đã prefetch từ trước như dữ liệu "cuối cùng". So số hiển thị với gọi API trực tiếp
   (Postman/curl) tại đúng thời điểm — phải khớp.
4. Test hover nhiều route nóng liên tiếp trong thời gian ngắn (di chuột qua cả 4 mục) — Network tab
   không thấy quá 1 request/route trong khoảng `staleTime` của route đó.
5. `pnpm --filter @megawin/backoffice check-types` + `pnpm lint` xanh.
6. Grep xác nhận không có `queryFn` bị định nghĩa 2 lần cho cùng 1 query key (`rg "queryFn" -A2` trong
   4 file hook đã sửa, so khớp với chỗ gọi `prefetchQuery`).

## 6. Rủi ro tổng hợp & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| `staleTime` lệch → hiện data cũ hơn thiết kế vài giây trên màn Hub | 🟡 Trung — đã có test §5.3 bắt buộc | Đọc trực tiếp hằng số từ hook, không hardcode |
| Prefetch data cho route staff **không có quyền** xem (role-gated) | 🟢 Thấp — API route tự check quyền ở server, `prefetchQuery` fail thì React Query tự log lỗi, không hiện data sai | Không cần thêm check phía client — đã có sẵn ở tầng API |
| Tăng số request server khi nhiều staff hover đồng thời | 🟢 Thấp — đúng bằng số lần hover thật, không nhân bội | Theo dõi qua CloudWatch/log nếu cần sau rollout |

## 7. Rollback

Xoá prop `onIntent` khỏi các lời gọi `HoverPrefetchLink` ở 4 route (giữ nguyên hover-prefetch shell
từ `p1-01`). Không cần xoá `fetchXxx` đã export riêng — export thêm không hại, có thể giữ lại cho
lần sau. Không có migration.
